import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { temp, pair } from './helpers.js';
import { injectDirectory, collectPairs } from '../packages/cli/src/files.js';

test('injects nested hidden maps and explicit map references, twice without changes', async (t) => {
  const dir = await temp(t);
  await pair(dir, 'assets/app.js');
  await pair(dir, 'worker.mjs', 'globalThis.answer=1;\n//# sourceMappingURL=worker.mjs.map');
  const first = await injectDirectory(dir);
  assert.equal(first.length, 2);
  const before = await readFile(path.join(dir, 'assets/app.js'), 'utf8');
  await injectDirectory(dir);
  assert.equal(await readFile(path.join(dir, 'assets/app.js'), 'utf8'), before);
  const maps = await collectPairs(dir);
  assert.equal(maps[0].filename, 'assets/app.js.map');
  assert.equal(JSON.parse(await readFile(maps[0].mapPath, 'utf8')).debugId, first[0].debugId);
});
test('invalid later map prevents any injection writes', async (t) => {
  const dir = await temp(t);
  await pair(dir, 'a.js');
  await pair(dir, 'b.js');
  await writeFile(path.join(dir, 'b.js.map'), '{}');
  const before = await readFile(path.join(dir, 'a.js'), 'utf8');
  await assert.rejects(injectDirectory(dir), /source map/);
  assert.equal(await readFile(path.join(dir, 'a.js'), 'utf8'), before);
});
for (const reference of [
  '../outside.js.map',
  'https://evil.example/map',
  'data:application/json;base64,e30=',
  'missing.map',
]) {
  test(`refuses unsupported or missing sourceMappingURL ${reference}`, async (t) => {
    const dir = await temp(t);
    await pair(dir, 'bundle.js', `globalThis.answer=1;\n//# sourceMappingURL=${reference}`);
    await assert.rejects(injectDirectory(dir), /source map|outside|external|inline|ENOENT/);
  });
}
test('does not follow a source-map symlink outside the output directory', async (t) => {
  const dir = await temp(t),
    other = await temp(t);
  await pair(other);
  await writeFile(path.join(dir, 'bundle.js'), 'globalThis.answer=1;');
  await symlink(path.join(other, 'bundle.js.map'), path.join(dir, 'bundle.js.map'));
  await assert.rejects(injectDirectory(dir), /symlink|outside/);
});
test('an empty output directory fails instead of claiming success', async (t) => {
  await assert.rejects(injectDirectory(await temp(t)), /No JavaScript/);
});
test('finds same-line and block map comments without treating template content as comments', async (t) => {
  for (const comment of ['//# sourceMappingURL=custom.map', '/*# sourceMappingURL=custom.map */']) {
    const dir = await temp(t);
    await pair(dir, 'app.js', `void 0;${comment}`);
    await writeFile(path.join(dir, 'custom.map'), await readFile(path.join(dir, 'app.js.map')));
    assert.equal((await collectPairs(dir))[0].filename, 'custom.map');
  }
  const dir = await temp(t);
  await pair(
    dir,
    'app.js',
    'globalThis.text=`\n//# sourceMappingURL=https://example.invalid/fake.map\n`;',
  );
  assert.equal((await injectDirectory(dir)).length, 1);
});
