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

  // Validate the store implements LabelStore
  const store = config.store as any
  if (
    !store ||
    typeof store.appendLabels !== 'function' ||
    typeof store.getLatestSeq !== 'function' ||
    typeof store.listLabelEvents !== 'function'
  ) {
    throw new InvalidArgumentsException(
      'The "store" property must implement the LabelStore interface ' +
        '(appendLabels, getLatestSeq, listLabelEvents)'
    )
  }

  return {
    ...config,
    serviceDid: serviceDid,
  }
}
