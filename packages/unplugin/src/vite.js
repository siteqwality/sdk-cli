import { settings, defineValue } from './shared.js';
import { outputPlugin } from './rollup.js';
export default function vite(options) {
  const resolved = settings(options);
  return {
    ...outputPlugin(resolved),
    name: 'siteqwality-vite',
    enforce: 'post',
    apply: 'build',
    config() {
      return { define: { __SQ_RELEASE__: defineValue(resolved) }, build: { sourcemap: true } };
    },
  };
}
