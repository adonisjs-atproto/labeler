import type { Secret } from '@adonisjs/core/helpers'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { ComAtprotoLabelDefs } from '@atcute/atproto'

export type LabelModel = LucidModel & {
  new (): {}
}

export type StoreProvider = {
  labels: LabelModel
}

export type LabelerProviderConfig = {
  serviceDid: string
  signingKey: Secret<string>
  store: {}
}

export type LabelerConfig = LabelerProviderConfig & {
  serviceDid: ComAtprotoLabelDefs.Label['src']
}
