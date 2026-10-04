import { tokenizer } from 'acorn';
/** Read real comments, excluding lookalikes in strings and template literals. */
export function sourceMapReference(code) {
  let reference;
  const tokens = tokenizer(code, {
    ecmaVersion: 'latest',
    allowHashBang: true,
    onComment(_block, text) {
      const match = text.match(/^\s*[@#]\s*sourceMappingURL=(\S+)\s*$/);
      if (match) reference = match[1];
    },
  });
  while (tokens.getToken().type.label !== 'eof') {
    /* Consume comments across the whole file. */
  }
  return reference;
}
