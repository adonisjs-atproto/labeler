import { XrpcError } from '@thisismissem/adonisjs-atproto-xrpc'

export class FutureCursorXrpcError extends XrpcError {
  static override status = 400
  static override code = 'E_FUTURE_CURSOR'
  static override errorName = 'FutureCursor'
}
