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
