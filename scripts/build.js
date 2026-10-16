// Builds the runnable Electron app into dist/.
//
//   node scripts/build.js                                  production release build
//   node scripts/build.js --env=development                optimized development build
//   node scripts/build.js --mode=development --env=development --no-clean
const {
  buildApp,
  parseBuildArgs,
} = require('./lib/buildPipeline');

buildApp(parseBuildArgs(process.argv.slice(2))).catch((error) => {
  console.error('[build] Build failed');
  console.error(error);
  process.exitCode = 1;
});
