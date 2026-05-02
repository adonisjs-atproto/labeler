import type { LabelStore } from '@atcute/labeler'
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

  async appendLabels(): Promise<never> {
    throw new Error('not implemented')
  }
  async getLatestSeq(): Promise<never> {
    throw new Error('not implemented')
  }
  async listLabelEvents(): Promise<never> {
    throw new Error('not implemented')
  }
}
