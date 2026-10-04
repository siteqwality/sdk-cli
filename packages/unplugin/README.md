# @siteqwality/unplugin

Candidate version 0.1.0, Node.js 22+. Not published by this change. Use both local package tarballs until publication. After publication:

```sh
npm install --save-dev @siteqwality/unplugin
```

Configure CI with `SITEQWALITY_APP_ID`, `SITEQWALITY_API_KEY`, and optionally `SITEQWALITY_RELEASE` and `SITEQWALITY_API_URL`. Upload is enabled by default and requires the deployed Phase 4 API contract. Use `upload: false` for local builds that only inject IDs.

## Vite

```js
import { defineConfig } from 'vite';
import siteqwality from '@siteqwality/unplugin/vite';
export default defineConfig({
  plugins: [siteqwality({ release: 'web-v1', deleteAfter: true })],
});
```

The adapter runs for production builds and enables external maps. It does not upload during the Vite development server.

## Rollup

```js
import siteqwality from '@siteqwality/unplugin/rollup';
export default {
  input: 'src/index.js',
  output: { dir: 'dist', format: 'es', sourcemap: true },
  plugins: [siteqwality({ release: 'web-v1', deleteAfter: true })],
};
```

The factory returns a Rollup plugin array for the release replacement and final output processing. Nested plugin arrays are supported by Rollup. Each generated output set is uploaded and confirmed independently.

## webpack

```js
import siteqwality from '@siteqwality/unplugin/webpack';
export default {
  mode: 'production',
  devtool: 'source-map',
  plugins: [siteqwality({ release: 'web-v1', deleteAfter: true })],
};
```

Supported `devtool` values are `source-map`, `hidden-source-map` and `nosources-source-map`. An unset/false value becomes `source-map`. Cheap, eval and inline maps are rejected because accurate external line/column mappings are required.

## esbuild

```js
import { build } from 'esbuild';
import siteqwality from '@siteqwality/unplugin/esbuild';
await build({
  entryPoints: ['src/index.js'],
  outdir: 'dist',
  bundle: true,
  sourcemap: true,
  plugins: [siteqwality({ release: 'web-v1', deleteAfter: true })],
});
```

An `outdir` or `outfile` is required. Inline/both map modes are rejected. The adapter collects in-memory outputs, injects and uploads, then writes only after confirmation succeeds. With `write: false`, it returns the processed `outputFiles` without writing. Metafile output sizes reflect the final bytes and exclude deleted maps. Modified output files receive a SHA-256 `hash`; filenames keep esbuild's original hash.

## Shared options and ordering

Named `vite`, `rollup`, `webpack`, and `esbuild` exports are also available from `@siteqwality/unplugin`.

| Option          | Default                                      | Meaning                                                                                    |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app`, `apiKey` | Environment                                  | Application UUID and CI API key                                                            |
| `apiBase`       | Environment or `https://api.siteqwality.com` | API base URL                                                                               |
| `release`       | Environment or unset                         | Replaces `__SQ_RELEASE__`; unset compiles to an empty string and uploads to `__debug_id__` |
| `commit`, `env` | Unset                                        | Optional release metadata                                                                  |
| `upload`        | `true`                                       | Set false for local injection without network access                                       |
| `deleteAfter`   | `false`                                      | Remove maps after all selected uploads are confirmed                                       |
| `concurrency`   | `4`                                          | Parallel PUT limit, 1 to 16                                                                |
| `retries`       | `2`                                          | Transient request retries, 0 to 5                                                          |
| `timeoutMs`     | `30000`                                      | Timeout per request, up to 300000 ms                                                       |
| `retryDelayMs`  | `500`                                        | Initial retry delay, up to 30000 ms                                                        |

`deleteAfter: true` with `upload: false` is rejected. Missing credentials, missing/unsupported maps, invalid API responses and upload failures fail the build. No maps in the selected output set are deleted before every selected upload is confirmed. Maps left by older builds are not scanned or deleted. Keep output cleanup in the build pipeline.

Use `__SQ_RELEASE__` where you configure the SDK release, for example `release: __SQ_RELEASE__`. For TypeScript application code, declare `declare const __SQ_RELEASE__: string` in your ambient declarations. Never put the API key in application code or a `define` value.

Place this adapter after JavaScript/map transforms. Run SRI/signing plugins after injection, or calculate integrity from the final files. Injection occurs after filename hashing and changes JavaScript bytes. Filenames retain their pre-injection hashes. Do not transform the injected output afterward. Each rebuild starts with the bundler's fresh output; no unrelated directories are scanned.

These are native adapters tested with Vite 7, Rollup 4, webpack 5 and esbuild 0.25. The package name provides a common entry point, without depending on the `unplugin` abstraction. Live SDK-to-backend symbolication remains an integration release gate.
