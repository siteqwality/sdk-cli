import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
export const APP = '11111111-1111-4111-8111-111111111111';
export async function server(t, options = {}) {
  const state = {
    api: [],
    puts: [],
    batches: [],
    confirmations: [],
    active: 0,
    maxActive: 0,
    objects: new Map(),
    failures: [],
    putAttempts: 0,
  };
  let base;
  const srv = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, base);
      const json = body.length && !url.pathname.startsWith('/storage/') ? JSON.parse(body) : null;
      const reply = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data }));
      };
      if (
        options.handle &&
        (await options.handle({ req, res, url, json, body, state, reply, base }))
      )
        return;
      if (url.pathname.startsWith('/storage/')) {
        state.putAttempts++;
        state.active++;
        state.maxActive = Math.max(state.maxActive, state.active);
        await new Promise((r) => setTimeout(r, 8));
        state.active--;
        state.puts.push({ headers: req.headers, body, url: req.url });
        if (req.headers.authorization || req.headers.cookie)
          throw Error('Credential sent to storage');
        if (options.expireOnce && state.putAttempts === 1) return reply(403, {});
        if (options.retryOnce && state.putAttempts === 1) {
          res.setHeader('Retry-After', '0');
          return reply(503, {});
        }
        state.objects.set(url.pathname.split('/').at(-1), {
          body,
          map: JSON.parse(gunzipSync(body)),
        });
        return reply(200, {});
      }
      state.api.push({ method: req.method, path: req.url, json, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer test-api-key') return reply(401, {});
      if (req.method === 'GET') return reply(200, [{ version: 'v1' }]);
      if (url.pathname.endsWith('/sourcemaps/confirm')) {
        state.confirmations.push(json.ids);
        if (options.confirmFailure) return reply(409, {});
        const files = json.ids.map((id) => ({
          id,
          status: 'ready',
          debug_id: state.objects.get(id)?.map.debugId,
          size_bytes: state.objects.get(id)?.body.length,
        }));
        return reply(200, { files: options.missingConfirm ? files.slice(1) : files });
      }
      if (url.pathname.endsWith('/sourcemaps')) {
        state.batches.push(json.files);
        const files = json.files
          .map((f) => ({ ...f, id: randomUUID() }))
          .map((f) => ({
            ...f,
            upload_url: `${base}/storage/${f.id}?signature=fake`,
            s3_key: 'opaque',
            expires_in_seconds: 300,
            headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
          }));
        return reply(200, { files: options.missingPresign ? files.slice(1) : files });
      }
      return reply(201, { version: json?.version || 'v1' });
    } catch (err) {
      state.failures.push(err.message);
      res.writeHead(500);
      res.end();
    }
  });
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  base = `http://127.0.0.1:${srv.address().port}`;
  t.after(
    () =>
      new Promise((resolve) => {
        srv.close(resolve);
        srv.closeAllConnections();
      }),
  );
  return { base, state };
}
