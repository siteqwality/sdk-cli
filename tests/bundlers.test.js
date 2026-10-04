import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { build as viteBuild } from 'vite';
import { rollup as rollupBuild } from 'rollup';
import webpackBuild from 'webpack';
import { build as esbuildBuild } from 'esbuild';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { vite, rollup, webpack, esbuild } from '../packages/unplugin/src/index.js';
import { temp } from './helpers.js';
import { server, APP } from './server.js';

async function build(t, kind, options, extra = {}) {
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js'),
    out = path.join(dir, 'out');
  await writeFile(
    input,
    '"use strict";\nglobalThis.release = __SQ_RELEASE__;\nglobalThis.marker = 12345;\n',
  );
  const output = path.join(out, 'bundle.js');
  if (kind === 'vite')
    await viteBuild({
      configFile: false,
      root: dir,
      logLevel: 'silent',
      plugins: [vite(options)],
      build: {
        minify: false,
        lib: { entry: input, formats: ['iife'], name: 'Fixture', fileName: () => 'bundle.js' },
        outDir: out,
        emptyOutDir: true,
        ...extra,
      },
    });
  if (kind === 'rollup') {
    const bundle = await rollupBuild({ input, plugins: [rollup(options)] });
    try {
      await bundle.write({ file: output, format: 'iife', sourcemap: true, ...extra });
    } finally {
      await bundle.close();
    }
  }
  if (kind === 'webpack')
    await new Promise((resolve, reject) => {
      const compiler = webpackBuild({
        mode: 'production',
        entry: input,
        devtool: 'source-map',
        optimization: { minimize: false },
        output: { path: out, filename: 'bundle.js' },
        plugins: [webpack(options)],
        ...extra,
      });
      compiler.run((err, stats) =>
        compiler.close((close) =>
          err || close || stats.hasErrors()
            ? reject(err || close || new Error(stats.toString()))
            : resolve(),
        ),
      );
    });
  if (kind === 'esbuild')
    await esbuildBuild({
      entryPoints: [input],
      outfile: output,
      bundle: true,
      format: 'iife',
      sourcemap: true,
      plugins: [esbuild(options)],
      ...extra,
    });
  return { dir, out, code: await readFile(output, 'utf8'), mapPath: output + '.map' };
}
for (const kind of ['vite', 'rollup', 'webpack', 'esbuild']) {
  test(`${kind} real build registers Debug ID, defines release and preserves original mapping`, async (t) => {
    const { base, state } = await server(t);
    const built = await build(t, kind, {
      app: APP,
      apiKey: 'test-api-key',
      apiBase: base,
      release: 'release-1',
      retryDelayMs: 0,
    });
    const ctx = {};
    vm.runInNewContext(built.code, ctx, { filename: 'bundle.js' });
    assert.equal(ctx.release, 'release-1');
    assert.equal(ctx.marker, 12345);
    const map = JSON.parse(await readFile(built.mapPath, 'utf8'));
    assert.deepEqual(Object.values(ctx._sqDebugIds), [map.debugId]);
    const lines = built.code.split('\n'),
      line = lines.findIndex((x) => x.includes('globalThis.marker'));
    const original = originalPositionFor(new TraceMap(map), {
      line: line + 1,
      column: lines[line].indexOf('globalThis.marker'),
    });
    assert.equal(original.line, 3);
    assert.equal(original.column, 0);
    assert.match(original.source, /entry\.js$/);
    assert.equal(state.puts.length, 1);
    assert.equal(state.confirmations.length, 1);
    assert.equal([...state.objects.values()][0].map.debugId, map.debugId);
  });
  test(`${kind} deleteAfter removes only successfully confirmed maps`, async (t) => {
    const { base, state } = await server(t);
    const built = await build(t, kind, {
      app: APP,
      apiKey: 'test-api-key',
      apiBase: base,
      release: 'r',
      deleteAfter: true,
    });
    assert.equal(state.confirmations.length, 1);
    assert.ok(!(await readdir(built.out)).some((n) => n.endsWith('.map')));
    assert.ok(built.code.includes('debugId='));
  });
}
test('upload:false enables a local build without credentials; default refuses missing credentials', async (t) => {
  const built = await build(t, 'esbuild', { upload: false, release: 'local' });
  assert.ok(built.code.includes('debugId='));
  await assert.rejects(build(t, 'rollup', { release: 'oops' }), /API key|application/);
});
test('esbuild write:false returns matching injected outputFiles without disk upload dependency', async (t) => {
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js');
  await writeFile(input, 'globalThis.release=__SQ_RELEASE__;');
  const result = await esbuildBuild({
    entryPoints: [input],
    outdir: path.join(dir, 'out'),
    bundle: true,
    sourcemap: true,
    write: false,
    plugins: [esbuild({ upload: false, release: 'memory' })],
  });
  const js = result.outputFiles.find((f) => f.path.endsWith('.js')),
    map = JSON.parse(result.outputFiles.find((f) => f.path.endsWith('.map')).text);
  const ctx = {};
  vm.runInNewContext(js.text, ctx);
  assert.equal(ctx.release, 'memory');
  assert.deepEqual(Object.values(ctx._sqDebugIds), [map.debugId]);
});
test('a confirmation failure fails the build and does not silently drop public maps', async (t) => {
  const { base } = await server(t, { confirmFailure: true });
  for (const kind of ['vite', 'rollup', 'webpack', 'esbuild'])
    await assert.rejects(
      build(t, kind, {
        app: APP,
        apiKey: 'test-api-key',
        apiBase: base,
        release: 'r',
        deleteAfter: true,
      }),
      /409/,
    );
});
test('Rollup returned chunk.map agrees with the emitted map asset', async (t) => {
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js');
  await writeFile(input, 'globalThis.answer=42;');
  const bundle = await rollupBuild({ input, plugins: [rollup({ upload: false })] });
  try {
    const result = await bundle.generate({ format: 'es', sourcemap: true });
    const chunk = result.output.find((f) => f.type === 'chunk');
    const map = JSON.parse(result.output.find((f) => f.fileName.endsWith('.map')).source);
    assert.equal(JSON.parse(chunk.map.toString()).debugId, map.debugId);
  } finally {
    await bundle.close();
  }
});
test('esbuild metafile describes final byte sizes and deleted maps', async (t) => {
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js');
  await writeFile(input, 'globalThis.answer=42;');
  const { base } = await server(t);
  const result = await esbuildBuild({
    entryPoints: [input],
    outdir: path.join(dir, 'out'),
    write: false,
    metafile: true,
    plugins: [esbuild({ app: APP, apiKey: 'test-api-key', apiBase: base, deleteAfter: true })],
  });
  assert.equal(result.outputFiles.length, 1);
  assert.equal(Object.keys(result.metafile.outputs).length, 1);
  assert.equal(
    Object.values(result.metafile.outputs)[0].bytes,
    result.outputFiles[0].contents.byteLength,
  );
});
test('Rollup code-split output registers and uploads a distinct map for every chunk', async (t) => {
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js');
  await writeFile(input, 'globalThis.load = () => import("./lazy.js");');
  await writeFile(path.join(dir, 'lazy.js'), 'export const answer = 42;');
  const { base, state } = await server(t);
  const bundle = await rollupBuild({
    input,
    plugins: [rollup({ app: APP, apiKey: 'test-api-key', apiBase: base, release: 'split' })],
  });
  try {
    const { output } = await bundle.generate({
      format: 'es',
      sourcemap: 'hidden',
      entryFileNames: 'assets/[name]-[hash].js',
      chunkFileNames: 'assets/[name]-[hash].js',
    });
    const chunks = output.filter((f) => f.type === 'chunk');
    assert.equal(chunks.length, 2);
    assert.equal(state.puts.length, 2);
    assert.equal(new Set(chunks.map((c) => c.map.debugId)).size, 2);
    for (const chunk of chunks) {
      assert.match(chunk.code, new RegExp(chunk.map.debugId));
      assert.ok(
        state.batches[0].some(
          (f) => f.filename === chunk.fileName + '.map' && f.debug_id === chunk.map.debugId,
        ),
      );
    }
  } finally {
    await bundle.close();
  }
});
test('esbuild rebuild starts from fresh bytes and keeps executable shebang output', async (t) => {
  const { context } = await import('esbuild');
  const { stat } = await import('node:fs/promises');
  const dir = await temp(t);
  const input = path.join(dir, 'entry.js'),
    output = path.join(dir, 'out.js');
  await writeFile(input, '#!/usr/bin/env node\n"use strict";globalThis.answer=1;');
  const ctx = await context({
    entryPoints: [input],
    outfile: output,
    bundle: true,
    plugins: [esbuild({ upload: false })],
  });
  try {
    await ctx.rebuild();
    const first = JSON.parse(await readFile(output + '.map', 'utf8')).debugId;
    assert.ok((await readFile(output, 'utf8')).startsWith('#!/usr/bin/env node\n'));
    assert.ok((await stat(output)).mode & 0o111);
    await writeFile(input, '#!/usr/bin/env node\n"use strict";globalThis.answer=2;');
    await ctx.rebuild();
    const code = await readFile(output, 'utf8'),
      second = JSON.parse(await readFile(output + '.map', 'utf8')).debugId;
    assert.notEqual(first, second);
    assert.equal([...code.matchAll(/sq-debug-id:end/g)].length, 1);
  } finally {
    await ctx.dispose();
  }
});
