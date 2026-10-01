const path = require('path');
const { spawn } = require('child_process');
const electronPath = require('electron');
const webpack = require('webpack');
const webpackConfigs = require('../webpack.config');

const rootDir = path.resolve(__dirname, '..');
const rendererConfig = webpackConfigs.find((config) => config.name === 'renderer');

if (!rendererConfig) {
  console.error('[dev] Renderer Webpack configuration is missing.');
  process.exit(1);
}

const developmentConfig = {
  ...rendererConfig,
  mode: 'development',
  devtool: false,
  optimization: {
    ...rendererConfig.optimization,
    minimize: false,
  },
  output: {
    ...rendererConfig.output,
    path: path.join(rootDir, 'public', 'assets', 'js'),
    filename: 'app.js',
  },
  plugins: [],
};

webpack(developmentConfig, (error, stats) => {
  if (error) {
    console.error('[dev] Could not compile the renderer bundle.');
    console.error(error);
    process.exitCode = 1;
    return;
  }

  if (!stats) {
    console.error('[dev] Webpack did not return renderer build stats.');
    process.exitCode = 1;
    return;
  }

  const output = stats.toString({
    colors: true,
    chunks: false,
    modules: false,
  });

  if (output.trim()) console.log(output);
  if (stats.hasErrors()) {
    console.error('[dev] Renderer compilation failed.');
    process.exitCode = 1;
    return;
  }

  const app = spawn(electronPath, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  app.on('error', (spawnError) => {
    console.error('[dev] Could not start Electron.');
    console.error(spawnError);
    process.exitCode = 1;
  });

  app.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
});
