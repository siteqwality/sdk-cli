import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import MagicString from 'magic-string';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { inject } from '../packages/cli/src/inject.js';

const mapFor = (code) =>
  JSON.parse(
    new MagicString(code)
      .generateMap({ hires: true, source: 'original.js', includeContent: true })
      .toString(),
  );
for (const prefix of [
  '"use strict";\n',
  '#!/usr/bin/env node\r\n"use strict";\r\n',
  '/* license */\n"use strict"\n"custom directive"\n',
]) {
  test(`registration preserves directive semantics and shebang ${JSON.stringify(prefix)}`, () => {
    const code =
      prefix +
      'globalThis.strict = (function(){return this})() === undefined;\nglobalThis.answer = 42;';
    const out = inject(code, mapFor(code));
    assert.ok(out.code.startsWith(prefix.trimEnd()));
    const ctx = {};
    vm.runInNewContext(out.code, ctx, { filename: 'bundle.js' });
    assert.equal(ctx.strict, true);
    assert.equal(ctx.answer, 42);
    assert.deepEqual(Object.values(ctx._sqDebugIds), [out.debugId]);
    assert.equal(out.map.debugId, out.debugId);
    assert.equal(out.map.sourcesContent[0], code);
    const lines = out.code.split('\n');
    const line = lines.findIndex((x) => x.includes('globalThis.answer'));
    const pos = originalPositionFor(new TraceMap(out.map), {
      line: line + 1,
      column: lines[line].indexOf('answer'),
    });
    assert.equal(pos.source, 'original.js');
    assert.equal(pos.line, code.split('\n').length);
    assert.equal(pos.column, 11);
    assert.equal(
      originalPositionFor(new TraceMap(out.map), {
        line: out.code.slice(0, out.code.indexOf('try{')).split('\n').length,
        column: 1,
      }).source,
      null,
    );
  });
}
test('same-line directive preserves every original column after insertion', () => {
  const code = '"use strict";globalThis.answer=42;';
  const out = inject(code, mapFor(code));
  const line = out.code.split('\n').findIndex((l) => l.includes('globalThis.answer'));
  const pos = originalPositionFor(new TraceMap(out.map), { line: line + 1, column: 11 });
  assert.deepEqual(pos, { source: 'original.js', line: 1, column: 24, name: null });
});
test('deterministic, idempotent, and distinguishes different code', () => {
  const code = 'globalThis.answer=42;';
  const map = mapFor(code);
  const a = inject(code, map),
    b = inject(code, map);
  assert.deepEqual(a, b);
  assert.deepEqual(inject(a.code, a.map), a);
  assert.notEqual(inject(code + '\n', map).debugId, a.debugId);
  assert.match(a.debugId, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.throws(() => inject(a.code.replace('answer=42', 'answer=43'), a.map), /changed|mismatch/);
  assert.throws(() => inject(a.code, { ...a.map, debugId: 'wrong' }), /mismatch/);
});
test('injection registers before an early exception and tolerates a hostile registry', () => {
  const code = 'throw new Error("early");';
  const out = inject(code, mapFor(code));
  const ctx = {};
  assert.throws(() => vm.runInNewContext(out.code, ctx, { filename: 'bundle.js' }), /early/);
  assert.equal(Object.values(ctx._sqDebugIds)[0], out.debugId);
  const safe = inject('globalThis.answer=42;', mapFor('globalThis.answer=42;'));
  const hostile = { _sqDebugIds: 1 };
  vm.runInNewContext(safe.code, hostile);
  assert.equal(hostile.answer, 42);
});
test('rejects invalid or indexed maps and foreign Debug IDs before modifying', () => {
  assert.throws(() => inject('let x=1;', { version: 2 }), /source map/);
  assert.throws(() => inject('let x=1;', { version: 3, sections: [] }), /source map/);
  assert.throws(() => inject('let x=1;\n//# debugId=foreign', mapFor('let x=1;')), /Debug ID/);
});
test('sloppy scripts remain valid and retain their non-strict semantics', () => {
  const code = 'with ({answer:42}) {globalThis.answer=answer;}';
  const out = inject(code, mapFor(code));
  const ctx = {};
  vm.runInNewContext(out.code, ctx);
  assert.equal(ctx.answer, 42);
});
test('idempotency rejects a modified registration body', () => {
  const out = inject('void 0;', mapFor('void 0;'));
  assert.throws(
    () => inject(out.code.replace('_sqDebugIds', '_otherRegistry'), out.map),
    /registration|changed/,
  );
});
