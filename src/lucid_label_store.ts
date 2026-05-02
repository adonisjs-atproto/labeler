import { fromBytes } from '@atcute/cbor'
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
  async listLabelEvents(): Promise<never> {
    throw new Error('not implemented')
  }
}
