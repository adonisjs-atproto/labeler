export class LabelStoreError extends Error {
  override name = 'LabelStoreError'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}
