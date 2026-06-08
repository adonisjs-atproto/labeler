---
'@thisismissem/adonisjs-atproto-labeler': minor
---

Adopt `@thisismissem/adonisjs-atproto-xrpc` as the XRPC routing layer.

### New features

- **Controller-based handlers**. The provider now registers `com.atproto.label.queryLabels` and `com.atproto.label.subscribeLabels` against `router.xrpc.query` / `router.xrpc.subscription` in `boot()`, pointing at a new `LabelController` (`src/label_controller.ts`). The provider's `ready()` no longer manually installs a WebSocket handler — that's owned by the xrpc package.
- **`FutureCursorXrpcError`** (`src/errors.ts`). Subscription handlers throw it when the requested cursor is past the latest stored seq; the xrpc framework serialises it as an `error` frame (`errorName: 'FutureCursor'`) and closes the stream with code 1008.
- **`configure` command** adds `@thisismissem/adonisjs-atproto-xrpc/provider` to `adonisrc.ts` alongside the labeler provider, so consumers get the router and middleware wired in automatically.
- **`tests/helpers.ts`** gains `setupWebApp` for subscription tests — boots an Adonis app with a no-listen Node server attached so `injectXrpcSubscription` can drive the WebSocket upgrade path. `defaultLabelerConfig` now accepts an optional `store` override.

### Fixes

- **Correctly dispatch on the signing key's curve.** Previously the provider passed `parsePrivateMultikey`'s output straight into `P256PrivateKey.importRaw` without checking the `type` discriminator. AT Protocol labelers can sign with either `p256` or `secp256k1` (and Ozone defaults to `secp256k1`); both curves use 32-byte raw private keys, so a `secp256k1` configuration would have been silently imported as P-256 and produced signatures that don't verify against the consumer's actual public key. The provider now dispatches on `parsed.type` and uses `Secp256k1PrivateKey.importRaw` for k256 keys.
- **`defineConfig` parses the multikey once and stashes the parsed payload in the config.** Previously the helper parsed the multikey purely to validate (throwing away the result), then the provider re-parsed in `boot()`. The parse now happens once at config-load; `LabelerConfig.signingKey` is `Secret<ParsedSigningKey>`. `defineConfig` stays synchronous (matches Adonis convention — every other `defineConfig` in core packages is sync).

### Types

- New `LabelerRuntimeConfig` type — what `container.make('atproto.labeler.config')` yields, with `signingKey: Secret<P256PrivateKey | Secp256k1PrivateKey>` (the hydrated key). The container binding for `atproto.labeler.config` is `LabelerRuntimeConfig`, not `LabelerConfig`.
- `LabelerConfig` (the `defineConfig` return type, what lives in `app.config`) now carries the parsed-but-not-imported signing key (`Secret<FoundPrivateKey>` from `@atcute/crypto`). The hydration runs once inside the `atproto.labeler.config` singleton factory.
- New exported type alias: `SigningKey` (= `FoundPrivateKey` from `@atcute/crypto`) for consumers that want to inspect the parsed multikey shape.

### Updated dependencies

- `@atcute/atproto` ^3.1.10 → ^4.0.0
- `@atcute/labeler` ^0.1.0 → ^1.0.0
- `@atcute/lexicons` ^1.2.9 → ^2.0.0
- Added: `@thisismissem/adonisjs-atproto-xrpc` (replaces direct `@atcute/xrpc-server` + `@atcute/xrpc-server-node` deps, which are now transitive via the xrpc package).
