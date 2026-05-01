# LucidLabelStore design

**Status:** Draft
**Date:** 2026-05-01
**Subject repo:** `@thisismissem/adonisjs-atproto-labeler` (this package)
**Consumer repo:** `simple-atproto-labeler`

## Summary

Add a Lucid-backed implementation of `@atcute/labeler`'s `LabelStore` interface to this package, replacing the hardcoded `MemoryLabelStore` currently wired into `providers/provider.ts`. The implementation is exposed via a `lucidLabelStore(loader)` factory (and a `LucidLabelStore` class for direct instantiation) on a new `/store` subpath, leaving the main package entry hermetic from `@adonisjs/lucid` so consumers using a custom store never load Lucid.

## Context

The package currently boots with `store: new MemoryLabelStore()` hardcoded in the provider — labels survive only as long as the process. To deliver real persistence, we need a Lucid-backed store that:

1. Implements `LabelStore`'s `appendLabels`, `getLatestSeq`, `listLabelEvents` against a SQL database.
2. Writes per-label rows atomically alongside any consumer-side `@afterCreate` hooks (e.g., audit log).
3. Survives HMR cleanly during dev, mirroring the OAuth package's lazy-model-resolution pattern.

The consumer (`simple-atproto-labeler`) uses moderator-driven label application via a controller, and needs an audit trail recording *who* applied each label. The audit log itself lives consumer-side (out of scope for this package) but the package must support a model `@afterCreate` hook firing inside the store's transaction.

## Out of scope

