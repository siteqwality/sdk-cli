import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import MagicString from 'magic-string';
import remapping from '@ampproject/remapping';

function debugId(code) {
  const bytes = createHash('sha256')
    .update('siteqwality-debug-id-v1\0')
    .update(code)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function registrationFor(id) {
  return `\n/* sq-debug-id:${id} */\n;try{(globalThis._sqDebugIds ||= {})[new Error().stack]="${id}"}catch{}\n/* sq-debug-id:end */\n`;
}

export function validateMap(map) {
  if (
    !map ||
    map.version !== 3 ||
    map.sections ||
    !Array.isArray(map.sources) ||
    !Array.isArray(map.names) ||
    typeof map.mappings !== 'string'
  ) {
    throw new Error('Expected a flat version 3 source map');
  }
}

/** Insert after directives, composing an edit map with the original map. */
export function inject(code, inputMap) {
  const map = typeof inputMap === 'string' ? JSON.parse(inputMap) : inputMap;
  validateMap(map);
  const existing = code.match(
    /\n\/\* sq-debug-id:([0-9a-f-]{36}) \*\/\n;try\{[^\n]+\}catch\{\}\n\/\* sq-debug-id:end \*\/\n/,
  );
  if (existing) {
    const id = existing[1];
    if (existing[0] !== registrationFor(id))
      throw new Error('Injected registration changed; rebuild before injecting');
    const suffix = `\n//# debugId=${id}\n`;
    if (!code.endsWith(suffix) || map.debugId !== id) throw new Error('Debug ID pair mismatch');
    const original =
      code.slice(0, existing.index) +
      code.slice(existing.index + existing[0].length, -suffix.length);
    if (debugId(original) !== id)
      throw new Error('Injected JavaScript changed; rebuild before injecting');
    return { code, map, debugId: id };
  }
  if (map.debugId || /sq-debug-id:|\/\/[@#]\s*debugId=/.test(code))
    throw new Error('Unrecognized Debug ID; start from a clean build');
  const parserOptions = {
    ecmaVersion: 'latest',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
  };
  let ast;
  try {
    ast = parse(code, { ...parserOptions, sourceType: 'script' });
  } catch {
    ast = parse(code, { ...parserOptions, sourceType: 'module' });
  }
  let offset = code.startsWith('#!')
    ? code.indexOf('\n') === -1
      ? code.length
      : code.indexOf('\n') + 1
    : 0;
  for (const statement of ast.body) {
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break;
    offset = statement.end;
  }
  const id = debugId(code);
  const registration = registrationFor(id);
  const edit = new MagicString(code);
  edit.appendLeft(offset, registration);
  edit.append(`\n//# debugId=${id}\n`);
  const composed = remapping(
    [
      JSON.parse(edit.generateMap({ hires: true, source: map.file || 'bundle.js' }).toString()),
      map,
    ],
    () => null,
  );
  const outputMap = { ...map, ...JSON.parse(composed.toString()), debugId: id };
  // remapping resolves sourceRoot into sources; retaining it would resolve paths twice.
  delete outputMap.sourceRoot;
  return { code: edit.toString(), map: outputMap, debugId: id };
}
