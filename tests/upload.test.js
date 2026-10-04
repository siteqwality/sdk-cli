import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { temp, pair } from './helpers.js';
import { server, APP } from './server.js';
import { injectDirectory } from '../packages/cli/src/files.js';
import { uploadDirectory, uploadMaps } from '../packages/cli/src/upload.js';
import { ApiClient } from '../packages/cli/src/api.js';
const opts = (base) => ({
  app: APP,
  apiKey: 'test-api-key',
  apiBase: base,
  concurrency: 3,
  retries: 2,
  retryDelayMs: 0,
});
async function artifacts(t, n = 1) {
  const dir = await temp(t);
  for (let i = 0; i < n; i++) await pair(dir, `bundle${i}.js`, `globalThis.answer=${i};`);
  await injectDirectory(dir);
  return dir;
}

test('real gzip uploads batch at 50 with bounded concurrency, then confirm all before delete', async (t) => {
  const { base, state } = await server(t);
  const dir = await artifacts(t, 51);
  const out = await uploadDirectory(dir, { ...opts(base), release: 'web/a b', deleteAfter: true });
  assert.equal(out.uploaded, 51);
  assert.deepEqual(
    state.batches.map((b) => b.length),
    [50, 1],
  );
  assert.deepEqual(
    state.confirmations.map((b) => b.length),
    [50, 1],
  );
  assert.ok(state.maxActive <= 3 && state.maxActive > 1);
  assert.equal(state.api[0].json.version, 'web/a b');
  assert.ok(state.api.some((r) => r.path.includes('web%2Fa%20b/sourcemaps')));
  for (const batch of state.batches)
    for (const file of batch) {
      assert.equal(file.content_encoding, 'gzip');
      assert.ok(file.size_bytes > 0);
      assert.ok(file.debug_id);
    }
  for (const put of state.puts) {
    assert.equal(put.headers.authorization, undefined);
    assert.equal(put.headers['content-encoding'], 'gzip');
  }
  await assert.rejects(stat(path.join(dir, 'bundle0.js.map')), /ENOENT/);
  assert.ok((await readFile(path.join(dir, 'bundle0.js'), 'utf8')).includes('debugId='));
  assert.deepEqual(state.failures, []);
});
for (const failure of ['confirmFailure', 'missingConfirm', 'missingPresign'])
  test(`${failure} retains every public map`, async (t) => {
    const { base } = await server(t, { [failure]: true });
    const dir = await artifacts(t, 2);
    await assert.rejects(uploadDirectory(dir, { ...opts(base), deleteAfter: true }));
    assert.ok((await stat(path.join(dir, 'bundle0.js.map'))).isFile());
    assert.ok((await stat(path.join(dir, 'bundle1.js.map'))).isFile());
  });
