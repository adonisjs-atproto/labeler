import { parsePrivateMultikey } from '@atcute/crypto'
import { isDid } from '@atcute/lexicons/syntax'
import type { LabelerConfig, LabelerProviderConfig } from './types.js'
import { InvalidArgumentsException } from '@adonisjs/core/exceptions'

export function defineConfig<T extends LabelerProviderConfig>({
  serviceDid,
  ...config
}: T): LabelerConfig {
  // Validate the signing key:
  parsePrivateMultikey(config.signingKey.release())

  // Validate the Service DID
  const validDid = isDid(serviceDid)
  if (!validDid) {
    throw new InvalidArgumentsException(
      'The "serviceDid" property does not contain a valid DID string'
    )
  }

  return {
    ...config,
    serviceDid: serviceDid,
  }
}
