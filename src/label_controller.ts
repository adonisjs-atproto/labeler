import type { ComAtprotoLabelQueryLabels, ComAtprotoLabelSubscribeLabels } from '@atcute/atproto'
import { FutureCursorError } from '@atcute/labeler'
import { type XrpcContext } from '@thisismissem/adonisjs-atproto-xrpc'
import { FutureCursorXrpcError } from './errors.ts'
import labeler from '../services/labeler.ts'

export default class LabelController {
  async list({ response, params, logger }: XrpcContext<ComAtprotoLabelQueryLabels.mainSchema>) {
    logger.debug(params)
    response.json({ labels: [] })
  }

  async *subscribe({
    params,
    stream,
    signal,
    logger,
  }: XrpcContext<ComAtprotoLabelSubscribeLabels.mainSchema>) {
    try {
      for await (const event of labeler.subscribeLabels({
        cursor: params.cursor,
        signal: signal,
      })) {
        logger.debug(event, 'label')
        yield stream.message('#labels', event)
      }
    } catch (error) {
      if (error instanceof FutureCursorError) {
        throw new FutureCursorXrpcError('cursor is in the future')
      }
      throw error
    }
  }
}
