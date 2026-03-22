const path = require('path');
const WebpackObfuscator = require('webpack-obfuscator');

const rootDir = __dirname;

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

function createConfig({
  name,
  target,
  entry,
  outputPath,
  filename
}) {
  return {
    name,
    mode: 'production',
    target,
    devtool: false,
    entry: path.resolve(rootDir, entry),
    output: {
      path: path.resolve(rootDir, outputPath),
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
      minimize: true,
    },
    performance: {
      hints: false,
    },
    plugins: [
      new WebpackObfuscator(obfuscationOptions, []),
    ],
  };
}

module.exports = [
  createConfig({
    name: 'main',
    target: 'electron-main',
    entry: 'src/main/index.js',
    outputPath: 'dist/main',
    filename: 'index.js',
  }),
  createConfig({
    name: 'preload',
    target: 'electron-preload',
    entry: 'src/main/preload.js',
    outputPath: 'dist/main',
    filename: 'preload.js',
  }),
  createConfig({
    name: 'renderer',
    target: 'electron-renderer',
    entry: 'src/renderer/index.js',
    outputPath: 'dist/public/assets/js',
    filename: 'app.js',
  }),
];