// Test processes must never contact a live API, even if credentials exist in the shell.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('SITEQWALITY_')) delete process.env[key];
}
const networkFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw new Error('Tests permit loopback HTTP requests only');
  }
  return networkFetch(input, init);
};
