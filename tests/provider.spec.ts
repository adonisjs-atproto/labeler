import { test } from '@japa/runner'
import { setupApp } from './helpers.js'

test.group('LabelerProvider lifecycle', () => {
  test('ready() short-circuits when environment is not "web"', async ({ assert }) => {
    let serviceMaterializations = 0

    // setupApp registers the labeler provider via rcFileContents and runs
    // the full AdonisJS lifecycle. The beforeReady hook fires between
    // app.boot() (where provider.boot() bound atproto.labeler.service) and
    // testUtils.boot() (where provider.ready() will fire). We rebind the
    // service singleton with a spy — if ready() short-circuits in non-web
    // env, the spy is never invoked. Without the env-check, ready() would
    // call container.make('atproto.labeler.service') and increment the
    // counter.
    const { app } = await setupApp(
      {},
      {
        beforeReady: (testApp) => {
          testApp.container.singleton('atproto.labeler.service', async () => {
            serviceMaterializations++
            return {} as any
          })
        },
      }
    )

    assert.notEqual(
      app.getEnvironment(),
      'web',
      'precondition: setupApp should not produce a "web" environment'
    )
    assert.equal(
      serviceMaterializations,
      0,
      'ready() must not materialize labeler service in non-web environments'
    )

    await app.terminate()
  })
})
