import type { ApplicationService } from '@adonisjs/core/types'
import type { LabelerConfig } from '../src/types.js'
import type {} from '@atcute/atproto'
import { RuntimeException } from '@adonisjs/core/exceptions'
import { ComAtprotoLabelSubscribeLabels } from '@atcute/atproto'
import { P256PrivateKey, parsePrivateMultikey } from '@atcute/crypto'
import { FutureCursorError, Labeler } from '@atcute/labeler'
import { XRPCRouter, XRPCSubscriptionError } from '@atcute/xrpc-server'
import { createNodeWebSocket } from '@atcute/xrpc-server-node'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'atproto.labeler.config': LabelerConfig
    'atproto.labeler.service': Labeler
  }
}

export default class AtProtoProvider {
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

      return config
    })
  }

  async boot() {
    const config = await this.app.container.make('atproto.labeler.config')

    this.app.container.singleton(Labeler, async () => {
      const { privateKeyBytes } = parsePrivateMultikey(config.signingKey.release())

      const labeler = new Labeler({
        serviceDid: config.serviceDid,
        signingKey: await P256PrivateKey.importRaw(privateKeyBytes),
        store: config.store,
      })

      return labeler
    })

    this.app.container.alias('atproto.labeler.service', Labeler)
  }

  async ready() {
    // Skip WebSocket handler installation outside the HTTP server context.
    // ace commands, tests, and repl all run providers through ready() but
    // never start a server — without this gate we'd log a misleading error.
    if (this.app.getEnvironment() !== 'web') return

    const appServer = await this.app.container.make('server')
    const logger = await this.app.container.make('logger')
    const labeler = await this.app.container.make(Labeler)

    const server = appServer.getNodeServer()
    if (!server) {
      logger.error('Failed to acquire server to install labeler websocket handler on.')
      return
    }

    const ws = createNodeWebSocket()
    const router = new XRPCRouter({ websocket: ws.adapter })

    router.addSubscription(ComAtprotoLabelSubscribeLabels, {
      async *handler({ params, signal }) {
        try {
          for await (const event of labeler.subscribeLabels({
            cursor: params.cursor,
            signal: signal,
          })) {
            yield {
              $type: 'com.atproto.label.subscribeLabels#labels',
              ...event,
            }
          }
        } catch (err) {
          if (err instanceof FutureCursorError) {
            throw new XRPCSubscriptionError({ error: 'FutureCursor' })
          }
          throw err
        }
      },
    })

    ws.injectWebSocket(server, router)
  }

  async shutdown() {}
}
