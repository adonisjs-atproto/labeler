import { test } from '@japa/runner'
import { LabelStoreError, LucidLabelStore } from '../src/lucid_label_store.js'
import { setupApp, createLabelsTable, TestLabel } from './helpers.js'
import { toBytes } from '@atcute/cbor'
import { afterCreate } from '@adonisjs/lucid/orm'

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

test.group('LucidLabelStore.appendLabels', (group) => {
  let storeBuilder: () => LucidLabelStore
  let cleanup: () => Promise<void>

  group.each.setup(async () => {
    const { testUtils, app } = await setupApp()
    await createLabelsTable(testUtils)
    storeBuilder = () => new LucidLabelStore(async () => ({ default: TestLabel as any }))
    cleanup = async () => {
      await app.terminate()
    }
    return cleanup
  })

  test('empty array returns [] without DB I/O', async ({ assert }) => {
    const store = storeBuilder()
    const events = await store.appendLabels([])
    assert.deepEqual(events, [])
  })

  test('single label inserts one row and returns event with seq=1', async ({ assert }) => {
    const store = storeBuilder()
    const label = makeFakeSignedLabel({
      uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
      val: 'spam',
    })
    const events = await store.appendLabels([label])

    assert.lengthOf(events, 1)
    assert.equal(events[0].seq, 1)
    assert.deepEqual(events[0].labels, [label])

    const rows = await TestLabel.all()
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].uri, 'at://did:plc:abc/app.bsky.feed.post/xyz')
    assert.equal(rows[0].val, 'spam')
  })

  test('batch of N inserts N rows and returns N events with sequential seqs', async ({
    assert,
  }) => {
    const store = storeBuilder()
    const labels = [
      makeFakeSignedLabel({ val: 'a' }),
      makeFakeSignedLabel({ val: 'b' }),
      makeFakeSignedLabel({ val: 'c' }),
    ]
    const events = await store.appendLabels(labels)

    assert.lengthOf(events, 3)
    assert.deepEqual(
      events.map((e) => e.seq),
      [1, 2, 3]
    )
    assert.equal(events[0].labels[0].val, 'a')
    assert.equal(events[1].labels[0].val, 'b')
    assert.equal(events[2].labels[0].val, 'c')
  })
})

/**
 * Build a minimal SignedLabel for tests. Sig is dummy bytes — we don't
 * verify signatures in store tests (that's @atcute/labeler's job).
 */
function makeFakeSignedLabel(overrides: Partial<{ uri: string; val: string; src: string }>) {
  return {
    src: overrides.src ?? 'did:plc:labeler',
    uri: overrides.uri ?? 'at://did:plc:abc/app.bsky.feed.post/xyz',
    val: overrides.val ?? 'test-label',
    cts: '2026-05-01T00:00:00.000Z',
    sig: toBytes(new Uint8Array([1, 2, 3, 4])),
    ver: 1,
  } as any
}

test.group('LucidLabelStore.appendLabels rollback', (group) => {
  let store: LucidLabelStore
  let cleanup: () => Promise<void>

  group.each.setup(async () => {
    const { testUtils, app } = await setupApp()
    await createLabelsTable(testUtils)

    // Attach a hook that throws, simulating a consumer's audit hook failure.
    // Must re-declare the table name — Lucid derives it from the class name,
    // so subclasses do not inherit `static table` from the parent.
    class ThrowingLabel extends TestLabel {
      static override table = 'labels'

      @afterCreate()
      static throwAlways() {
        throw new Error('audit hook failed')
      }
    }
    store = new LucidLabelStore(async () => ({ default: ThrowingLabel as any }))
    cleanup = async () => {
      await app.terminate()
    }
    return cleanup
  })

  test('throws LabelStoreError when audit hook fails', async ({ assert }) => {
    const label = {
      src: 'did:plc:labeler',
      uri: 'at://x',
      val: 't',
      cts: '2026-05-01T00:00:00.000Z',
      sig: toBytes(new Uint8Array([1])),
      ver: 1,
    } as any

    await assert.rejects(() => store.appendLabels([label]), 'failed to append labels')

    try {
      await store.appendLabels([label])
      assert.fail('appendLabels should have thrown')
    } catch (err: any) {
      assert.instanceOf(err, LabelStoreError)
      assert.equal(err.name, 'LabelStoreError')
      assert.exists(err.cause)
      assert.equal((err.cause as Error).message, 'audit hook failed')
    }
  })

  test('rolls back the row when audit hook fails', async ({ assert }) => {
    const label = {
      src: 'did:plc:labeler',
      uri: 'at://x',
      val: 't',
      cts: '2026-05-01T00:00:00.000Z',
      sig: toBytes(new Uint8Array([1])),
      ver: 1,
    } as any

    await assert.rejects(() => store.appendLabels([label]))

    const rows = await TestLabel.all()
    assert.lengthOf(rows, 0)
  })
})

test.group('LucidLabelStore.getLatestSeq', (group) => {
  let store: LucidLabelStore
  let cleanup: () => Promise<void>

  group.each.setup(async () => {
    const { testUtils, app } = await setupApp()
    await createLabelsTable(testUtils)
    store = new LucidLabelStore(async () => ({ default: TestLabel as any }))
    cleanup = async () => {
      await app.terminate()
    }
    return cleanup
  })

  test('returns null when store is empty', async ({ assert }) => {
    const result = await store.getLatestSeq()
    assert.isNull(result)
  })

  test('returns max seq after inserts', async ({ assert }) => {
    await store.appendLabels([
      makeFakeSignedLabel({ val: 'a' }),
      makeFakeSignedLabel({ val: 'b' }),
      makeFakeSignedLabel({ val: 'c' }),
    ])
    const result = await store.getLatestSeq()
    assert.equal(result, 3)
  })
})
