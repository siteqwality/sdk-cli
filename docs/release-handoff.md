# WP4.4 release handoff

## Delivered candidate

Two ESM packages, `@siteqwality/cli@0.1.0` and `@siteqwality/unplugin@0.1.0`, in the public `siteqwality/sdk-cli` repository. The implementation is proposed on a feature branch against `master`. Neither package is published or deployed by this work.

The CLI provides deterministic injection, app-scoped release commands and batch presign/gzip PUT/confirm. The plugin package provides native Vite, Rollup, webpack and esbuild adapters and the `__SQ_RELEASE__` define. Map deletion is optional and waits for all selected confirmations. No other worker's repository was modified.

## Contract and deliberate choices

Implemented against the 2026-10-04 Phase 4 source-map contract supplied for `core-rs` branch `feat/wave2-p4-errors`. It specifies app-scoped `/rum/{app_id}` routes, bearer API authentication, a `data` envelope, 50-file batches, 32 MiB map limits, exact gzip sizes, returned PUT headers and confirmation by upload UUID. Release metadata and deployment recording follow that contract.

- Registration is inserted after the shebang and directive prologue, preserving strict-mode semantics. Literal prepending from design 5.7 would break those cases.
- A SHA-256-derived UUIDv8 uses the original JavaScript bytes with a versioned hash-domain prefix. Same bytes produce the same ID. Different source maps for identical bytes cannot be uploaded together under the same ID.
- Native output hooks provide adapters for all four requested bundlers. They process final JavaScript and its map together; the package does not depend on the `unplugin` abstraction.
- Filenames retain the bundler's pre-injection content hash. Calculate integrity/signatures from the final bytes and do not mutate those bytes after injection.
- `__SQ_RELEASE__` is a compile-time string. The application still passes that value to the SDK. Release deployment recording does not configure or deploy the SDK.
- `deleteAfter` defaults to false. It cannot be combined with `upload: false`. Each bundler output set is a separate upload operation; a later failed output does not undo earlier confirmed outputs, but the build fails and must not deploy.
- Source-map discovery supports flat v3 external and hidden maps. Inline/indexed maps, shared maps, and unsafe directory references fail. No live symbolication claim follows from HEAD confirmation.

## Validation

Local `npm run check` passed on Node.js 23.5.0:

- 49 tests, zero failures.
- Actual Vite 7.3.6, Rollup 4.64.0, webpack 5.111.1 and esbuild 0.25.12 builds.
- Strict/directive/shebang execution, exact source line/column tracing, retained source content, deterministic IDs, idempotency and mutation rejection.
- Real loopback gzip uploads, 50+1 batches, bounded concurrency, transient/expired-signature retries, malformed responses, redirects, app-scoped authentication, late failure and changed-file deletion guards.
- Four adapter upload/deletion/failure fixtures, Rollup code splitting and returned map metadata, esbuild memory outputs, metafile updates and rebuilds with executable shebang output.
- Spawned CLI commands for inject/upload/releases new/deploy/list and failure exits.
- Offline installation of both packed tarballs, public exports, executable CLI and consumer TypeScript declarations.
- TypeScript consumer checks and formatting checks.

Test fetches are restricted to loopback, and inherited SiteQwality environment values are cleared. CLI subprocesses get explicit test settings. No live API, storage or SDK service was used. CI runs the same checks and packaging dry runs on Node.js 22 and 24; inspect the PR checks for their results.

## Review and publication gates

1. Review and merge the tooling PR through the normal process. This task does not merge it.
2. Confirm the Phase 4 backend migration and API changes are deployed and match the contract. Use a canary application with appropriate `write:rum` and `read:rum` credentials to verify an upload, release list and deploy recording.
3. Verify an emitted browser error carries the injected Debug ID and resolves to the expected source line/column in the integrated SDK/backend. Include the release fallback path if it is part of the rollout.
4. Complete npm login/authentication and obtain publication authorization. Publish the CLI before the plugin because the plugin depends on that CLI version. Neither `npm publish` nor registry authentication is attempted here.
5. Only then update public install examples from local candidate tarballs to published versions and promote Phase 4 marketing/docs claims. This implementation does not change plan pricing or claim later phases are available.

## Reproducible commands

```sh
npm ci
npm run check
npm run pack:check
mkdir -p .test-output
npm pack --workspace @siteqwality/cli --pack-destination .test-output
npm pack --workspace @siteqwality/unplugin --pack-destination .test-output
```

The resulting tarballs can be installed together in a canary project's development dependencies. Backend deployment commands remain owned by the backend release; no Lambda or production changes are included here.
