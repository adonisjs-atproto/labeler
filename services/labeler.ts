import app from '@adonisjs/core/services/app'
import type { Labeler } from '@atcute/labeler'

let labeler: Labeler

await app.booted(async () => {
  labeler = await app.container.make('atproto.labeler.service')
})

export { labeler as default }
