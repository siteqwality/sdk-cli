# WP4.4 tooling implementation plan

Goal: deterministic Debug IDs, source-map uploads and release commands, with four real bundler integrations in two packages.

Approved contract: SiteQwality Wave2 design 5.7 and analysis/wave2-resume/sourcemap-api-contract.md (2026-10-04). Backend is not yet deployed. Native execution, no agents, no npm publish, no production requests.

Architecture: the CLI package exports a pure injection function, confined directory discovery, an API client and upload coordinator. The plugin package uses native output hooks for each bundler so compiled bytes and maps are handled together; one shared upload coordinator owns authentication, batching, retries and deletion. Only the API origin receives credentials. Output maps are deleted only after all confirmations succeed. Post-output injection means filenames retain the bundler's pre-injection hash; document that deployment must use final emitted bytes for SRI.

- [ ] Injection: tests execute strict JS with shebang/directives; trace original line and column mappings through edits; test deterministic IDs, sourcesContent, idempotency and mismatched pairs. Implement acorn prologue inspection, MagicString edits and map composition in packages/cli/src/inject.js.
- [ ] Files: tests use disposable directories for external/hidden maps, unsafe map references and symlinks. Implement collection and pair validation before writes in files.js.
- [ ] Upload: tests use a loopback contract server, real gzip PUT bytes and confirmations. Cover 50-item batching, bounded concurrency, retries, expired presigns, incomplete responses, cross-origin redirects and no deletion on any failure. Implement api.js and upload.js.
- [ ] CLI: tests spawn the binary against loopback for inject/upload/releases new/deploy/list, environment defaults, invalid flags and failure exit codes. Implement commander entrypoint.
- [ ] Adapters: build fixtures with real Vite, webpack, Rollup and esbuild, inspect and execute emitted JS, trace mappings and verify uploads/deletion against loopback. Implement adapter output hooks and release define; reject unsupported inline/no-map outputs rather than publish unusable artifacts.
- [ ] Packaging: declarations checked by tsc; npm dry-run and packed consumer import tests; documentation, license, CI. Full checks, self-review, public GitHub repo with default master and focused attached PR. No merge or publish.

Review focus: directive ASI and CRLF shebang; nested map paths and symlink escapes; credential redirects and presign response substitution; late batch failures retaining every map; watch/multi-output and write:false bundler lifecycle. These cases belong in the corresponding tests.
