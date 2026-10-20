import { inject, uploadMaps, ApiClient, IncidentClient, OnCallClient } from '@siteqwality/cli';
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
const incidents = new IncidentClient({ apiKey: 'secret' });
void incidents.listIncidents({ status: 'active', limit: 20 });
void incidents.acknowledgeIncident('incident', 'member');
void incidents.resolveIncident('incident', { notifySubscribers: false });
void incidents.updateIncident('incident', { serviceId: null });
// @ts-expect-error API-key acknowledgments require an explicit member.
void incidents.acknowledgeIncident('incident');
// @ts-expect-error unknown incident status is not an unfiltered list.
void incidents.listIncidents({ status: 'open' });
// @ts-expect-error API requests require credentials, unlike environment-backed plugins.
new ApiClient({ app: 'uuid' });
// @ts-expect-error concurrency must be numeric.
vite({ concurrency: 'four' });
const oncall = new OnCallClient({ apiKey: 'secret' });
void oncall.onCallNow();
void oncall.onCallNow({ scheduleId: 'schedule', at: '2026-10-21T09:00:00Z' });
void oncall.listShifts('schedule', { since: '2026-10-21T09:00:00Z' });
void oncall.listMemberShifts('member');
// @ts-expect-error a member's shifts need the member.
void oncall.listMemberShifts();
