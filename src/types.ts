import type { Secret } from '@adonisjs/core/helpers'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { ComAtprotoLabelDefs } from '@atcute/atproto'
import type { LabelStore } from '@atcute/labeler'

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

export type LabelerConfig = LabelerProviderConfig & {
  serviceDid: ComAtprotoLabelDefs.Label['src']
}
