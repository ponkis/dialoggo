const path = require('path');
const webpack = require('webpack');
const WebpackObfuscator = require('webpack-obfuscator');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

const obfuscationOptions = {
  compact: true,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

/**
 * @param {object} options
 * @param {'development'|'production'} options.mode   Webpack optimization mode.
 * @param {'development'|'production'} options.appEnv App environment baked into the bundle.
 */
function createConfigs({
  mode = 'production',
  appEnv = 'production',
} = {}) {
  const isProductionMode = mode === 'production';

  function createConfig({
    name,
    target,
    entry,
    outputPath,
    filename,
  }) {
    return {
      name,
      mode,
      target,
      context: rootDir,
      devtool: isProductionMode ? false : 'inline-source-map',
      entry: path.resolve(rootDir, entry),
      output: {
        path: outputPath,
        filename,
      },
      externals: {
        electron: 'commonjs2 electron',
      },
      node: {
        __dirname: false,
        __filename: false,
      },
      optimization: {
        minimize: isProductionMode,
      },
      performance: {
        hints: false,
      },
      plugins: [
        new webpack.DefinePlugin({
          'process.env.DIALOGGO_ENV': JSON.stringify(appEnv),
        }),
        ...(isProductionMode ? [new WebpackObfuscator(obfuscationOptions, [])] : []),
      ],
    };
  }

  return [
    createConfig({
      name: 'main',
      target: 'electron-main',
      entry: 'src/main/index.js',
      outputPath: path.join(distDir, 'main'),
      filename: 'index.js',
    }),
    createConfig({
      name: 'preload',
      target: 'electron-preload',
      entry: 'src/preload/index.js',
      outputPath: path.join(distDir, 'preload'),
      filename: 'index.js',
    }),
    createConfig({
      name: 'renderer',
      target: 'web',
      entry: 'src/renderer/index.js',
      outputPath: path.join(distDir, 'renderer', 'assets', 'js'),
      filename: 'app.js',
    }),
  ];
}

module.exports = {
  createConfigs,
  distDir,
};
