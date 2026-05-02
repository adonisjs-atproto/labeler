import { fromBytes, toBytes } from '@atcute/cbor'
import type { LabelEvent, LabelStore, SignedLabel } from '@atcute/labeler'
import type { LabelModel } from './types.js'

type LabelModelLoader = () => Promise<{ default: LabelModel }>

export class LabelStoreError extends Error {
  override name = 'LabelStoreError'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

export class LucidLabelStore implements LabelStore {
  #model: LabelModel | undefined
  readonly #loader: LabelModelLoader

  constructor(loader: LabelModelLoader) {
    this.#loader = loader
  }

  /**
   * Lazy model resolution mirroring the OAuthStore pattern. In dev (when
   * import.meta.hot is set), always re-resolve so hot-edited model classes
   * don't get pinned to a stale reference. In prod, the cached path is used.
   */
  async #getModel(): Promise<LabelModel> {
    if (this.#model && !('hot' in import.meta)) return this.#model
    const mod = await this.#loader()
    this.#model = mod.default
    return this.#model
  }

  /** @internal — exposed for tests; do not call in production code */
  async getModelForTest(): Promise<LabelModel> {
    return this.#getModel()
  }

  async appendLabels(labels: SignedLabel[]): Promise<LabelEvent[]> {
    if (labels.length === 0) return []
    const Label = await this.#getModel()

    let rows: InstanceType<LabelModel>[]
    try {
      // createMany auto-wraps in a managed transaction (verified in
      // @adonisjs/lucid build/src/orm/base_model/index.js:528-548).
      // Per-row @afterCreate hooks run inside that trx via label.$trx —
      // any throw rolls back the whole batch.
      rows = await Label.createMany(
        labels.map((label) => ({
          src: label.src,
          uri: label.uri,
          cid: label.cid ?? null,
          val: label.val,
          neg: label.neg ?? false,
          cts: label.cts,
          exp: label.exp ?? null,
          sig: fromBytes(label.sig),
          ver: label.ver ?? null,
        }))
      )
    } catch (err) {
      throw new LabelStoreError('failed to append labels', { cause: err })
    }

    // rows[i] corresponds to labels[i] — createMany pushes in input order
    // (verified at the same source location).
    return rows.map((row, i) => ({
      seq: row.seq,
      labels: [labels[i]],
    }))
  }

  async getLatestSeq(): Promise<number | null> {
    const Label = await this.#getModel()
    try {
      const row = await Label.query().select('seq').orderBy('seq', 'desc').first()
      return row?.seq ?? null
    } catch (err) {
      throw new LabelStoreError('failed to get latest seq', { cause: err })
    }
  }
  async listLabelEvents(options: { after?: number; limit?: number }): Promise<LabelEvent[]> {
    const { after, limit = 500 } = options // matches @atcute/labeler outbox default
    const Label = await this.#getModel()

    try {
      const rows = await Label.query()
        .orderBy('seq', 'asc')
        .if(after !== undefined, (q) => q.where('seq', '>', after!))
        .limit(limit)

      if (rows.length === 0) return []

      // Bundle up to `limit` rows into a single event with seq = highest row seq.
      // This is the intentional live/replay shape difference: live emits one
      // event per label (matching skyware/MemoryLabelStore), but replay bundles
      // for backfill efficiency. Subscribers iterate labels[] regardless;
      // total label data delivered is identical.
      return [
        {
          seq: rows[rows.length - 1].seq,
          labels: rows.map(hydrateSignedLabel),
        },
      ]
    } catch (err) {
      throw new LabelStoreError('failed to list label events', { cause: err })
    }
  }
}

function hydrateSignedLabel(row: InstanceType<LabelModel>): SignedLabel {
  // Reconstruct optional-field shape for sig-verifiable round-trip.
  // The original signed CBOR omitted optional fields when absent; including
  // `neg: false` or `cid: null` here would produce different CBOR bytes
  // and the sig would not verify on a downstream subscriber.
  return {
    // row.src/uri are validated DID/URI strings on write (via @atcute/labeler upstream);
    // these casts satisfy SignedLabel's branded template-literal types that string columns can't infer.
    src: row.src as `did:${string}:${string}`,
    uri: row.uri as `${string}:${string}`,
    val: row.val,
    cts: row.cts,
    sig: toBytes(row.sig),
    ...(row.cid !== null && { cid: row.cid }),
    ...(row.neg && { neg: true }),
    ...(row.exp !== null && { exp: row.exp }),
    ...(row.ver !== null && { ver: row.ver }),
  }
}

export function lucidLabelStore(loader: LabelModelLoader): LucidLabelStore {
  return new LucidLabelStore(loader)
}
