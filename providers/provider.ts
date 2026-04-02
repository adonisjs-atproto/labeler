import type { ApplicationService } from '@adonisjs/core/types'
import type { LabelerProviderConfig } from '../src/types.js'

import { RuntimeException } from '@adonisjs/core/exceptions'

export default class AtProtoProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('atproto.labeler.config', async () => {
      const config = this.app.config.get<LabelerProviderConfig>('atproto_labeler', {})

      if (!config) {
        throw new RuntimeException(
          'Invalid config exported from "config/atproto-labeler.ts" file.'
        )
      }

      if (!config.stores) {
        throw new RuntimeException(
          'Invalid config exported from "config/atproto-labeler.ts" file. Missing correct `stores` provider'
        )
      }

      return config
    })
  }

  async boot() {
    const config = await this.app.container.make('atproto.labeler.config')
  }

  async start() {}

  async shutdown() {}
}
