---
'@thisismissem/adonisjs-atproto-labeler': minor
---

Add Lucid-backed label storage and improve provider/debug ergonomics.

### New features

- **`/store` subpath export** with `LucidLabelStore`, `lucidLabelStore` factory, and `LabelStoreError`. `@adonisjs/lucid` (^22.4.0) is now an _optional_ peer dependency — consumers using a custom or in-memory store never load Lucid. Bundles batches into single events on replay; preserves sig-verifiable round-trip fidelity by omitting absent optional fields (`cid`, `neg`, `exp`, `ver`).
- **`useLucid` prompt in `node ace configure`**. When enabled, the configure command publishes a `Label` Lucid model and a `_create_labels_table` migration in addition to the standard config; when declined, the config wires up `MemoryLabelStore` directly.
- **Re-exports from the main entry**: `MemoryLabelStore`, `LabelerError`, `FutureCursorError`, `ConsumerTooSlowError`, plus the `LabelStore`, `LabelEvent`, `LabelOp`, and `SignedLabel` types — consumers no longer need a direct `@atcute/labeler` dependency.
- **`defineConfig` now requires (and validates) a `store` field** on the labeler config. Stores that don't implement the `LabelStore` interface (`appendLabels`, `getLatestSeq`, `listLabelEvents`) raise `InvalidArgumentsException` at config-load time. The provider uses `config.store` instead of a hardcoded `MemoryLabelStore`.

### Fixes

- `generate:signing-key` now JSON-stringifies the value when writing to `.env`, avoiding multi-line value contamination from prior runs.
- Provider `ready()` skips WebSocket handler installation when `app.getEnvironment()` is not `'web'` — no more misleading `Failed to acquire server` errors from ace commands, repl, or tests.
- Provider `ready()` is wrapped in a try/catch that surfaces installation failures via `logger.error({ err }, ...)` instead of being swallowed by the AdonisJS lifecycle. Adds a `trace`-level boot confirmation when the WebSocket handler successfully attaches.
- `labeler:debug` routes `Error` instances through `logger.fatal({ message, stack })` so the stack trace is rendered. Every error line now includes `readyState`, the connection URL, and the error's `.code` (`ECONNREFUSED`, `ENOTFOUND`, etc.) — so empty-message networking errors actually surface useful diagnostics. Close events show the RFC 6455 close code, server-supplied reason, and `wasClean` flag.
