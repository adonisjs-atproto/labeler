import { IgnitorFactory } from '@adonisjs/core/factories/core/ignitor'
import { TestUtilsFactory } from '@adonisjs/core/factories/core/test_utils'

export const BASE_URL = new URL('../tmp/', import.meta.url)
export const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, BASE_URL).href)
  }
  return import(filePath)
}

/**
 * Setup an AdonisJS app for testing the labeler package.
 *
 * Returns an isolated app instance with @adonisjs/lucid + better-sqlite3
 * pointed at an in-memory database. Tests can override defaults via the
 * `parameters` argument (forwarded to IgnitorFactory.merge).
 */
export async function setupApp(parameters: Parameters<IgnitorFactory['merge']>[0] = {}) {
  const factory = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      rcFileContents: {
        providers: [() => import('@adonisjs/lucid/database_provider')],
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
      },
    })
    .merge(parameters)

  const ignitor = factory.create(BASE_URL, { importer: IMPORTER })
  const testUtils = new TestUtilsFactory().create(ignitor)

  await testUtils.app.init()
  await testUtils.app.boot()
  await testUtils.boot()

  return { testUtils, app: testUtils.app }
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
