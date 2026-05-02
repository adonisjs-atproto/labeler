import { test } from '@japa/runner'
import LabelerProvider from '../providers/provider.js'

test.group('LabelerProvider lifecycle', () => {
  test('ready() short-circuits when environment is not "web"', async ({ assert }) => {
    let containerMakeCalls = 0
    const mockApp = {
      getEnvironment: () => 'console',
      container: {
        make: async (binding: string) => {
          containerMakeCalls++
          throw new Error(`container.make(${binding}) should not be called in console env`)
        },
      },
    } as any

    const provider = new LabelerProvider(mockApp)
    await provider.ready()

    assert.equal(
      containerMakeCalls,
      0,
      'ready() must not access the container in non-web environments'
    )
  })

  test('ready() short-circuits in "test" environment', async ({ assert }) => {
    let containerMakeCalls = 0
    const mockApp = {
      getEnvironment: () => 'test',
      container: {
        make: async () => {
          containerMakeCalls++
          throw new Error('container.make should not be called in test env')
        },
      },
    } as any

    const provider = new LabelerProvider(mockApp)
    await provider.ready()

    assert.equal(containerMakeCalls, 0)
  })
})
