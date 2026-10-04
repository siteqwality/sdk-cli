import replace from '@rollup/plugin-replace';
import { settings, defineValue, processAssets } from './shared.js';

export function outputPlugin(options) {
  return {
    name: 'siteqwality-sourcemaps',
    outputOptions(output) {
      if (output.sourcemap === 'inline')
        throw new Error('SiteQwality requires external source maps');
      return { ...output, sourcemap: output.sourcemap || true };
    },
    generateBundle: {
      order: 'post',
      async handler(output, bundle) {
        const assets = new Map();
        for (const [name, asset] of Object.entries(bundle)) {
          assets.set(name, asset.type === 'chunk' ? asset.code : String(asset.source));
        }
        const { edits, chunkMaps, remove } = await processAssets(assets, options);
        for (const [name, text] of edits) {
          const asset = bundle[name];
          if (asset.type === 'chunk') {
            asset.code = text;
            const map = chunkMaps.get(name);
            asset.map = {
              ...map,
              toString() {
                return JSON.stringify(this);
              },
              toUrl() {
                return `data:application/json;charset=utf-8;base64,${Buffer.from(this.toString()).toString('base64')}`;
              },
            };
          } else asset.source = text;
        }
        for (const name of remove) delete bundle[name];
      },
    },
  };
}
export default function rollup(options) {
  const resolved = settings(options);
  return [
    replace({ preventAssignment: true, values: { __SQ_RELEASE__: defineValue(resolved) } }),
    outputPlugin(resolved),
  ];
}
