import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { IncidentClient } from '../packages/cli/src/index.js';
import { server, APP } from './server.js';

const exec = promisify(execFile);
const bin = path.resolve('packages/cli/bin/siteqwality.js');
const MEMBER = '22222222-2222-4222-8222-222222222222';
const SERVICE = '33333333-3333-4333-8333-333333333333';
const incident = { id: APP, title: 'Checkout', severity: 'major', responder_status: 'triggered' };
const run = (args, base) =>
  exec(process.execPath, [bin, 'incidents', ...args, '--api-url', base], {
    env: { PATH: process.env.PATH, SITEQWALITY_API_KEY: 'test-api-key' },
  });

async function fixture(t, { failure, redirect } = {}) {
  return server(t, {
    handle: ({ req, res, url, json, state, reply, base }) => {
      state.api.push({ method: req.method, path: req.url, json, auth: req.headers.authorization });
      assert.equal(req.headers.authorization, 'Bearer test-api-key');
      if (redirect) {
        res.writeHead(307, { Location: `${base}/unexpected` });
        res.end();
      } else if (failure) reply(failure, { secret: 'response-body-private-marker' });
      else if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [incident], total: 101 }));
      } else reply(200, incident);
      assert.ok(url.pathname.startsWith('/incident'));
      return true;
    },
  });
}

test('incident list needs no RUM application and preserves server pagination', async (t) => {
  const { base, state } = await fixture(t);
  const result = JSON.parse(
    (await run(['list', '--status', 'resolved', '--limit', '10', '--offset', '20'], base)).stdout,
  );
  assert.deepEqual(result, { data: [incident], total: 101 });
  assert.equal(state.api[0].path, '/incident?status=resolved&limit=10&offset=20');
});

test('incident CLI sends account-owned actor and explicit resolution settings', async (t) => {
  const { base, state } = await fixture(t);
  await run(['ack', APP, '--by', MEMBER], base);
  await run(['resolve', APP, '--message', 'Recovered', '--no-notify-subscribers'], base);
  assert.deepEqual(
    state.api.map(({ method, path, json }) => ({ method, path, json })),
    [
      { method: 'POST', path: `/incident/${APP}/acknowledge`, json: { acknowledged_by: MEMBER } },
      {
        method: 'POST',
        path: `/incident/${APP}/resolve`,
        json: { message: 'Recovered', notify_subscribers: false },
      },
    ],
  );
});

test('incident update preserves PATCH semantics and supports clearing a service', async (t) => {
  const { base, state } = await fixture(t);
  await run(
    ['update', APP, '--title', 'New title', '--severity', 'critical', '--service', SERVICE],
    base,
  );
  await run(['update', APP, '--clear-service'], base);
  assert.deepEqual(
    state.api.map(({ method, json }) => ({ method, json })),
    [
      { method: 'PUT', json: { title: 'New title', severity: 'critical', service_id: SERVICE } },
      { method: 'PUT', json: { service_id: null } },
    ],
  );
});

test('incident commands refuse invalid ids, missing actor and conflicting service flags before requests', async (t) => {
  const { base, state } = await fixture(t);
  for (const args of [
    ['ack', APP],
    ['ack', '../foreign', '--by', MEMBER],
    ['ack', APP, '--by', 'not-a-member'],
    ['update', APP],
    ['update', APP, '--severity', 'urgent'],
    ['update', APP, '--service', SERVICE, '--clear-service'],
    ['update', APP, '--title', ' '],
    ['list', '--status', 'open'],
    ['list', '--limit', '101'],
    ['list', '--offset', '9007199254740992'],
  ])
    await assert.rejects(run(args, base), (error) => error.code === 1);
  assert.equal(state.api.length, 0);
});

test('incident mutations do not retry ambiguous failures and errors omit response bodies and keys', async (t) => {
  const { base, state } = await fixture(t, { failure: 503 });
  await assert.rejects(run(['ack', APP, '--by', MEMBER, '--retries', '5'], base), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /HTTP 503/);
    assert.ok(!error.stderr.includes('test-api-key'));
    assert.ok(!error.stderr.includes('response-body-private-marker'));
    return true;
  });
  assert.equal(state.api.length, 1);
});

test('incident client rejects redirects and invalid pagination envelopes', async (t) => {
  const redirected = await fixture(t, { redirect: true });
  const client = new IncidentClient({
    apiBase: redirected.base,
    apiKey: 'test-api-key',
    retries: 0,
  });
  await assert.rejects(client.listIncidents(), /HTTP 307/);
  assert.equal(redirected.state.api.length, 1);
  const malformed = await server(t);
  await assert.rejects(
    new IncidentClient({ apiBase: malformed.base, apiKey: 'test-api-key' }).listIncidents(),
    /Invalid incident list/,
  );
});

test('incident list retries a transient read once using the configured budget', async (t) => {
  let attempts = 0;
  const { base } = await server(t, {
    handle: ({ res, reply }) => {
      if (++attempts === 1) reply(503, {});
      else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [], total: 0 }));
      }
      return true;
    },
  });
  assert.deepEqual(
    await new IncidentClient({
      apiBase: base,
      apiKey: 'test-api-key',
      retryDelayMs: 0,
      retries: 1,
    }).listIncidents(),
    { data: [], total: 0 },
  );
  assert.equal(attempts, 2);
});
