const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const webpackConfig = require('../webpack.config');
const {
  APP_METADATA,
} = require('../src/shared/appMetadata');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const packageJsonPath = path.join(rootDir, 'package.json');

function log(message) {
  console.log(`[build] ${message}`);
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM') {
      return null;
    }
    throw error;
  }
}

function copyRecursiveSafe(sourcePath, destinationPath) {
  const stats = safeStat(sourcePath);
  if (!stats) {
    log(`Skipping missing or inaccessible path: ${path.relative(rootDir, sourcePath)}`);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, {
      recursive: true
    });

    let entries = [];
    try {
      entries = fs.readdirSync(sourcePath);
    } catch (error) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        log(`Skipping inaccessible directory: ${path.relative(rootDir, sourcePath)}`);
        return;
      }
      throw error;
    }

    entries.forEach((entry) => {
      copyRecursiveSafe(
        path.join(sourcePath, entry),
        path.join(destinationPath, entry),
      );
    });
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), {
    recursive: true
  });

  try {
    fs.copyFileSync(sourcePath, destinationPath);
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      log(`Skipping inaccessible file: ${path.relative(rootDir, sourcePath)}`);
      return;
    }
    throw error;
  }
}

function copyOptionalFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const stats = safeStat(sourcePath);
  if (!stats || !stats.isFile()) return;
  copyRecursiveSafe(sourcePath, path.join(distDir, relativePath));
}

function writeDistPackageJson() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const distPackageJson = {
    name: pkg.name,
    productName: pkg.productName || APP_METADATA.productName,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author || APP_METADATA.author,
    homepage: pkg.homepage || APP_METADATA.homepage,
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

function runWebpackBuild() {
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (error, stats) => {
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

async function buildDist() {
  log('Cleaning dist directory');
  fs.rmSync(distDir, {
    recursive: true,
    force: true
  });
  fs.mkdirSync(distDir, {
    recursive: true
  });

  log('Copying public assets');
  copyRecursiveSafe(publicDir, path.join(distDir, 'public'));

  log('Bundling and obfuscating application code with Webpack');
  await runWebpackBuild();

  log('Writing dist package metadata');
  writeDistPackageJson();
  copyOptionalFile('README.md');
  copyOptionalFile('LICENSE');
  copyOptionalFile('NOTICE.md');

  log('Build complete');
}

buildDist().catch((error) => {
  console.error('[build] Build failed');
  console.error(error);
  process.exitCode = 1;
});
