# @siteqwality/cli

Candidate version 0.1.0, Node.js 22+. Not published by this change. Use local tarballs until npm publication is authorized. After publication:

```sh
npm install --save-dev @siteqwality/cli
```

## Commands

Inject before uploading, then deploy the exact injected JavaScript:

```sh
npx siteqwality sourcemaps inject ./dist
export SITEQWALITY_APP_ID='your-application-uuid'
export SITEQWALITY_API_KEY='your-api-key'
export SITEQWALITY_RELEASE='web-2026.10.04'
npx siteqwality sourcemaps upload ./dist --delete-after
npx siteqwality releases new "$SITEQWALITY_RELEASE" --commit abc123 --env production
# Run after the application's deployment succeeds:
npx siteqwality releases deploy "$SITEQWALITY_RELEASE" --env production
npx siteqwality releases list
```

Store the key in your CI secret store. Mutations require `write:rum`; release listing requires `read:rum`. The API enforces application ownership. `SITEQWALITY_API_URL` changes the API base, which defaults to `https://api.siteqwality.com`. HTTPS is required except for loopback test servers. The key is read from `SITEQWALITY_API_KEY` and is sent only to the configured API, never to storage PUT URLs. Redirects are not followed.

Authenticated commands accept `--app <uuid>`, `--api-url <url>`, `--retries <count>` (default 2, range 0 to 5), and `--timeout <ms>` (default 30000, maximum 300000). Upload also accepts `--release <version>`, `--commit <sha>`, `--env <environment>`, `--concurrency <count>` (default 4, range 1 to 16), and `--delete-after`. Explicit flags override environment defaults. JSON results go to stdout, errors to stderr with exit code 1. Keys are intentionally not accepted as command-line flags.

Upload creates the release idempotently before presigning. With no release it uses the reserved `__debug_id__` release. `releases deploy <version>` requires an existing release and records server time. It does not deploy application files or configure the browser SDK's release value.

## Injection

The CLI recursively finds `.js`, `.mjs` and `.cjs` files with relative `sourceMappingURL` comments or adjacent hidden `<file>.map` files. Files without maps are skipped; a missing explicitly referenced map fails. It validates all pairs before writing. Symlinks, remote/inline maps, shared maps and paths outside the output directory are rejected.

Injection preserves the shebang, strict and custom directives, original mapped positions and `sourcesContent`. IDs are deterministic UUIDv8 values derived from original JavaScript bytes. The runtime registration uses `globalThis._sqDebugIds` and a captured error stack. Its syntax requires a runtime supporting logical assignment, as used by the SDK contract. A failed registry write is contained so application code still executes.

Unchanged injected pairs can be processed repeatedly. If injected JavaScript changes or a pair's IDs disagree, rebuild from clean output. Map JSON contains the same `debugId` as the JavaScript comment and runtime registration. Indexed maps are unsupported.

## Upload and deletion

Uploads follow the Phase 4 API contract:

1. Create the app-scoped release.
2. Presign at most 50 maps per batch, with unique filenames and Debug IDs. Declare exact gzip byte sizes and JSON/gzip headers.
3. PUT those bytes with the returned storage headers and bounded concurrency.
4. Confirm that batch's returned upload IDs and verify ready status, Debug IDs and byte sizes.
5. Only after every batch succeeds, optionally remove selected maps. The CLI first checks that all selected JavaScript and map files remain unchanged.

Both raw JSON and gzip output are limited to 32 MiB per map. The client retries network failures, timeouts, HTTP 408/429 and 5xx responses with bounded backoff. It respects `Retry-After` up to 30 seconds and fails for longer requested waits. A storage 403 triggers a fresh presign and re-upload, bounded by `--retries`. Other permanent failures stop the command. An incomplete or mismatched presign/confirmation response fails closed. Failed uploads may leave pending server records; retrying gets new IDs. Earlier confirmed batches may remain ready, but no local map is removed when a later batch fails.

Confirmation proves storage and metadata acceptance. It does not prove live symbolication. Backend deployment and an integrated SDK/API smoke test are separate release gates.

## JavaScript API

```js
import { inject, injectDirectory, uploadDirectory, ApiClient } from '@siteqwality/cli';
const { code, map, debugId } = inject(generatedJavaScript, originalSourceMap);
await injectDirectory('./dist');
await uploadDirectory('./dist', {
  app: process.env.SITEQWALITY_APP_ID,
  apiKey: process.env.SITEQWALITY_API_KEY,
  release: 'web-v1',
  deleteAfter: false,
});
```

The programmatic API takes explicit credentials. Bundler adapters and CLI commands additionally resolve environment defaults.
