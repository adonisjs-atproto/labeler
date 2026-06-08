import type { ApplicationService } from '@adonisjs/core/types'
import type { LabelerConfig, LabelerRuntimeConfig } from '../src/types.js'
import type {} from '@atcute/atproto'
import { Secret } from '@adonisjs/core/helpers'
import { RuntimeException } from '@adonisjs/core/exceptions'
import { ComAtprotoLabelSubscribeLabels, ComAtprotoLabelQueryLabels } from '@atcute/atproto'
import { P256PrivateKey, Secp256k1PrivateKey } from '@atcute/crypto'
import { Labeler } from '@atcute/labeler'
import Controller from '../src/label_controller.ts'
import type { ContainerProviderContract } from '@adonisjs/core/types/app'
declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'atproto.labeler.config': LabelerRuntimeConfig
    'atproto.labeler.service': Labeler
  }
}

export default class AtProtoProvider implements ContainerProviderContract {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('atproto.labeler.config', async () => {
      const config = this.app.config.get<LabelerConfig>('atproto_labeler', {})

      if (!config) {
        throw new RuntimeException('Invalid config exported from "config/atproto-labeler.ts" file.')
      }

      if (!config.store) {
        throw new RuntimeException(
          'Invalid config exported from "config/atproto-labeler.ts" file. Missing correct `store` provider'
        )
      }

      // Hydrate the parsed multikey into a real `PrivateKey`. Labelers can sign
      // with either P-256 or secp256k1 (Ozone defaults to secp256k1).
      const parsedSigningKey = config.signingKey.release()
      const signingKey =
        parsedSigningKey.type === 'p256'
          ? await P256PrivateKey.importRaw(parsedSigningKey.privateKeyBytes)
          : await Secp256k1PrivateKey.importRaw(parsedSigningKey.privateKeyBytes)

      return {
        serviceDid: config.serviceDid,
        signingKey: new Secret(signingKey),
        store: config.store,
      }
    })
  }

  async boot() {
    const config = await this.app.container.make('atproto.labeler.config')
    const router = await this.app.container.make('router')

    this.app.container.singleton(Labeler, async () => {
      return new Labeler({
        serviceDid: config.serviceDid,
        signingKey: config.signingKey.release(),
        store: config.store,
      })
    })

    this.app.container.alias('atproto.labeler.service', Labeler)

    router.xrpc.query(ComAtprotoLabelQueryLabels, [Controller, 'list'])
    router.xrpc.subscription(ComAtprotoLabelSubscribeLabels, [Controller, 'subscribe'])
  }
}
