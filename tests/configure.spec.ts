/*
|--------------------------------------------------------------------------
| Configure spec
|--------------------------------------------------------------------------
|
| Exercises the package's configure() hook end-to-end. Boots a fake
| AdonisJS app under an isolated tmp directory, runs the Configure
| command against this package, and asserts on the resulting file
| contents — provider/command registration, middleware registration,
| env scaffolding, and the useLucid branch of the config stub.
| Modeled on @adonisjs/lucid's and @adonisjs/auth's configure tests.
|
*/

import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { IgnitorFactory } from '@adonisjs/core/factories'
import Configure from '@adonisjs/core/commands/configure'

const BASE_URL = new URL('../tmp/configure/', import.meta.url)

const PACKAGE_NAME = '@thisismissem/adonisjs-atproto-labeler'
const INSTALL_PROMPT = `Do you want to install additional packages required by "${PACKAGE_NAME}"?`
const LUCID_PROMPT = 'Do you want to use Lucid for storing Labels?'

test.group('Configure', (group) => {
  group.each.setup(({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)
  })

  group.each.disableTimeout()

  test('useLucid: true publishes config + migration + label model', async ({ fs, assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }
          return import(filePath)
        },
      })

    await fs.create('.env', '')
    await fs.createJson('tsconfig.json', {})
    await fs.create('start/env.ts', `export default Env.create(new URL('./'), {})`)
    await fs.create(
      'start/kernel.ts',
      `router.use([])
export const { middleware } = router.named({
})`
    )
    await fs.create('adonisrc.ts', `export default defineConfig({})`)

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    const ace = await app.container.make('ace')
    ace.prompt.trap(INSTALL_PROMPT).reject()
    ace.prompt.trap(LUCID_PROMPT).accept()

    const command = await ace.create(Configure, ['../../index.js'])
    await command['exec']()

    // Config file emitted with Lucid-flavored store
    await assert.fileExists('config/atproto_labeler.ts')
    await assert.fileContains('config/atproto_labeler.ts', 'defineConfig({')
    await assert.fileContains('config/atproto_labeler.ts', 'lucidLabelStore')
    await assert.fileContains('config/atproto_labeler.ts', `${PACKAGE_NAME}/store`)

    // adonisrc gets provider + commands registered
    await assert.fileContains('adonisrc.ts', `${PACKAGE_NAME}/provider`)
    await assert.fileContains('adonisrc.ts', `${PACKAGE_NAME}/commands`)

    // Router middleware appended
    await assert.fileContains('start/kernel.ts', `${PACKAGE_NAME}/atproto_labeler_middleware`)

    // Env vars + validations wired up
    await assert.fileContains('.env', 'ATPROTO_LABELER_DID')
    await assert.fileContains('.env', 'ATPROTO_LABELER_SIGNING_KEY')
    await assert.fileContains('start/env.ts', 'ATPROTO_LABELER_DID: Env.schema.string()')
    await assert.fileContains('start/env.ts', 'ATPROTO_LABELER_SIGNING_KEY: Env.schema.secret()')

    // Lucid-only artifacts: model + a dynamically-timestamped migration
    await assert.fileExists('app/models/label.ts')
    const migrations = await fs.readDir('database/migrations')
    const labelsMigration = migrations.find((entry) =>
      entry.basename.endsWith('_create_labels_table.ts')
    )
    assert.exists(labelsMigration, 'expected a *_create_labels_table.ts migration to be created')
  })

  test('useLucid: false publishes config without migration or model', async ({ fs, assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }
          return import(filePath)
        },
      })

    await fs.create('.env', '')
    await fs.createJson('tsconfig.json', {})
    await fs.create('start/env.ts', `export default Env.create(new URL('./'), {})`)
    await fs.create(
      'start/kernel.ts',
      `router.use([])
export const { middleware } = router.named({
})`
    )
    await fs.create('adonisrc.ts', `export default defineConfig({})`)

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    const ace = await app.container.make('ace')
    ace.prompt.trap(INSTALL_PROMPT).reject()
    ace.prompt.trap(LUCID_PROMPT).reject()

    const command = await ace.create(Configure, ['../../index.js'])
    await command['exec']()

    // Config file emitted, but with the in-memory store path
    await assert.fileExists('config/atproto_labeler.ts')
    await assert.fileContains('config/atproto_labeler.ts', 'defineConfig({')
    await assert.fileContains('config/atproto_labeler.ts', 'MemoryLabelStore')

    // Provider, middleware and env wiring happen regardless of store choice
    await assert.fileContains('adonisrc.ts', `${PACKAGE_NAME}/provider`)
    await assert.fileContains('adonisrc.ts', `${PACKAGE_NAME}/commands`)
    await assert.fileContains('start/kernel.ts', `${PACKAGE_NAME}/atproto_labeler_middleware`)
    await assert.fileContains('.env', 'ATPROTO_LABELER_DID')
    await assert.fileContains('.env', 'ATPROTO_LABELER_SIGNING_KEY')

    // The Lucid-only branch must NOT have published the model + migration
    await assert.fileNotExists('app/models/label.ts')
    if (await fs.exists('database/migrations')) {
      const migrations = await fs.readDir('database/migrations')
      const labelsMigration = migrations.find((entry) =>
        entry.basename.endsWith('_create_labels_table.ts')
      )
      assert.notExists(labelsMigration, 'memory store should not create a labels migration')
    }
  })
})