test('late second batch failure does not delete maps confirmed in first batch', async (t) => {
  const { base } = await server(t, {
    handle: ({ url, json, reply, state }) => {
      if (url.pathname.endsWith('/confirm') && state.confirmations.length === 1) {
        reply(409, {});
        return true;
      }
    },
  });
  const dir = await artifacts(t, 51);
  await assert.rejects(uploadDirectory(dir, { ...opts(base), deleteAfter: true }));
  assert.ok((await stat(path.join(dir, 'bundle0.js.map'))).isFile());
  assert.ok((await stat(path.join(dir, 'bundle50.js.map'))).isFile());
});
test('PUT transient failure resends identical gzip bytes; expired URL gets a new presign', async (t) => {
  for (const mode of ['retryOnce', 'expireOnce']) {
    const { base, state } = await server(t, { [mode]: true });
    const dir = await artifacts(t);
    await uploadDirectory(dir, opts(base));
    assert.equal(state.puts.length, 2);
    assert.deepEqual(state.puts[0].body, state.puts[1].body);
    assert.equal(state.batches.length, mode === 'expireOnce' ? 2 : 1);
    assert.equal(state.confirmations.length, 1);
  }
});
test('API redirects cannot forward credentials; retries are bounded', async (t) => {
  const { base, state } = await server(t, {
    handle: ({ url, res }) => {
      if (url.pathname.includes('/rum/')) {
        res.writeHead(307, { Location: '/storage/stolen' });
        res.end();
        return true;
      }
    },
  });
  const dir = await artifacts(t);
  await assert.rejects(uploadDirectory(dir, opts(base)), /HTTP 307|redirect/);
  assert.equal(state.puts.length, 0);
  let count = 0;
  const retry = await server(t, {
    handle: ({ reply }) => {
      count++;
      reply(503, {});
      return true;
    },
  });
  await assert.rejects(new ApiClient(opts(retry.base)).listReleases(), /503/);
  assert.equal(count, 3);
});
test('never follows storage redirects or accepts credential headers from presign', async (t) => {
  const { base, state } = await server(t, {
    handle: ({ url, res }) => {
      if (url.pathname.startsWith('/storage/')) {
        res.writeHead(307, { Location: '/rum/stolen' });
        res.end();
        return true;
      }
    },
  });
  await assert.rejects(uploadDirectory(await artifacts(t), opts(base)), /307|redirect/);
  assert.equal(state.confirmations.length, 0);
  const attack = await server(t, {
    handle: ({ url, json, reply, base }) => {
      if (url.pathname.endsWith('/sourcemaps')) {
        reply(200, {
          files: json.files.map((f) => ({
            ...f,
            id: '22222222-2222-4222-8222-222222222222',
            upload_url: base + '/storage/attack',
            headers: { Authorization: 'Bearer test-api-key' },
          })),
        });
        return true;
      }
    },
  });
  await assert.rejects(uploadDirectory(await artifacts(t), opts(attack.base)), /header/);
  assert.equal(attack.state.puts.length, 0);
});
test('rejects unsafe filenames, duplicate IDs and oversize maps before any API call', async (t) => {
  const { base, state } = await server(t);
  const id = '33333333-3333-8333-8333-333333333333';
  for (const filename of ['../x.map', '/x.map', 'a\\b.map', 'a//b.map', 'a/./b.map', 'x\0.map']) {
    await assert.rejects(
      uploadMaps(
        [{ filename, map: { version: 3, sources: [], names: [], mappings: '', debugId: id } }],
        opts(base),
      ),
      /filename/,
    );
  }
  const map = { version: 3, sources: [], names: [], mappings: '', debugId: id };
  await assert.rejects(
    uploadMaps(
      [
        { filename: 'a.map', map },
        { filename: 'b.map', map },
      ],
      opts(base),
    ),
    /duplicate/i,
  );
  await assert.rejects(
    uploadMaps(
      [{ filename: 'a.map', map: { ...map, sourcesContent: ['x'.repeat(33554432)] } }],
      opts(base),
    ),
    /32 MB/,
  );
  assert.equal(state.api.length, 0);
});
test('release methods encode scope, preserve optional metadata and reject path escape', async (t) => {
  const { base, state } = await server(t);
  const api = new ApiClient(opts(base));
  await api.createRelease('v1', { commit: 'abc', env: 'production' });
  await api.deployRelease('v1', 'production');
  assert.equal((await api.listReleases())[0].version, 'v1');
  assert.deepEqual(state.api[0].json, { version: 'v1', commit_sha: 'abc', env: 'production' });
  assert.ok(state.api.every((r) => r.path.startsWith(`/rum/${APP}/releases`)));
  await assert.rejects(api.createRelease('..'), /release/);
  assert.throws(() => new ApiClient({ ...opts(base), app: '../foreign' }), /application/);
});
test('output changed while uploading preserves every map after confirmation', async (t) => {
  const dir = await artifacts(t, 2);
  const { base } = await server(t, {
    handle: async ({ url }) => {
      if (url.pathname.endsWith('/confirm'))
        await writeFile(path.join(dir, 'bundle1.js'), 'changed by build');
    },
  });
  await assert.rejects(uploadDirectory(dir, { ...opts(base), deleteAfter: true }), /changed/);
  assert.ok((await stat(path.join(dir, 'bundle0.js.map'))).isFile());
  assert.ok((await stat(path.join(dir, 'bundle1.js.map'))).isFile());
});
test('authentication failure and long Retry-After stop without retrying', async (t) => {
  for (const status of [401, 429]) {
    let count = 0;
    const { base } = await server(t, {
      handle: ({ res, reply }) => {
        count++;
        res.setHeader('Retry-After', '60');
        reply(status, {});
        return true;
      },
    });
    await assert.rejects(new ApiClient(opts(base)).listReleases(), /401|retry delay/);
    assert.equal(count, 1);
  }
});
