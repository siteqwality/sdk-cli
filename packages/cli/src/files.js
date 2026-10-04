import { readdir, readFile, realpath, lstat, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inject } from './inject.js';
import { sourceMapReference } from './comments.js';

export function inside(root, file) {
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('File is outside output directory');
  return relative;
}

export async function collectPairs(directory) {
  const root = await realpath(directory);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Output directory contains a symlink');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && /\.(?:c|m)?js$/.test(entry.name)) files.push(full);
    }
  }
  await walk(root);
  const pairs = [];
  const seen = new Set();
  for (const jsPath of files.sort()) {
    const code = await readFile(jsPath, 'utf8');
    const reference = sourceMapReference(code);
    if (reference && /^[a-z][a-z\d+.-]*:|^\/|[?#\\]/i.test(reference))
      throw new Error('Unsupported external or inline source map');
    const mapPath = reference
      ? path.resolve(path.dirname(jsPath), decodeURIComponent(reference))
      : `${jsPath}.map`;
    inside(root, mapPath);
    let stat;
    try {
      stat = await lstat(mapPath);
    } catch (err) {
      if (!reference && err.code === 'ENOENT') continue;
      throw err;
    }
    if (stat.isSymbolicLink()) throw new Error('Source map is a symlink');
    if (!stat.isFile()) throw new Error('Expected a source map file');
    inside(root, await realpath(mapPath));
    if (seen.has(mapPath))
      throw new Error('Multiple JavaScript files reference the same source map');
    seen.add(mapPath);
    const rawMap = await readFile(mapPath, 'utf8');
    pairs.push({
      jsPath,
      mapPath,
      filename: inside(root, mapPath).split(path.sep).join('/'),
      code,
      rawMap,
    });
  }
  if (!pairs.length) throw new Error('No JavaScript files with external source maps found');
  return pairs;
}

async function atomicWrite(file, text) {
  const tmp = `${file}.sq-${randomUUID()}.tmp`;
  const { mode } = await lstat(file);
  try {
    await writeFile(tmp, text, { flag: 'wx', mode });
    await rename(tmp, file);
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function injectDirectory(directory) {
  const pairs = await collectPairs(directory);
  // Validate and transform every pair before changing any file.
  const outputs = pairs.map((pair) => ({ ...pair, ...inject(pair.code, pair.rawMap) }));
  for (const output of outputs) {
    const mapText = JSON.stringify(output.map);
    if (output.code !== pairs.find((p) => p.jsPath === output.jsPath).code)
      await atomicWrite(output.jsPath, output.code);
    if (mapText !== output.rawMap) await atomicWrite(output.mapPath, mapText);
  }
  return outputs.map(({ filename, debugId }) => ({ filename, debugId }));
}