- Subscribe handler / WebSocket frame encoder — separate component, not touched here.
- `advanceSeq()` extension method (skipping seqs explicitly) — `MemoryLabelStore`-specific helper, not part of `LabelStore` interface; consumers can use raw SQL if needed.
- Vitest migration — tracked separately (see project memory `project_vitest_migration_future.md`); use Japa for this work.
- Subclasses of `LabelStoreError` (per-operation discrimination) — single class with `cause` chain is sufficient. Can be added later without breaking the `instanceof` check.
- Multi-label-per-event batching on the live emission path — see "Decisions explored and rejected" below.

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│ Consumer's controller (simple-atproto-labeler)               │
│   labeler.applyLabel({ uri, value })                         │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│ @atcute/labeler  Labeler.applyLabels                         │
│   1. buildLabels (drafts)                                    │
│   2. Promise.all(signLabel)                                  │
│   3. store.appendLabels(signed)  ◄── LucidLabelStore         │
│   4. emit each event to subscribers                          │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│ LucidLabelStore.appendLabels   (this package, /store)        │
│   Label.createMany(rows)  ── opens managed Lucid trx         │
│     each row triggers @afterCreate                           │
│       └─► consumer's audit hook writes LabelAudit row        │
│           inside the same trx (via label.$trx)               │
│   throws LabelStoreError on any failure (rolls back)         │
└──────────────────────────────────────────────────────────────┘
```

Key invariants:
- One label = one row in `labels` table = one `seq` (autoincrement PK).
- Live emission produces N events for a batch of N labels (each with its own seq), matching `MemoryLabelStore` and skyware-js semantics.
- Replay (`listLabelEvents`) bundles up to `limit` rows (default 500) into a single event with `seq = highest seq in bundle` for backfill efficiency.
- Subscribers see consistent total label data across live and replay paths; only event boundaries differ.

## Package surface

### File layout (`src/`)

```
src/
├── lucid_label_store.ts        ← LucidLabelStore + lucidLabelStore + LabelStoreError
├── types.ts                    ← extended with LabelModel; StoreProvider removed
├── define_config.ts            ← unchanged (validates serviceDid + signingKey)
├── middleware.ts               ← unchanged (no-op stub)
├── framing.ts                  ← unchanged
stubs/
├── migrations/labels.stub      ← REPLACED (currently a broken oauth_sessions copy-paste)
├── models/labels.stub          ← REPLACED (currently empty BaseModel)
├── config.stub                 ← MODIFIED (fill in store: with useLucid branches)
configure.ts                    ← uncomment migration codemod, gate Lucid stubs on useLucid
package.json                    ← add ./store export, bump @adonisjs/lucid peerDep, mark optional
```

### `package.json` changes

```jsonc
{
  "exports": {
    ".": "./build/index.js",
    "./provider": "./build/providers/provider.js",
    "./service": "./build/services/labeler.js",
    "./store": "./build/src/lucid_label_store.js",      // NEW
    "./types": "./build/src/types.js"
  },
  "peerDependencies": {
    "@adonisjs/core": "^7.0.1",
    "@adonisjs/lucid": "^22.4.0"                         // bumped from ^22.1.0
  },
  "peerDependenciesMeta": {
    "@adonisjs/lucid": { "optional": true }              // NEW — keeps main entry hermetic
  },
  "devDependencies": {
    "@adonisjs/lucid": "^22.4.0"                         // bumped from ^22.1.0
  }
}
```

The `./store` subpath is the *only* place we import from `@adonisjs/lucid`. Consumers using `MemoryLabelStore` (or a custom store) never trigger the Lucid module load.

The Lucid version bump from `^22.1.0` → `^22.4.0` enforces that consumers have a Lucid recent enough that the schema generator's non-`id` PK detection works for our `seq` primary key.

### Main entry exports (`./`)

```ts
export { defineConfig } from './define_config.ts'
export type { LabelerProviderConfig, LabelModel } from './types.ts'
export { MemoryLabelStore, LabelerError, FutureCursorError, ConsumerTooSlowError } from '@atcute/labeler'
export type { LabelStore, LabelEvent, LabelOp, SignedLabel } from '@atcute/labeler'
// NOTE: LucidLabelStore + lucidLabelStore + LabelStoreError live in /store
```

### `/store` subpath exports

```ts
export { LucidLabelStore, lucidLabelStore, LabelStoreError }
```

Both class and factory are exported — class for direct instantiation in tests, factory for the canonical config-time call.

## Migration and model stub

### `stubs/migrations/labels.stub`

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'labels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('seq')                    // PK + LabelEvent.seq, autoincrement (never reused)
      table.text('src').notNullable()            // labeler service DID
      table.text('uri').notNullable()            // AT-URI of subject
      table.text('cid').nullable()               // optional record CID
      table.string('val', 128).notNullable()     // label value, lexicon @maxLength 128
      table.boolean('neg').notNullable().defaultTo(false)
      table.text('cts').notNullable()            // ISO 8601 string — preserved byte-for-byte for sig
      table.text('exp').nullable()               // ISO 8601 optional expiry, ditto
      table.binary('sig').notNullable()          // raw signature bytes (BLOB)
      table.integer('ver').nullable()            // atproto label object version (currently 1)
      table.index(['uri', 'val'], 'labels_uri_val_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

**Why `text` for `cts`/`exp`:** The signature (`sig`) was computed over the *exact* `cts` string in the original CBOR encoding. Storing as `@column.dateTime()` would parse-and-reformat through Luxon's `DateTime`, mutating sub-second precision or timezone notation and invalidating the signature on later verification. Raw `text` preserves the bytes.

**Why `binary` for `sig`:** SQLite has a native `bytes` type (BLOB); the `BytesWrapper` from `@atcute/cbor` is a JSON-encoding adapter, not a storage format. Storing raw bytes (~64-72 bytes per signature) is smaller than base64 (~88-96 bytes), and matches the skyware-js/labeler precedent so anyone running a skyware labeler could in principle point our store at their existing SQLite file.

**Why `cid` is `text` not `varchar(N)`:** The atproto spec only constrains the *binary* CID encoding (`MAX_CID_BYTES = 100`). String encoding is base32-with-`b`-prefix, ~60 chars typical / ~162 chars worst-case. SQLite ignores the length on `varchar` anyway; `text` future-proofs against the informal byte-cap being relaxed.

### `stubs/models/labels.stub`

```ts
import { LabelSchema } from '#database/schema'
import { computed } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class Label extends LabelSchema {
  @computed()
  get createdAt(): DateTime {
    return DateTime.fromISO(this.cts)
  }

  @computed()
  get expiresAt(): DateTime | null {
    return this.exp ? DateTime.fromISO(this.exp) : null
  }
}
```

The AdonisJS 7 schema generator (`indexEntities`) auto-produces `LabelSchema` from the migration with all column declarations and `static primaryKey = 'seq'` baked in. The consumer's model only needs to add the two computed Luxon getters — derived properties that don't disturb the byte-for-byte preservation of the signed `cts`/`exp` strings.

`@computed()` properties appear in `toJSON()` output. Consumers serializing labels for HTTP responses will see *both* `cts: "2026-05-01T..."` and `createdAt: "2026-05-01T..."` — same value, two keys. Use Lucid's `serializeAs: null` or pick specific columns in the serializer to suppress one if a clean wire shape is needed.

### `stubs/config.stub`

```handlebars
{{{
  exports({ to: app.configPath('atproto_labeler.ts') })
}}}
import { defineConfig } from '@thisismissem/adonisjs-atproto-labeler'
{{#if useLucid }}
import { lucidLabelStore } from '@thisismissem/adonisjs-atproto-labeler/store'
{{#else}}
import { MemoryLabelStore } from '@thisismissem/adonisjs-atproto-labeler'
{{/if}}
import env from '#start/env'

export default defineConfig({
  serviceDid: env.get('ATPROTO_LABELER_DID'),
  signingKey: env.get('ATPROTO_LABELER_SIGNING_KEY'),
{{#if useLucid }}
  store: lucidLabelStore(() => import('#models/label')),
{{#else}}
  store: new MemoryLabelStore(),
{{/if}}
})
```

The stub uses Tempura (the templating engine bundled with `@adonisjs/application`). Note that `store` is a flat field — no `{ labels: ... }` wrapper, since we have a single store (not multiple like OAuth's `state` + `session`).

### `configure.ts`

The existing file already prompts for `useLucid` (`command.prompt.confirm(...)`) and renders `config.stub`. The Lucid migration + model codemods are *commented out* (lines 59-69) and need to be uncommented:

```ts
// Already in place — keep:
const useLucid = await command.prompt.confirm(`Do you want to use Lucid for storing Labels?`, {
  default: true,
})

// Already in place — keep:
await codemods.makeUsingStub(stubsRoot, 'config.stub', { useLucid })

// CHANGE: uncomment and verify these (currently lines 59-69 are commented out):
if (useLucid) {
  await codemods.makeUsingStub(stubsRoot, 'migrations/labels.stub', {
    entity: command.app.generators.createEntity('labels'),
    migration: {
      folder: 'database/migrations',
      fileName: `${new Date().getTime()}_create_labels_table.ts`,
    },
  })
  await codemods.makeUsingStub(stubsRoot, 'models/labels.stub', {
    entity: command.app.generators.createEntity('labels'),
  })
}
```

The Lucid stubs (migration + model) are gated on the user opting in via `useLucid: true`. A consumer answering "no" gets only `config.stub` (with the `MemoryLabelStore` branch) and never imports `@adonisjs/lucid` — preserving the optional-peerDep contract.

## `LucidLabelStore` implementation (`src/lucid_label_store.ts`)

```ts
import { fromBytes, toBytes } from '@atcute/cbor'
import type { LabelEvent, LabelStore, SignedLabel } from '@atcute/labeler'
import type { LabelModel } from './types.ts'

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

  async #getModel(): Promise<LabelModel> {
    // Mirror OAuthStore's HMR escape: in dev, re-resolve so hot-edited model
    // classes don't get pinned to a stale reference. In prod (no
    // `import.meta.hot`), the cached path is used.
    if (this.#model && !('hot' in import.meta)) return this.#model
    const mod = await this.#loader()
    this.#model = mod.default
    return this.#model
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
    const { after, limit = 500 } = options    // matches @atcute/labeler outbox default
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
      return [{
        seq: rows[rows.length - 1].seq,
        labels: rows.map(hydrateSignedLabel),
      }]
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
    src: row.src,
    uri: row.uri,
    val: row.val,
    cts: row.cts,
    sig: toBytes(row.sig),
    ...(row.cid !== null && { cid: row.cid }),
    ...(row.neg && { neg: true }),
    ...(row.exp !== null && { exp: row.exp }),
    ...(row.ver !== null && { ver: row.ver }),
  }
}

export function lucidLabelStore(loader: LabelModelLoader): LabelStore {
  return new LucidLabelStore(loader)
}
```

### Behavior summary

| Method | Semantics |
|---|---|
| `appendLabels([])` | Returns `[]` immediately, no DB I/O. |
| `appendLabels([L])` | One row inserted, returns `[{ seq: N, labels: [L] }]`. |
| `appendLabels([L1, L2, L3])` | Three rows inserted via `createMany` (managed trx); returns `[{ seq: N, labels: [L1] }, { seq: N+1, labels: [L2] }, { seq: N+2, labels: [L3] }]`. Each label gets its own seq and its own event — matches skyware/MemoryLabelStore live emission. |
| `appendLabels` audit-hook throws | Trx rolls back, no labels persisted; throws `LabelStoreError` with `cause` set to the underlying exception. |
| `getLatestSeq()` empty | Returns `null` (handled correctly by `Labeler.subscribeLabels`: coalesced to 0, future-cursor check works). |
| `getLatestSeq()` populated | Returns `MAX(seq)` from `labels`. |
| `listLabelEvents({ after: N })` | Returns rows with `seq > N`, bundled into one event with `seq = highest seq in bundle`, up to `limit` rows. |
| `listLabelEvents({})` | Default `limit = 500` (matches outbox `pageSize`). |

### Live / replay shape difference (deliberate)

- **Live:** N labels per `appendLabels` → N events emitted to subscribers, each with one label.
- **Replay (`listLabelEvents`):** Up to 500 rows per call → 1 event with up to 500 labels, `seq = max seq in bundle`.

Two subscribers reading the same total set of labels may observe different event counts depending on whether they were live during emission or backfilling later. The label *data* delivered is identical; only event boundaries differ. Subscribers iterate `labels[]` regardless, so this is wire-compatible with both shapes. The outbox dedup logic (`outbox.ts:95`) compares event seqs and works correctly because seqs are unique and monotonic across both paths.

### `sig` round-tripping

- **Persistence:** `fromBytes(label.sig)` unwraps `BytesWrapper` → raw `Uint8Array` → SQLite BLOB. `fromBytes` handles both `BytesWrapper` instances and plain `{ $bytes: "..." }` objects.
- **Hydration:** `toBytes(row.sig)` re-wraps the BLOB. `Buffer extends Uint8Array` so `better-sqlite3`'s Buffer return works without conversion.
- **Pass-through within `appendLabels`:** the original `label.sig` reference is reused — wrapper already correct, no need to round-trip.

## Type definitions and provider wiring

### `src/types.ts` final shape

```ts
import type { Did } from '@atcute/lexicons/syntax'
import type { PrivateKey } from '@atcute/crypto'
import type { LabelStore } from '@atcute/labeler'
import type { LucidModel } from '@adonisjs/lucid/types/model'

// Strict structural constraint matching our migration's columns.
// Consumers passing a Label model that doesn't match these columns get a
// TypeScript error at lucidLabelStore(...) call time, not a runtime SQL error.
export type LabelModel = LucidModel & {
  new (): {
    seq: number
    src: string
    uri: string
    cid: string | null
    val: string
    neg: boolean
    cts: string
    exp: string | null
    sig: Uint8Array     // Buffer extends Uint8Array, so works with better-sqlite3
    ver: number | null
  }
}

// REMOVED: StoreProvider — was a vestigial wrapper from when we considered
// multi-store config (à la OAuth's state + session). Single store, so flat field.

export interface LabelerProviderConfig {
  serviceDid: Did
  signingKey: PrivateKey
  store: LabelStore
}
```

### `providers/provider.ts` change

Replace the hardcoded `MemoryLabelStore` (currently at line 48) with the configured store:

```ts
new Labeler({
  serviceDid: config.serviceDid,
  signingKey: config.signingKey,
  store: config.store,    // pass through whatever defineConfig accepted
})
```

### `define_config.ts`

Already validates `serviceDid` and `signingKey`. Add a shape check that `store` exists and implements the required methods:

```ts
if (typeof store?.appendLabels !== 'function'
    || typeof store?.getLatestSeq !== 'function'
    || typeof store?.listLabelEvents !== 'function') {
  throw new Error('atproto labeler config: `store` must implement the LabelStore interface')
}
```

## Consumer-side audit log integration (informational)

This section describes what the consumer (`simple-atproto-labeler`) does with the package — it lives in the consumer repo, not this package. Documented here so the package's design choices are grounded in a concrete usage.

### Prereq: enable AsyncLocalStorage

In the consumer's `config/app.ts`:

```ts
useAsyncLocalStorage: true,   // was: false
```

Without this, `HttpContext.get()` returns `undefined` inside the model hook even on real HTTP requests, and every label silently attributes to the system user. No exception is thrown — the bug is invisible without a regression test.

### `LabelAudit` schema (consumer-side)

```ts
this.schema.createTable('label_audit', (table) => {
  table.increments('id')
  table.integer('label_seq').unsigned().notNullable()
    .references('seq').inTable('labels').onDelete('CASCADE')
  table.integer('applied_by').notNullable()
    .references('id').inTable('users').onDelete('RESTRICT')
  // applied_by = -1 means "system action" (ace command, background job)
  table.timestamp('created_at').notNullable().defaultTo(this.now())
  table.index(['applied_by', 'created_at'], 'label_audit_moderator_recent_index')
})
```

### System user seed (consumer-side)

```ts
// app/models/user.ts — add to existing User class
export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static readonly SYSTEM_USER_ID = -1 as const
}
```

```ts
// migration that runs BEFORE label_audit migration
async up() {
  const unusablePassword = crypto.randomBytes(32).toString('base64')
  await this.db.from('users').insert({
    id: User.SYSTEM_USER_ID,
    email: 'system@atproto.local',
    password: await hash.make(unusablePassword),
    full_name: 'System',
    created_at: this.now(),
    updated_at: this.now(),
  })
}
```

### `@afterCreate` audit hook on Label (consumer-side)

```ts
@afterCreate()
static async writeAuditEntry(label: Label) {
  const ctx = HttpContext.get()
  const userId = ctx?.auth?.user?.id ?? User.SYSTEM_USER_ID

  await LabelAudit.create(
    { labelSeq: label.seq, appliedBy: userId },
    { client: label.$trx }    // bind audit insert to the same trx
  )
}
```

### Atomicity chain

1. Controller calls `labeler.applyLabel(...)` (or `applyLabels(...)`).
2. `Labeler` signs and calls `store.appendLabels(signed)`.
3. `LucidLabelStore.appendLabels` calls `Label.createMany(...)` — Lucid opens a managed trx.
4. Per-row `@afterCreate` fires inside that trx; `label.$trx` is bound.
5. `LabelAudit.create({...}, { client: label.$trx })` writes the audit row in the same trx.
6. If audit insert fails → throws → escapes `createMany` → trx rolls back → label row also rolled back → store wraps in `LabelStoreError` → controller sees rejection.

If the audit hook throws, **no labels are persisted and no events are emitted.** This is the "audit is mandatory" semantic.

### `start/labeler.ts` becomes deletable

The temporary `setInterval` test scaffolding has no remaining purpose once the controller wires real `applyLabel` calls. Drop the file and remove its entry from `adonisrc.ts`'s `preloads`.

## Testing strategy

### Package tests (this repo)

**Framework:** Japa (already configured in `bin/test.ts`). Vitest is a separate future effort — see project memory `project_vitest_migration_future.md`.

**Bootstrap pattern:** Mirror `~/Development/git/github.com/thisismissem/adonisjs-respond-with/tests/helpers.ts` — uses `IgnitorFactory().withCoreProviders().withCoreConfig().merge(parameters)` together with `TestUtilsFactory` to bootstrap a real-but-isolated AdonisJS app per test, in a `tmp/` working directory. Accepts a `merge()` config so tests override only what they vary (e.g., point database at in-memory SQLite). See reference memory `reference_adonisjs_package_test_pattern.md`.

**What to test:**

| Group | Cases |
|---|---|
| `appendLabels` | empty array → `[]`; single label → 1 event w/ seq=1; batch of N → N events, seqs 1..N; audit-hook throws → trx rolls back, throws `LabelStoreError`; `cause` chain preserved |
| `getLatestSeq` | empty store → `null`; after N inserts → returns N |
| `listLabelEvents` | empty → `[]`; default limit (500) bundles up to 500 rows into 1 event with seq=highest; explicit `limit=10` honors caller; `after=N` returns rows with seq > N; ordering is `seq ASC` |
| Round-trip fidelity | Insert label with `neg=true`/`cid`/`exp`/`ver` set → `listLabelEvents` returns `SignedLabel` with same fields present; insert without those → returned `SignedLabel` has them *absent* (not null/false). Critical for sig verification. |
| Lazy model resolution | First call invokes loader; second call uses cached `#model`; HMR escape (mock `'hot' in import.meta`) → re-resolves |
| `LabelStoreError` shape | `instanceof LabelStoreError`, `.name === 'LabelStoreError'`, `.cause` is the underlying Lucid exception |

**What NOT to test:**

- `@atcute/labeler`'s outbox/subscribe behavior — upstream's job.
- Sig verification logic — covered by `@atcute/labeler` tests.
- Lucid's `createMany` transactionality — Lucid tests cover that.

### Consumer tests (`simple-atproto-labeler`)

**Layer 1: Functional (controller → labeler → DB chain)**

```ts
test('moderator action creates Label and LabelAudit rows atomically', async ({ client, assert }) => {
  const moderator = await UserFactory.create()
  const response = await client.post('/moderation/labels')
    .loginAs(moderator)
    .form({ uri: 'at://did:plc:abc/app.bsky.feed.post/xyz', value: 'spam' })

  response.assertRedirect()

  const label = await Label.findByOrFail('uri', 'at://did:plc:abc/app.bsky.feed.post/xyz')
  const audit = await LabelAudit.findByOrFail('labelSeq', label.seq)
  assert.equal(audit.appliedBy, moderator.id)
})
```

**Layer 2: System-user fallback (non-HTTP context)**

```ts
test('label created outside HTTP context attributes to SYSTEM_USER_ID', async ({ assert }) => {
  const labeler = await app.container.make('atproto.labeler.service')
  const signed = await labeler.applyLabel({ uri: 'at://...', value: 'spam' })

  const audit = await LabelAudit.findByOrFail('labelSeq', signed.seq)
  assert.equal(audit.appliedBy, User.SYSTEM_USER_ID)
})
```

**Layer 3: Audit-hook atomicity (regression)**

Stub `LabelAudit.create` to throw; call `labeler.applyLabel`; assert it throws `LabelStoreError` and no `Label` row exists.

## Decisions explored and rejected

These are documented because they came up during brainstorming and are likely to come up again:

### Multi-label-per-event live emission

**Rejected.** We considered grouping labels from one `appendLabels` batch into a single event with shared seq (matching the lexicon's multi-label frame capability). Investigation showed:

- `MemoryLabelStore` emits one label per event with a unique seq per label.
- `skyware-js/labeler` does the same.
- Subscribers in the wild are built against the per-label-per-event shape.

Conformance to the existing convention beats the lexicon's theoretical flexibility. We keep the per-label live shape (one event per label, unique seq per row) for substitutability with both `MemoryLabelStore` and skyware deployments. We *do* bundle on replay for backfill efficiency — that's tolerable because subscribers iterate `labels[]` regardless, and seqs remain unique and monotonic.

### One-table vs two-table schema (with `label_events`)

**Rejected the two-table option.** Once we settled on per-label live emission, the two-table design (`label_events` + `labels` with FK) provided no benefits — `seq` is just the autoincrement PK on `labels`, and there's no batching to model relationally. Single table with `seq` as PK is the simpler design.

### Per-operation `LabelStoreError` subclasses

**Rejected.** No concrete consumer code branches on "was this an append vs a list failure," and operation context is already evident from the message string and call stack. The native `Error.cause` chain (ES2022) preserves the underlying `LucidException` for anyone who wants to inspect it. We can introduce subclasses later without breaking `instanceof LabelStoreError` checks.

### Wrapping the audit table in this package

**Rejected.** `LabelAudit` is a consumer concern (moderator provenance), not protocol-level state. Mixing it into the package would couple the package to a specific identity model (`users.id`, AdonisJS auth, etc.) and prevent reuse in deployments with different auth backends. Keeping the audit consumer-side via `@afterCreate` lets the package stay agnostic.

## Prerequisites and migration notes

- Bump `@adonisjs/lucid` peerDep + devDep from `^22.1.0` to `^22.4.0` (in this package's `package.json`). Consumer (`simple-atproto-labeler`) is already on `^22.4.0`.
- Verify the schema generator emits a correct `LabelSchema` with `seq` as `static primaryKey` after running the migration. (Was historically broken for non-`id` PKs in older Lucid; should be fixed in 22.4.x.)
- For the consumer: enable `useAsyncLocalStorage: true` in `config/app.ts` *before* wiring the audit hook, otherwise `HttpContext.get()` silently returns `undefined` and every label attributes to the system user.

## References

- `@atcute/labeler` — upstream package providing `Labeler`, `LabelStore` interface, `MemoryLabelStore`.
- `@thisismissem/adonisjs-atproto-oauth` — yalc-extracted sibling package, source of the lazy-model-resolution + HMR-escape pattern this design mirrors.
- `~/Development/git/github.com/thisismissem/adonisjs-respond-with` — reference for AdonisJS package test bootstrapping with `IgnitorFactory` + `TestUtilsFactory`.
- `skyware-js/labeler` — independent JS labeler implementation, used as wire-compatibility reference.
- atproto label spec: <https://atproto.com/specs/label>
- atproto data validation: <https://atproto.com/guides/data-validation#recommended-data-limits>
