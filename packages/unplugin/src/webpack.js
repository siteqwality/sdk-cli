import { settings, defineValue, processAssets } from './shared.js';
export default function webpack(options) {
  const resolved = settings(options);
  return {
    apply(compiler) {
      const name = 'SiteQwalitySourceMaps';
      new compiler.webpack.DefinePlugin({ __SQ_RELEASE__: defineValue(resolved) }).apply(compiler);
      if (!compiler.options.devtool) compiler.options.devtool = 'source-map';
      if (
        !['source-map', 'hidden-source-map', 'nosources-source-map'].includes(
          compiler.options.devtool,
        )
      )
        throw new Error('Site Qwality requires full external webpack source maps');
      compiler.hooks.thisCompilation.tap(name, (compilation) => {
        compilation.hooks.processAssets.tapPromise(
          { name, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
          async () => {
            if (compilation.errors.length) return;
            const assets = new Map(
              compilation.getAssets().map((asset) => [asset.name, String(asset.source.source())]),
            );
            const { edits, remove } = await processAssets(assets, resolved);
            for (const [file, text] of edits)
              compilation.updateAsset(file, new compiler.webpack.sources.RawSource(text));
            for (const file of remove) compilation.deleteAsset(file);
          },
        );
      });
    },
  };
}
