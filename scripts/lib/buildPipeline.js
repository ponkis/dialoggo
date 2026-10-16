const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const {
  createConfigs,
  distDir,
} = require('../../webpack.config');

const rootDir = path.resolve(__dirname, '..', '..');
const publicDir = path.join(rootDir, 'public');
const rendererHtmlPath = path.join(rootDir, 'src', 'renderer', 'index.html');
const packageJsonPath = path.join(rootDir, 'package.json');
const rendererOutDir = path.join(distDir, 'renderer');
// Files the pipeline writes into dist/renderer itself; never pruned as stale.
const GENERATED_RENDERER_PATHS = new Set([
  'index.html',
  path.join('assets', 'js'),
]);

const APP_ENVIRONMENTS = new Set(['development', 'production']);
const MODES = new Set(['development', 'production']);

function log(message) {
  console.log(`[build] ${message}`);
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

/**
 * Development builds carry a -dev suffix (optionally with a CI run number) so
 * a dev build can never be mistaken for, or auto-updated to, a release.
 */
function resolveBuildVersion(baseVersion, appEnv, versionSuffix = '') {
  if (appEnv !== 'development') return baseVersion;
  const suffix = String(versionSuffix || '').trim();
  return suffix ? `${baseVersion}-dev.${suffix}` : `${baseVersion}-dev`;
}

function parseBuildArgs(argv) {
  const options = {
    mode: 'production',
    appEnv: 'production',
    versionSuffix: process.env.DIALOGGO_VERSION_SUFFIX || '',
    clean: true,
  };

  argv.forEach((argument) => {
    const [flag, value] = argument.split('=');
    if (flag === '--mode') options.mode = value;
    else if (flag === '--env') options.appEnv = value;
    else if (flag === '--version-suffix') options.versionSuffix = value;
    else if (flag === '--no-clean') options.clean = false;
    else throw new Error(`Unknown build option: ${argument}`);
  });

  if (!MODES.has(options.mode)) throw new Error(`--mode must be one of: ${[...MODES].join(', ')}`);
  if (!APP_ENVIRONMENTS.has(options.appEnv)) throw new Error(`--env must be one of: ${[...APP_ENVIRONMENTS].join(', ')}`);

  return options;
}

function filesMatch(sourceStats, destinationPath) {
  try {
    const destinationStats = fs.statSync(destinationPath);
    return destinationStats.isFile() &&
      destinationStats.size === sourceStats.size &&
      Math.abs(destinationStats.mtimeMs - sourceStats.mtimeMs) < 1;
  } catch {
    return false;
  }
}

/** Mirrors sourceDir into destinationDir, copying only changed files and pruning stale ones. */
function syncDirectory(sourceDir, destinationDir, relativeDir = '') {
  let copied = 0;
  fs.mkdirSync(destinationDir, {
    recursive: true,
  });

  const sourceEntries = new Set(fs.readdirSync(sourceDir));

  fs.readdirSync(destinationDir).forEach((entry) => {
    const relativePath = path.join(relativeDir, entry);
    if (sourceEntries.has(entry) || GENERATED_RENDERER_PATHS.has(relativePath)) return;
    fs.rmSync(path.join(destinationDir, entry), {
      recursive: true,
      force: true,
    });
  });

  sourceEntries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry);
    const destinationPath = path.join(destinationDir, entry);
    const stats = fs.statSync(sourcePath);

    if (stats.isDirectory()) {
      copied += syncDirectory(sourcePath, destinationPath, path.join(relativeDir, entry));
      return;
    }

    if (filesMatch(stats, destinationPath)) return;
    fs.copyFileSync(sourcePath, destinationPath);
    fs.utimesSync(destinationPath, stats.atime, stats.mtime);
    copied += 1;
  });

  return copied;
}

function writeDistPackageJson(version) {
  const pkg = readPackageJson();

  const distPackageJson = {
    name: pkg.name,
    productName: pkg.productName,
    version,
    description: pkg.description,
    author: pkg.author,
    homepage: pkg.homepage,
    license: pkg.license,
    private: true,
    main: 'main/index.js',
  };

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    `${JSON.stringify(distPackageJson, null, 2)}\n`,
    'utf8',
  );
}

function runWebpack(configs) {
  return new Promise((resolve, reject) => {
    webpack(configs, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      if (!stats) {
        reject(new Error('Webpack did not return build stats.'));
        return;
      }

      const output = stats.toString({
        colors: true,
        chunks: false,
        modules: false,
      });

      if (output.trim()) {
        console.log(output);
      }

      if (stats.hasErrors()) {
        reject(new Error('Webpack build failed.'));
        return;
      }

      resolve();
    });
  });
}

async function buildApp({
  mode = 'production',
  appEnv = 'production',
  versionSuffix = '',
  clean = true,
} = {}) {
  const version = resolveBuildVersion(readPackageJson().version, appEnv, versionSuffix);
  log(`Building ${appEnv} app ${version} (${mode} bundles)`);

  if (clean) {
    log('Cleaning dist directory');
    fs.rmSync(distDir, {
      recursive: true,
      force: true,
    });
  }

  log('Syncing public assets');
  const copied = syncDirectory(publicDir, rendererOutDir);
  log(`Copied ${copied} changed asset file(s)`);
  fs.copyFileSync(rendererHtmlPath, path.join(rendererOutDir, 'index.html'));

  log(mode === 'production' ? 'Bundling and obfuscating with Webpack' : 'Bundling with Webpack');
  await runWebpack(createConfigs({
    mode,
    appEnv,
  }));

  log('Writing dist package metadata');
  writeDistPackageJson(version);
  ['README.md', 'LICENSE', 'NOTICE.md'].forEach((fileName) => {
    const sourcePath = path.join(rootDir, fileName);
    if (fs.existsSync(sourcePath)) fs.copyFileSync(sourcePath, path.join(distDir, fileName));
  });

  log('Build complete');
  return {
    distDir,
    version,
  };
}

module.exports = {
  buildApp,
  distDir,
  parseBuildArgs,
  resolveBuildVersion,
  rootDir,
};
