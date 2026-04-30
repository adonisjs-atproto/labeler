import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AtprotoLabelerMiddleware {
  async handle({}: HttpContext, next: NextFn) {
    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {}
}
