import { P256PrivateKeyExportable } from '@atcute/crypto'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import { EnvEditor } from '@adonisjs/core/env/editor'

/**
 * Command to create the sessions table migration
 */
export default class GenerateSigningKey extends BaseCommand {
  static commandName = 'generate:signing-key'
  static description = 'Generates an exported signing key for AT Protocol Labelers'

  /**
   * Display the key on the terminal, instead of writing it to .env file
   */
  @flags.boolean({
    description: 'Display the key on the terminal, instead of writing it to .env file',
  })
  declare show: boolean

  /**
   * Force update .env file in production environment
   */
  @flags.boolean({
    description: 'Force update .env file in production environment',
  })
  declare force: boolean

  async run() {
    let writeToFile = process.env.NODE_ENV !== 'production'
    if (this.force) {
      writeToFile = true
    }

    if (this.show) {
      writeToFile = false
    }

    const p256Keypair = await P256PrivateKeyExportable.createKeypair()
    const signingKey = await p256Keypair.exportPrivateKey('multikey')

    if (writeToFile) {
      const editor = await EnvEditor.create(this.app.appRoot)
      editor.add('ATPROTO_LABELER_SIGNING_KEY', JSON.stringify(signingKey), true)
      await editor.save()
      this.logger.action('add ATPROTO_LABELER_SIGNING_KEY to .env').succeeded()
    } else {
      this.logger.log(`ATPROTO_LABELER_SIGNING_KEY = ${signingKey}`)
    }
  }
}
