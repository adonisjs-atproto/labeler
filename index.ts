/*
|--------------------------------------------------------------------------
| Package entrypoint
|--------------------------------------------------------------------------
|
| Re-exports things that don't pull in @adonisjs/lucid. Lucid-coupled exports
| (LucidLabelStore, lucidLabelStore, LabelStoreError) live in the /store
| subpath so consumers using a custom store never load Lucid.
|
*/

export { configure } from './configure.js'
export { stubsRoot } from './stubs/main.ts'
export { defineConfig } from './src/define_config.js'

// Re-export non-Lucid bits from @atcute/labeler so consumers don't need a direct dep:
export {
  MemoryLabelStore,
  LabelerError,
  FutureCursorError,
  ConsumerTooSlowError,
} from '@atcute/labeler'
export type { LabelStore, LabelEvent, LabelOp, SignedLabel } from '@atcute/labeler'

// Re-export package-local types:
export type { LabelerProviderConfig, LabelerConfig, LabelModel } from './src/types.js'
