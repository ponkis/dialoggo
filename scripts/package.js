// Builds dist/ and packages it with electron-builder for the current OS.
//
//   node scripts/package.js                  production installers in release/
//   node scripts/package.js --env=development  side-by-side "Dialoggo Development" build
//   node scripts/package.js --dir             unpacked app only (fast local check)
//   node scripts/package.js --skip-build      package the existing dist/ as-is
const path = require('path');
const fs = require('fs');
const {
  buildApp,
  parseBuildArgs,
  rootDir,
} = require('./lib/buildPipeline');

function parsePackageArgs(argv) {
  const buildArgs = [];
  const options = {
    dir: false,
    skipBuild: false,
  };

  argv.forEach((argument) => {
    if (argument === '--dir') options.dir = true;
    else if (argument === '--skip-build') options.skipBuild = true;
    else buildArgs.push(argument);
  });

  return {
    ...options,
    build: parseBuildArgs(buildArgs),
  };
}

async function main() {
  const options = parsePackageArgs(process.argv.slice(2));
  const appEnv = options.build.appEnv;

  if (!options.skipBuild) {
    await buildApp(options.build);
  } else if (!fs.existsSync(path.join(rootDir, 'dist', 'package.json'))) {
    throw new Error('dist/ is missing; run without --skip-build.');
  }

  // The builder config reads the environment to choose app id and names.
  process.env.DIALOGGO_ENV = appEnv;
  if (process.platform === 'darwin' && !process.env.CSC_LINK) {
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  const builder = require('electron-builder');
  const config = require(path.join(rootDir, 'electron-builder.config.js'));

  console.log(`[package] Packaging ${appEnv} build for ${process.platform}${options.dir ? ' (unpacked)' : ''}`);
  const artifacts = await builder.build({
    projectDir: rootDir,
    config,
    dir: options.dir,
    publish: 'never',
  });

  artifacts.forEach((artifact) => {
    console.log(`[package] ${path.relative(rootDir, artifact)}`);
  });
}

main().catch((error) => {
  console.error('[package] Packaging failed');
  console.error(error);
  process.exitCode = 1;
});
