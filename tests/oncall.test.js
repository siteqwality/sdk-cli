import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { server, APP } from './server.js';

const exec = promisify(execFile);
const bin = path.resolve('packages/cli/bin/siteqwality.js');
const MEMBER = '22222222-2222-4222-8222-222222222222';
const shift = { schedule_id: APP, user_id: MEMBER, source: 'layer', layer_number: 1 };
const run = (args, base) =>
  exec(process.execPath, [bin, 'oncall', ...args, '--api-url', base], {
    env: { PATH: process.env.PATH, SITEQWALITY_API_KEY: 'test-api-key' },
  });

async function fixture(t) {
  return server(t, {
    handle: ({ req, url, state, reply }) => {
      state.api.push({ method: req.method, path: req.url });
      assert.equal(req.headers.authorization, 'Bearer test-api-key');
      assert.equal(req.method, 'GET');
      assert.ok(url.pathname.startsWith('/on_call'));
      reply(200, url.pathname === '/on_call' ? [shift] : { on_call: shift });
      return true;
    },
  });
}

test('oncall now asks the account or one schedule, at an optional instant', async (t) => {
  const { base, state } = await fixture(t);
  assert.deepEqual(JSON.parse((await run(['now'], base)).stdout), [shift]);
  await run(['now', '--schedule', APP, '--at', '2026-10-21T09:00:00Z'], base);
  assert.deepEqual(
    state.api.map((r) => r.path),
    ['/on_call', `/on_call_schedule/${APP}/on_call?at=2026-10-21T09%3A00%3A00.000Z`],
  );
});

test('oncall shifts and mine pass their range, and mine defaults to two weeks', async (t) => {
  const { base, state } = await fixture(t);
  await run(
    ['shifts', APP, '--since', '2026-10-21T00:00:00Z', '--until', '2026-10-28T00:00:00Z'],
    base,
  );
  await run(['mine', '--user', MEMBER, '--since', '2026-10-21T00:00:00Z'], base);
  assert.deepEqual(
    state.api.map((r) => r.path),
    [
      `/on_call_schedule/${APP}/shifts?since=2026-10-21T00%3A00%3A00.000Z&until=2026-10-28T00%3A00%3A00.000Z`,
      `/on_call?user_id=${MEMBER}&since=2026-10-21T00%3A00%3A00.000Z&until=2026-11-04T00%3A00%3A00.000Z`,
    ],
  );
});

test('oncall commands refuse bad ids and times before any request', async (t) => {
  const { base, state } = await fixture(t);
  for (const args of [
    ['now', '--schedule', '../other'],
    ['now', '--at', 'tomorrow'],
    ['shifts', 'not-a-schedule'],
    ['shifts', APP, '--since', '21/10/2026'],
    ['mine'],
    ['mine', '--user', 'someone'],
  ])
    await assert.rejects(run(args, base), (error) => error.code === 1);
  assert.equal(state.api.length, 0);
});
