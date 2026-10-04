import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import MagicString from 'magic-string';
export async function temp(t) {
  const base = path.resolve('.test-output');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
export async function pair(dir, name = 'bundle.js', code = '"use strict";\nglobalThis.answer=42;') {
  await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
  await writeFile(path.join(dir, name), code);
  await writeFile(
    path.join(dir, name + '.map'),
    new MagicString(code)
      .generateMap({ hires: true, source: 'source.js', includeContent: true })
      .toString(),
  );
}
