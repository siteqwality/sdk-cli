# Site Qwality source-map tooling

Development candidate for `@siteqwality/cli` and `@siteqwality/unplugin`, version 0.1.0. Requires Node.js 22 or newer. This repository adds build tooling for the Phase 4 source-map API contract. It does not deploy that backend or publish either npm package.

- [CLI commands and upload contract](packages/cli/README.md)
- [Vite, webpack, Rollup and esbuild adapters](packages/unplugin/README.md)
- [Validation and release handoff](docs/release-handoff.md)

## Local development

```sh
npm ci
npm run check
npm run pack:check
```

Tests use loopback contract servers, gzip uploads and real bundler builds. The test runner rejects non-loopback fetches and clears inherited Site Qwality settings. No service credentials are needed. The packaging test installs both tarballs with npm's offline mode.

To try the unpublished packages in another project:

```sh
npm pack --workspace @siteqwality/cli --pack-destination .test-output
npm pack --workspace @siteqwality/unplugin --pack-destination .test-output
# In the consumer project, pass both generated tarballs:
npm install --save-dev /path/to/siteqwality-cli-0.1.0.tgz /path/to/siteqwality-unplugin-0.1.0.tgz
```

The public npm install commands in the package READMEs apply after publication. Until then, use these tarballs.

## Scope

Debug IDs are deterministic UUIDv8 values derived from SHA-256 of the original emitted JavaScript, including its comments. The injection preserves a leading shebang and the directive prologue, registers the ID before executable statements, appends `//# debugId=...`, and composes a new source map so original line and column mappings survive. Both the SDK runtime registry and uploaded map use the same ID.

The adapters use each bundler's native output hooks. They process final output bytes and maps together, including esbuild `write: false`. They do not depend on the `unplugin` abstraction. Release values replace `__SQ_RELEASE__` during compilation; they are not automatically passed to the SDK initializer.

## Output ordering

Place the Site Qwality adapter after plugins that transform JavaScript or source maps. Run artifact signing, SRI generation and deployment against the final injected bytes. Injection happens after filename hashing, so emitted filenames retain the bundler's original hash. Do not run another minifier, banner injector or source-map rewriter afterward. Rebuild before changing an already injected artifact.

Repeated clean builds of identical emitted JavaScript produce the same ID. Re-running CLI injection on its unchanged output is a no-op. Existing foreign IDs, edited registrations and changed injected code fail with a rebuild instruction. Flat version 3 external or hidden maps are supported; indexed and inline maps are rejected. Directory commands reject symlinks and references outside the selected output directory.

`deleteAfter` is optional and defaults to false. Enable it only for builds whose maps should be removed from public output. Every selected upload must be confirmed before the tool removes any map. Build or upload failures return a nonzero status; they must prevent deployment in CI.
