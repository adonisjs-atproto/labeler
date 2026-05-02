import { test } from '@japa/runner'
import { setupApp } from './helpers.js'
import LabelerProvider from '../providers/provider.js'
import { Labeler } from '@atcute/labeler'

test.group('LabelerProvider lifecycle', () => {
  test('ready() short-circuits when environment is not "web"', async ({ assert }) => {
    let serviceMaterializations = 0

    // setupApp registers the labeler provider via rcFileContents and runs
    // the AdonisJS init/boot lifecycle. testUtils.boot() does NOT fire
    // provider.ready() — that happens during app.start() (web mode) or
    // ace command bootstrap. To exercise ready() we instantiate the
    // provider against the real app and invoke ready() directly.
    //
    // The swap is registered before our explicit ready() call, so if
    // ready() reaches container.make(Labeler), the swap factory fires
    // and increments the counter.
    const { app } = await setupApp(
      {},
      {
        beforeReady: (testApp) => {
          testApp.container.swap(Labeler, async () => {
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

    const provider = new LabelerProvider(app)
    await provider.ready()

    assert.equal(
      serviceMaterializations,
      0,
      'ready() must not materialize labeler service in non-web environments'
    )

    await app.terminate()
  })

  test('ready() does not log "Failed to acquire server" in non-web env', async ({ assert }) => {
    const errors: string[] = []

    // Replace the 'logger' binding with a capturing stub. The provider's
    // ready() resolves logger via container.make('logger') and would call
    // logger.error(...) if the env-gate were missing.
    const captureLogger: any = {
      error: (msgOrObj: any) => {
        const msg = typeof msgOrObj === 'string' ? msgOrObj : (msgOrObj?.msg ?? String(msgOrObj))
        errors.push(msg)
      },
      warn: () => {},
      info: () => {},
      debug: () => {},
      fatal: () => {},
      trace: () => {},
    }
    captureLogger.child = () => captureLogger

    const { app } = await setupApp(
      {},
      {
        beforeReady: (testApp) => {
          testApp.container.singleton('logger', () => captureLogger)
        },
      }
    )

    assert.notEqual(app.getEnvironment(), 'web')

    // Invoke ready() directly since testUtils.boot() doesn't fire it.
    const provider = new LabelerProvider(app)
    await provider.ready()

    const failedToAcquire = errors.filter((m) => m.includes('Failed to acquire server'))
    assert.lengthOf(
      failedToAcquire,
      0,
      `ready() must not log "Failed to acquire server" in non-web environments. Captured: ${JSON.stringify(errors)}`
    )

    await app.terminate()
  })
})
