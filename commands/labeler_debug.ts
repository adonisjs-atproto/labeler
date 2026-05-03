import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import { infoSchema, labelsSchema } from '@atcute/atproto/types/label/subscribeLabels'
import { parse } from '@atcute/lexicons/validations'
import { WebSocket } from 'node:http'
import { decodeFrame } from '../src/framing.ts'

/**
 * Command to create the sessions table migration
 */
export default class LabelerDebug extends BaseCommand {
  static commandName = 'labeler:debug'
  static description = 'Debugging tool for AT Protocol Labelers'

  /**
   * Display the key on the terminal, instead of writing it to .env file
   */
  @args.string({
    description: 'Server to debug',
  })
  declare server: string

  @flags.number({
    description: 'Cursor to start from',
    required: false,
  })
  declare cursor?: number

  async run() {
    if (!URL.canParse(this.server)) {
      this.logger.error('Invalid websocket URL: ' + this.server)
      this.exitCode = 1
      return
    }

    const parsed = URL.parse(this.server)
    if (parsed?.protocol !== 'ws:' && parsed?.protocol !== 'wss:') {
      this.logger.error('Invalid websocket URL: ' + this.server)
      this.exitCode = 1
      return
    }

    const query = new URLSearchParams()
    if (this.cursor !== undefined) {
      query.append('cursor', this.cursor.toString())
    }

    const url = new URL('/xrpc/com.atproto.label.subscribeLabels', parsed.origin)
    url.search = query.toString()

    const subscription = url.toString()

    this.logger.info(`Origin: ${parsed.origin}`)
    this.logger.info(`Subscription: ${subscription}`)

    const ws = new WebSocket(subscription)

    ws.addEventListener('open', () => {
      this.logger.info('Subscription started...')
    })

    ws.addEventListener('error', (ev) => {
      // Many Node networking errors (ECONNREFUSED, DNS failures) have an
      // empty .message and the useful diagnostics live in .code / .stack.
      // logger.fatal accepts { message, stack? } and renders the stack —
      // that's the only cliui surface that does so.
      const err = ev.error
      const ctx = `readyState=${ws.readyState}, url=${subscription}`
      if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code
        const codeBit = code ? ` [${code}]` : ''
        this.logger.fatal({
          message: `Websocket Error (${ctx}): ${err.name}${codeBit}: ${err.message || '(empty message)'}`,
          stack: err.stack,
        })
      } else {
        this.logger.error(
          `Websocket Error (${ctx}): ${String(err) || '(no error attached to event)'}`
        )
      }
    })

    ws.addEventListener('close', (ev) => {
      // RFC 6455 close codes: 1000 normal, 1006 abnormal, 1011 server
      // error, etc. Reason is whatever the server sent (often empty).
      const reason = ev.reason ? `, reason="${ev.reason}"` : ''
      this.logger.info(`Subscription closed (code=${ev.code}${reason}, wasClean=${ev.wasClean})`)
    })

    ws.addEventListener('message', async (event) => {
      if (!(event.data instanceof Blob)) {
        this.logger.info(`Received unexpected message event: ${event.data}`)
        return
      }

      const cborBytes = await event.data.bytes()
      const decoded = decodeFrame(cborBytes)

      if (decoded.type === 'error') {
        this.logger.error(`${decoded.error}: ${decoded.message ?? ''}`)
        return
      }

      switch (decoded.discriminator) {
        case '#info':
          const message = parse(infoSchema, decoded.body)
          this.logger.info(`Info: ${message.name}${message.message ? ' ' + message.message : ''}`)
          break
        case '#labels':
          const { seq, labels } = parse(labelsSchema, decoded.body)
          for (let label of labels) {
            this.logger.info(
              `#${seq} Labels: ${label.uri} ${label.val}\n${JSON.stringify(label, null, 2)}`
            )
          }
          break
        default:
          this.logger.error(`Unknown payload type: ${decoded.discriminator}`)
      }
    })
  }
}
