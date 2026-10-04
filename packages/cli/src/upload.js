import { gzipSync } from 'node:zlib';
import { readFile, unlink, lstat, realpath } from 'node:fs/promises';
import { ApiClient, isUuid, safeUrl } from './api.js';
import { collectPairs } from './files.js';
import { inject, validateMap } from './inject.js';

function filename(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    Buffer.byteLength(value) > 1024 ||
    /[\x00-\x1f\x7f\\]/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid source-map filename');
}
async function concurrent(items, limit, work) {
  let next = 0,
    failure;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failure && next < items.length) {
        const item = items[next++];
        try {
          await work(item);
        } catch (err) {
          failure ||= err;
        }
      }
    }),
  );
  if (failure) throw failure;
}
function validatePresign(data, batch) {
  if (!Array.isArray(data?.files) || data.files.length !== batch.length)
    throw new Error('Incomplete presign response');
  const ids = new Set();
  return batch.map((file) => {
    const matches = data.files.filter((item) => item.filename === file.filename);
    const row = matches[0];
    if (
      matches.length !== 1 ||
      !isUuid(row.id) ||
      ids.has(row.id) ||
      row.debug_id !== file.debug_id
    )
      throw new Error('Presign response mismatch');
    ids.add(row.id);
    safeUrl(row.upload_url);
    if (!row.headers || typeof row.headers !== 'object' || Array.isArray(row.headers))
      throw new Error('Missing upload headers');
    const headers = Object.entries(row.headers);
    const lowered = Object.fromEntries(headers.map(([k, v]) => [k.toLowerCase(), v]));
    if (
      headers.some(
        ([k, v]) =>
          !['content-type', 'content-encoding'].includes(k.toLowerCase()) || typeof v !== 'string',
      ) ||
      headers.length !== 2 ||
      lowered['content-type'] !== 'application/json' ||
      lowered['content-encoding'] !== 'gzip'
    )
      throw new Error('Unexpected presigned upload header');
    return { ...row, bytes: file.bytes, size_bytes: file.size_bytes };
  });
}

export async function uploadMaps(maps, options) {
  if (!Array.isArray(maps) || maps.length === 0) throw new Error('No source maps to upload');
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new Error('concurrency must be 1 to 16');
  const names = new Set(),
    debugIds = new Set();
  const files = maps.map(({ filename: name, map }) => {
    filename(name);
    validateMap(map);
    if (!isUuid(map.debugId)) throw new Error('Inject Debug IDs before uploading maps');
    if (names.has(name) || debugIds.has(map.debugId))
      throw new Error('Duplicate filename or Debug ID');
    names.add(name);
    debugIds.add(map.debugId);
    const json = Buffer.from(JSON.stringify(map));
    if (json.length > 33_554_432) throw new Error('Source map exceeds 32 MB inflated limit');
    const bytes = gzipSync(json);
    if (bytes.length > 33_554_432) throw new Error('Source map exceeds 32 MB upload limit');
    return {
      filename: name,
      debug_id: map.debugId,
      size_bytes: bytes.length,
      content_type: 'application/json',
      content_encoding: 'gzip',
      bytes,
    };
  });
  const client = new ApiClient(options);
  const version = options.release ?? '__debug_id__';
  await client.createRelease(version, { commit: options.commit, env: options.env });
  const allIds = new Set();
  for (let offset = 0; offset < files.length; offset += 50) {
    const batch = files.slice(offset, offset + 50);
    let uploads;
    for (let generation = 0; ; generation++) {
      uploads = validatePresign(
        await client.presign(
          version,
          batch.map(({ bytes, ...metadata }) => metadata),
        ),
        batch,
      );
      for (const item of uploads) {
        if (allIds.has(item.id)) throw new Error('Duplicate upload ID across batches');
        allIds.add(item.id);
      }
      try {
        await concurrent(uploads, concurrency, (file) =>
          client.put(file.upload_url, file.headers, file.bytes),
        );
        break;
      } catch (err) {
        // S3 URLs expire. Request new IDs/URLs, rather than retrying an expired signature.
        if (err.status !== 403 || generation >= client.retries) throw err;
      }
    }
    const confirmed = await client.confirm(uploads.map((file) => file.id));
    if (!Array.isArray(confirmed?.files) || confirmed.files.length !== uploads.length)
      throw new Error('Incomplete confirmation response');
    for (const file of uploads) {
      const matching = confirmed.files.filter((item) => item.id === file.id);
      if (
        matching.length !== 1 ||
        matching[0].status !== 'ready' ||
        matching[0].debug_id !== file.debug_id ||
        matching[0].size_bytes !== file.size_bytes
      )
        throw new Error('Confirmation metadata mismatch');
    }
  }
  return { uploaded: files.length, debugIds: [...debugIds] };
}

export async function uploadDirectory(directory, options) {
  const pairs = await collectPairs(directory);
  const maps = pairs.map((pair) => {
    const map = JSON.parse(pair.rawMap);
    if (!map.debugId) throw new Error('Run sourcemaps inject before upload');
    inject(pair.code, map); // Verify the existing ID still describes these exact JavaScript bytes.
    return { filename: pair.filename, map };
  });
  const result = await uploadMaps(maps, options);
  if (options.deleteAfter) {
    // Validate every file before deleting any, including changes made during network requests.
    for (const pair of pairs) {
      if (
        (await lstat(pair.mapPath)).isSymbolicLink() ||
        (await realpath(pair.mapPath)) !== pair.mapPath ||
        (await readFile(pair.mapPath, 'utf8')) !== pair.rawMap ||
        (await readFile(pair.jsPath, 'utf8')) !== pair.code
      )
        throw new Error('Output changed during upload; maps were not deleted');
    }
    for (const pair of pairs) await unlink(pair.mapPath);
  }
  return result;
}
