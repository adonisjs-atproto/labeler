import type { Secret } from '@adonisjs/core/helpers'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { ComAtprotoLabelDefs } from '@atcute/atproto'
import type { P256PrivateKey, Secp256k1PrivateKey, FoundPrivateKey } from '@atcute/crypto'
import type { LabelStore } from '@atcute/labeler'

/** Imported, ready-to-sign atproto private key (either supported curve). */
export type SigningKey = P256PrivateKey | Secp256k1PrivateKey

/**
 * Strict structural constraint for the Lucid model that backs LucidLabelStore.
 *
 * Consumers passing a Label model that doesn't match these columns get a
 * TypeScript error at lucidLabelStore(...) call time, not a runtime SQL error.
 *
 * `sig` is declared as Uint8Array. better-sqlite3 returns Buffer for binary
 * columns, but Buffer extends Uint8Array, so structural typing accepts it.
 */
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
    sig: Uint8Array
    ver: number | null
  }
}

export type LabelerProviderConfig = {
  serviceDid: string
  signingKey: Secret<string>
  store: LabelStore
}

/**
 * What `defineConfig` returns and what lives in `app.config`. The signing
 * key is parsed (`{ type, privateKeyBytes }`) but not yet imported into a
 * curve-specific PrivateKey instance — that happens once in the provider's
 * container factory.
 */
export type LabelerConfig = {
  serviceDid: ComAtprotoLabelDefs.Label['src']
  signingKey: Secret<FoundPrivateKey>
  store: LabelStore
}

/**
 * What `container.make('atproto.labeler.config')` yields. The signing key
 * has been hydrated into a real `P256PrivateKey` / `Secp256k1PrivateKey`
 * via `importRaw`. Consumers reading the config from the container get
 * this shape; consumers reading from `app.config` directly get
 * `LabelerConfig` (the un-hydrated form).
 */
export type LabelerRuntimeConfig = {
  serviceDid: ComAtprotoLabelDefs.Label['src']
  signingKey: Secret<SigningKey>
  store: LabelStore
}
