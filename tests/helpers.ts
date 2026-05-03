import { IgnitorFactory } from '@adonisjs/core/factories/core/ignitor'
import { TestUtilsFactory } from '@adonisjs/core/factories/core/test_utils'
import { Secret } from '@adonisjs/core/helpers'
import { MemoryLabelStore } from '@atcute/labeler'
import { getActiveTest } from '@japa/runner'

export const BASE_URL = new URL('../tmp/', import.meta.url)
export const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, BASE_URL).href)
  }
  return import(filePath)
}

/**
 * Default test config for the labeler provider. The signing key is a
 * placeholder — the service factory parses it via parsePrivateMultikey,
 * but only when `atproto.labeler.service` is materialized. In non-web
 * test environments the env-gate in provider.ready() prevents that
 * materialization, so the placeholder never reaches the parser.
 */
function defaultLabelerConfig() {
  return {
    serviceDid: 'did:web:labeler.test',
    signingKey: new Secret('z42tngCsBgNjWWuyiXq5FgX8dviRTBSf9DqiA7fuWj3M9KRu'),
    store: new MemoryLabelStore(),
  }
}

/**
 * Setup an AdonisJS app for testing the labeler package.
 *
 * Returns an isolated app instance with @adonisjs/lucid + better-sqlite3
 * pointed at an in-memory database, AND with the labeler provider
 * registered (so consumers exercise the real provider lifecycle).
 *
 * Tests can override defaults via the `parameters` argument (forwarded
 * to IgnitorFactory.merge). Tests that need to swap container bindings
 * before `provider.ready()` runs can pass a `beforeReady` hook in the
 * second argument — it fires between `app.boot()` (provider register +
 * boot complete) and `testUtils.boot()` (provider ready about to fire).
 *
 * App teardown is registered automatically when called from inside a
 * Japa test body (`getActiveTest()` returns the active test). When
 * called from `group.each.setup` (where there is no active test yet),
 * teardown is not auto-registered — callers should `return terminate`
 * from the setup hook to wire it via Japa's setup-teardown convention.
 */
export async function setupApp(
  parameters: Parameters<IgnitorFactory['merge']>[0] = {},
  hooks: { beforeReady?: (app: any) => void | Promise<void> } = {}
) {
  const factory = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      rcFileContents: {
        providers: [
          () => import('@adonisjs/lucid/database_provider'),
          () => import('../providers/provider.js'),
        ],
      },
      config: {
        database: {
          connection: 'sqlite',
          connections: {
            sqlite: {
              client: 'better-sqlite3',
              connection: { filename: ':memory:' },
              useNullAsDefault: true,
            },
          },
        },
        atproto_labeler: defaultLabelerConfig(),
      },
    })
    .merge(parameters)

  const ignitor = factory.create(BASE_URL, { importer: IMPORTER })
  const testUtils = new TestUtilsFactory().create(ignitor)

  await testUtils.app.init()
  await testUtils.app.boot()
  if (hooks.beforeReady) await hooks.beforeReady(testUtils.app)
  await testUtils.boot()

  const terminate = async () => {
    await testUtils.app.terminate()
  }

  getActiveTest()?.cleanup(terminate)

  return { testUtils, app: testUtils.app, terminate }
}

import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Test-only Lucid model that matches the labels schema we ship in the
 * package's migration stub. Used by store tests; consumers will generate
 * their own model via `node ace configure`.
 */
export class TestLabel extends BaseModel {
  static table = 'labels'
  static primaryKey = 'seq'

  @column({ isPrimary: true })
  declare seq: number

  @column()
  declare src: string

  @column()
  declare uri: string

  @column()
  declare cid: string | null

  @column()
  declare val: string

  @column()
  declare neg: boolean

  @column()
  declare cts: string

  @column()
  declare exp: string | null

  @column()
  declare sig: Uint8Array

  @column()
  declare ver: number | null
}

/**
 * Create the labels table in the in-memory test DB. Mirrors the package's
 * migration stub but executed inline so each test gets a fresh schema.
 */
export async function createLabelsTable(testUtils: any) {
  const db = await testUtils.app.container.make('lucid.db')
  await db.connection().schema.createTable('labels', (table: any) => {
    table.increments('seq')
    table.text('src').notNullable()
    table.text('uri').notNullable()
    table.text('cid').nullable()
    table.string('val', 128).notNullable()
    table.boolean('neg').notNullable().defaultTo(false)
    table.text('cts').notNullable()
    table.text('exp').nullable()
    table.binary('sig').notNullable()
    table.integer('ver').nullable()
    table.index(['uri', 'val'], 'labels_uri_val_index')
  })
}
