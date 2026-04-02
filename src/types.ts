import type { LucidModel } from '@adonisjs/lucid/types/model'

export type LabelModel = LucidModel & {
  new (): {}
}

export type StoreProvider = {
  labels: LabelModel
}

export type LabelerProviderConfig = {
  stores: StoreProvider
}
