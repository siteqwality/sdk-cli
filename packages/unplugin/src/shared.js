import path from 'node:path';
import { inject, uploadMaps, sourceMapReference } from '@siteqwality/cli';

export function settings(options = {}) {
  const out = { ...options };
  out.release ??= process.env.SITEQWALITY_RELEASE;
  out.app ??= process.env.SITEQWALITY_APP_ID;
  out.apiKey ??= process.env.SITEQWALITY_API_KEY;
  out.apiBase ??= process.env.SITEQWALITY_API_URL;
  if (out.deleteAfter && out.upload === false)
    throw new Error('deleteAfter requires confirmed uploads');
  if (out.release !== undefined && (typeof out.release !== 'string' || !out.release.trim()))
    throw new Error('Invalid release');
  return out;
}
export const defineValue = (options) => JSON.stringify(options.release ?? '');

/** Transform a bundler's own output set, never scan an unrelated directory. */
export async function processAssets(assets, options) {
  const edits = new Map(),
    chunkMaps = new Map(),
    maps = [],
    used = new Set();
  for (const [name, code] of assets) {
    if (!/\.(?:c|m)?js$/.test(name)) continue;
    const ref = sourceMapReference(code);
    if (ref && /^[a-z][a-z\d+.-]*:|^\/|[?#\\]/i.test(ref))
      throw new Error('Use external source maps, not inline or remote maps');
    const mapName = ref
      ? path.posix.normalize(path.posix.join(path.posix.dirname(name), decodeURIComponent(ref)))
      : `${name}.map`;
    if (!assets.has(mapName)) throw new Error(`Missing external source map for ${name}`);
    if (used.has(mapName)) throw new Error('Multiple output chunks share a source map');
    used.add(mapName);
    const output = inject(code, assets.get(mapName));
    chunkMaps.set(name, output.map);
    edits.set(name, output.code);
    edits.set(mapName, JSON.stringify(output.map));
    maps.push({ filename: mapName, map: output.map });
  }
  if (maps.length && options.upload !== false) await uploadMaps(maps, options);
  return { edits, chunkMaps, remove: options.deleteAfter ? [...used] : [] };
}
