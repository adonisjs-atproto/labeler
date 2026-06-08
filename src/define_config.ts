import { Secret } from '@adonisjs/core/helpers'
import { parsePrivateMultikey, type FoundPrivateKey } from '@atcute/crypto'
import { isDid } from '@atcute/lexicons/syntax'
import type { LabelerConfig, LabelerProviderConfig } from './types.js'
import { InvalidArgumentsException } from '@adonisjs/core/exceptions'

export function defineConfig<T extends LabelerProviderConfig>({
  serviceDid,
  ...config
}: T): LabelerConfig {
  // Parse the signing key once. `parsePrivateMultikey` accepts both
  // supported atproto curves ('p256' and 'secp256k1') and throws on
  // anything else; we wrap that throw in `InvalidArgumentsException` for
  // consistency with the other validations below. The parsed
  // `{ type, privateKeyBytes }` is carried through to the provider so
  // boot() doesn't re-parse and can dispatch to the right importRaw.
  let signingKey: FoundPrivateKey
  try {
    signingKey = parsePrivateMultikey(config.signingKey.release())
  } catch (err) {
    throw new InvalidArgumentsException(
      'The "signingKey" property is not a valid multibase-encoded private key (p256 or secp256k1)',
      { cause: err }
    )
  }

  // Validate the Service DID
  const validDid = isDid(serviceDid)
  if (!validDid) {
    throw new InvalidArgumentsException(
      'The "serviceDid" property does not contain a valid DID string'
    )
  }

  // Validate the store implements LabelStore
  const store = config.store as unknown as {
    appendLabels?: unknown
    getLatestSeq?: unknown
    listLabelEvents?: unknown
  }
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
    serviceDid,
    signingKey: new Secret(signingKey),
    store: config.store,
  }
}
