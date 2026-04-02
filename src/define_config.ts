import type { LabelerProviderConfig } from './types.js'

export function defineConfig<T extends LabelerProviderConfig>(config: T): LabelerProviderConfig {
  return config
}
