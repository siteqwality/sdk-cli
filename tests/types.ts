import { inject, uploadMaps, ApiClient } from '@siteqwality/cli';
import { vite, rollup, webpack, esbuild, type Options } from '@siteqwality/unplugin';
import siteqwalityVite from '@siteqwality/unplugin/vite';
import siteqwalityRollup from '@siteqwality/unplugin/rollup';
import siteqwalityWebpack from '@siteqwality/unplugin/webpack';
import siteqwalityEsbuild from '@siteqwality/unplugin/esbuild';
import type { UserConfig } from 'vite';
import type { RollupOptions } from 'rollup';
import type { Configuration } from 'webpack';
import type { BuildOptions } from 'esbuild';
const options: Options = { app: 'uuid', apiKey: 'secret', release: 'v1', deleteAfter: true };
const v: UserConfig = { plugins: [vite(options), siteqwalityVite(options)] };
const r: RollupOptions = { plugins: [rollup(options), siteqwalityRollup(options)] };
const w: Configuration = { plugins: [webpack(options), siteqwalityWebpack(options)] };
const e: BuildOptions = { plugins: [esbuild(options), siteqwalityEsbuild(options)] };
const artifact = inject('void 0;', { version: 3, sources: [], names: [], mappings: '' });
const upload = uploadMaps([{ filename: 'app.js.map', map: artifact.map }], {
  app: 'uuid',
  apiKey: 'secret',
});
const releases = new ApiClient({ app: 'uuid', apiKey: 'secret' }).listReleases();
void [v, r, w, e, upload, releases];
// @ts-expect-error API requests require credentials, unlike environment-backed plugins.
new ApiClient({ app: 'uuid' });
// @ts-expect-error concurrency must be numeric.
vite({ concurrency: 'four' });
