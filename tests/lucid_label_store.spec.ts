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
