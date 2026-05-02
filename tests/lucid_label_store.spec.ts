import { test } from '@japa/runner'
import { LabelStoreError } from '../src/lucid_label_store.js'

test.group('LabelStoreError', () => {
  test('has name "LabelStoreError"', ({ assert }) => {
    const err = new LabelStoreError('boom')
    assert.equal(err.name, 'LabelStoreError')
  })

  test('extends Error', ({ assert }) => {
    const err = new LabelStoreError('boom')
    assert.instanceOf(err, Error)
    assert.instanceOf(err, LabelStoreError)
  })

  test('preserves cause via Error.cause chain', ({ assert }) => {
    const inner = new Error('underlying')
    const err = new LabelStoreError('outer', { cause: inner })
    assert.equal(err.cause, inner)
  })

  test('message is preserved', ({ assert }) => {
    const err = new LabelStoreError('specific message')
    assert.equal(err.message, 'specific message')
  })
})

import { LucidLabelStore } from '../src/lucid_label_store.js'

test.group('LucidLabelStore lazy model resolution', () => {
  test('does not invoke loader at construction time', ({ assert }) => {
    let loaderCalls = 0
    new LucidLabelStore(async () => {
      loaderCalls++
      return { default: {} as any }
    })
    assert.equal(loaderCalls, 0)
  })

  test('caches resolved model in production (no import.meta.hot)', async ({ assert }) => {
    let loaderCalls = 0
    const fakeModel = { fake: true } as any
    const store = new LucidLabelStore(async () => {
      loaderCalls++
      return { default: fakeModel }
    })

    // Internal probe — see Step 3 for the getModelForTest method
    const probe = store as any
    await probe.getModelForTest()
    await probe.getModelForTest()
    assert.equal(loaderCalls, 1)
  })
})
