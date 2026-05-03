/*
|--------------------------------------------------------------------------
| defineConfig spec
|--------------------------------------------------------------------------
|
| Validates the behavior of the package's `defineConfig()` helper. This
| is what consumers call from their `config/atproto_labeler.ts` and is
| where the runtime validation of signing key / serviceDid / store-shape
| lives. Each negative test pins one specific invariant that consumers
| have hit in the wild.
|
*/

import { test } from '@japa/runner'
import { Secret } from '@adonisjs/core/helpers'
import { MemoryLabelStore } from '@atcute/labeler'
import { InvalidArgumentsException } from '@adonisjs/core/exceptions'
import { defineConfig } from '../src/define_config.js'

const VALID_KEY = 'z42tngCsBgNjWWuyiXq5FgX8dviRTBSf9DqiA7fuWj3M9KRu'
const VALID_DID = 'did:web:labeler.test'

test.group('defineConfig', () => {
  test('returns a LabelerConfig for fully valid input', ({ assert }) => {
    const store = new MemoryLabelStore()
    const result = defineConfig({
      serviceDid: VALID_DID,
      signingKey: new Secret(VALID_KEY),
      store,
    })

    assert.equal(result.serviceDid, VALID_DID)
    assert.strictEqual(result.store, store)
    assert.instanceOf(result.signingKey, Secret)
  })

  test('throws when signingKey is not a valid multibase string', ({ assert }) => {
    assert.throws(() => {
      defineConfig({
        serviceDid: VALID_DID,
        signingKey: new Secret('not-a-multibase-key'),
        store: new MemoryLabelStore(),
      })
    })
  })

  test('throws InvalidArgumentsException when serviceDid is not a DID', ({ assert }) => {
    try {
      defineConfig({
        serviceDid: 'not-a-did',
        signingKey: new Secret(VALID_KEY),
        store: new MemoryLabelStore(),
      })
      assert.fail('defineConfig should have thrown')
    } catch (err: any) {
      assert.instanceOf(err, InvalidArgumentsException)
      assert.include(err.message, 'serviceDid')
    }
  })

  test('throws InvalidArgumentsException when store is null', ({ assert }) => {
    try {
      defineConfig({
        serviceDid: VALID_DID,
        signingKey: new Secret(VALID_KEY),
        store: null as any,
      })
      assert.fail('defineConfig should have thrown')
    } catch (err: any) {
      assert.instanceOf(err, InvalidArgumentsException)
      assert.include(err.message, 'LabelStore')
    }
  })

  test('throws InvalidArgumentsException when store is missing required methods', ({ assert }) => {
    // Single test covers all "method-not-a-function" branches; the throw
    // itself collapses them into one error path with one message.
    const partialStore = {
      appendLabels: async () => [],
      getLatestSeq: async () => null,
      // listLabelEvents intentionally omitted
    } as any

    try {
      defineConfig({
        serviceDid: VALID_DID,
        signingKey: new Secret(VALID_KEY),
        store: partialStore,
      })
      assert.fail('defineConfig should have thrown')
    } catch (err: any) {
      assert.instanceOf(err, InvalidArgumentsException)
      assert.include(err.message, 'LabelStore')
    }
  })
})
