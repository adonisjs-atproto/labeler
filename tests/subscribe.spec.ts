import { test } from '@japa/runner'
import { ComAtprotoLabelSubscribeLabels } from '@atcute/atproto'
import { MemoryLabelStore } from '@atcute/labeler'
import { injectXrpcSubscription } from '@thisismissem/adonisjs-atproto-xrpc/test_utils'
import { defaultLabelerConfig, setupWebApp } from './helpers.js'

test.group('LabelController.subscribe', () => {
  test('future cursor produces a FutureCursor error frame', async ({ assert }) => {
    const store = new MemoryLabelStore()
    const { nodeServer } = await setupWebApp({
      config: { atproto_labeler: defaultLabelerConfig(store) },
    })

    const sub = await injectXrpcSubscription(
      nodeServer,
      ComAtprotoLabelSubscribeLabels.mainSchema,
      { params: { cursor: 9999 } }
    )

    // The server sends the error frame then closes — iterable completes naturally.
    const frames = await Array.fromAsync(sub.messages())

    // If error handling is broken, atcute sends InternalServerError instead.
    assert.lengthOf(frames, 1)
    assert.equal(frames[0].type, 'error')
    if (frames[0].type === 'error') {
      assert.equal(frames[0].error, 'FutureCursor')
    }
    // ws sets _closeCode synchronously in receiverOnConclude before the close
    // event fires, so it's reliably readable after the iterable drains.
    assert.notEqual((sub.socket as any)._closeCode, 1011)
  })

  test('subscribing without a cursor connects and closes cleanly', async () => {
    const { nodeServer } = await setupWebApp()

    const sub = await injectXrpcSubscription(nodeServer, ComAtprotoLabelSubscribeLabels.mainSchema)

    await sub.close()
  })
})
