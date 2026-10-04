import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { temp } from './helpers.js';
const exec = promisify(execFile);
const root = process.cwd();
test(
  'packed packages install offline and expose CLI, runtime exports and declarations',
  { timeout: 60000 },
  async (t) => {
    const dir = await temp(t);
    const packed = [];
    for (const name of ['cli', 'unplugin']) {
      const { stdout } = await exec(
        'npm',
        [
          'pack',
          '--json',
          '--ignore-scripts',
          '--workspace',
          `@siteqwality/${name}`,
          '--pack-destination',
          dir,
        ],
        { cwd: root },
      );
      const manifest = JSON.parse(stdout)[0];
      assert.ok(manifest.files.some((file) => file.path === 'src/index.d.ts'));
      assert.ok(manifest.files.some((file) => file.path === 'LICENSE'));
      assert.ok(!manifest.files.some((file) => /tests|node_modules|\.test-output/.test(file.path)));
      packed.push(path.join(dir, manifest.filename));
    }
    const consumer = path.join(dir, 'consumer');
    await mkdir(consumer);
    await writeFile(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'packed-consumer', private: true, type: 'module' }),
    );
    await exec(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--legacy-peer-deps',
        ...packed,
      ],
      { cwd: consumer },
    );
    const { stdout } = await exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict';
    import { inject } from '@siteqwality/cli';
    import * as adapters from '@siteqwality/unplugin';
    assert.ok(import.meta.resolve('@siteqwality/cli').includes('/consumer/node_modules/'));
    for (const name of ['vite','rollup','webpack','esbuild']) {
      assert.equal(typeof adapters[name], 'function');
      assert.equal(typeof (await import('@siteqwality/unplugin/'+name)).default, 'function');
    }
    const result = inject('void 0;', {version:3,sources:[],names:[],mappings:''});
    assert.equal(result.map.debugId, result.debugId);
    console.log('packed exports work');
  `,
      ],
      { cwd: consumer },
    );
    assert.match(stdout, /packed exports work/);
    const help = await exec(path.join(consumer, 'node_modules/.bin/siteqwality'), ['--help'], {
      cwd: consumer,
    });
    assert.match(help.stdout, /sourcemaps/);
    await writeFile(
      path.join(consumer, 'types.ts'),
      `import { vite, webpack, esbuild, rollup } from '@siteqwality/unplugin';\nvoid [vite({upload:false}),webpack(),esbuild(),rollup()];\n`,
    );
    await exec(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--module',
        'NodeNext',
        '--target',
        'ES2022',
        'types.ts',
      ],
      { cwd: consumer },
    );
    const manifest = JSON.parse(
      await readFile(path.join(consumer, 'node_modules/@siteqwality/cli/package.json'), 'utf8'),
    );
    assert.equal(manifest.version, '0.1.0');
  },
);
