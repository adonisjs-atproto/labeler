/*
|--------------------------------------------------------------------------
| Configure hook
|--------------------------------------------------------------------------
|
| The configure hook is called when someone runs "node ace configure <package>"
| command. You are free to perform any operations inside this function to
| configure the package.
|
| To make things easier, you have access to the underlying "ConfigureCommand"
| instance and you can use codemods to modify the source files.
|
*/

import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.ts'

export async function configure(command: Configure) {
  const packageName = '@thisismissem/adonisjs-atproto-labeler'

  const useLucid = await command.prompt.confirm(`Do you want to use Lucid for storing Labels?`, {
    default: true,
  })

  const codemods = await command.createCodemods()

  // Publish config file
  await codemods.makeUsingStub(stubsRoot, 'config.stub', {
    useLucid,
  })

  // Add provider to rc file
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider(`${packageName}/provider`)
    rcFile.addCommand(`${packageName}/commands`)
  })

  // Add migrations and model when using Lucid
  if (useLucid) {
    await codemods.makeUsingStub(stubsRoot, 'migrations/labels.stub', {
      entity: command.app.generators.createEntity('labels'),
      migration: {
        folder: 'database/migrations',
        fileName: `${new Date().getTime()}_create_labels_table.ts`,
      },
    })

    await codemods.makeUsingStub(stubsRoot, 'models/label.stub', {
      entity: command.app.generators.createEntity('label'),
    })
  }

  await codemods.defineEnvVariables({
    ATPROTO_LABELER_DID: 'did:plc:123',
    ATPROTO_LABELER_SIGNING_KEY: 'abc',
  })

  await codemods.defineEnvValidations({
    variables: {
      ATPROTO_LABELER_DID: 'Env.schema.string()',
      ATPROTO_LABELER_SIGNING_KEY: `Env.schema.secret()`,
    },
    leadingComment: 'Variables for configuring the AT Protocol Labeler',
  })

  console.log('')

  const instructions = command.ui.instructions()
  instructions.heading('AT Protocol Labeler setup!')
  if (useLucid) {
    instructions.add('Run the migrations: node ace migration:run')
  } else {
    instructions.add('Modify config/atproto_labeler.ts to configure your chosen store')
  }
  instructions.render()
}
