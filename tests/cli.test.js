import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { temp, pair } from './helpers.js';
import { server, APP } from './server.js';
const exec = promisify(execFile);
const bin = path.resolve('packages/cli/bin/siteqwality.js');
function run(args, env = {}) {
  return exec(process.execPath, [bin, ...args], { env: { PATH: process.env.PATH, ...env } });
}
test('CLI inject/upload uses environment auth and emits machine-readable results', async (t) => {
  const dir = await temp(t);
  await pair(dir, 'app.js', '"use strict";globalThis.answer=42;');
  const injected = JSON.parse((await run(['sourcemaps', 'inject', dir])).stdout);
  assert.equal(injected[0].filename, 'app.js.map');
  const { base, state } = await server(t);
  const env = {
    SITEQWALITY_APP_ID: APP,
    SITEQWALITY_API_KEY: 'test-api-key',
    SITEQWALITY_API_URL: base,
    SITEQWALITY_RELEASE: 'web/test',
  };
  const result = JSON.parse(
    (await run(['sourcemaps', 'upload', dir, '--delete-after'], env)).stdout,
  );
  assert.equal(result.uploaded, 1);
  assert.equal(state.api[0].json.version, 'web/test');
  await assert.rejects(stat(path.join(dir, 'app.js.map')), /ENOENT/);
  assert.ok((await readFile(path.join(dir, 'app.js'), 'utf8')).includes('debugId='));
});
test('CLI release commands create, deploy and list with explicit app/base options', async (t) => {
  const { base, state } = await server(t);
  const flags = ['--app', APP, '--api-url', base];
  const env = { SITEQWALITY_API_KEY: 'test-api-key' };
  await run(['releases', 'new', 'v2', ...flags, '--commit', 'abc', '--env', 'staging'], env);
  await run(['releases', 'deploy', 'v2', ...flags, '--env', 'production'], env);
  assert.equal(
    JSON.parse((await run(['releases', 'list', ...flags], env)).stdout)[0].version,
    'v1',
  );
  assert.deepEqual(state.api[0].json, { version: 'v2', commit_sha: 'abc', env: 'staging' });
  assert.deepEqual(state.api[1].json, { env: 'production' });
});
test('CLI help succeeds, invalid flags/auth fail nonzero without leaking secrets', async (t) => {
  assert.match((await run(['--help'])).stdout, /sourcemaps/);
  await assert.rejects(
    run(['sourcemaps', 'inject', '--wat']),
    (e) => e.code === 1 && /unknown option/.test(e.stderr),
  );
  await assert.rejects(
    run(['releases', 'list']),
    (e) => e.code === 1 && /application/.test(e.stderr),
  );
  const { base } = await server(t, { confirmFailure: true });
  const dir = await temp(t);
  await pair(dir, 'app.js', 'void 0;');
  await run(['sourcemaps', 'inject', dir]);
  await assert.rejects(
    run(['sourcemaps', 'upload', dir, '--app', APP, '--api-url', base, '--delete-after'], {
      SITEQWALITY_API_KEY: 'test-api-key',
    }),
    (e) => e.code === 1 && /409/.test(e.stderr) && !e.stderr.includes('test-api-key'),
  );
  assert.ok((await stat(path.join(dir, 'app.js.map'))).isFile());
});
