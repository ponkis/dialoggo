// `npm start`: builds unminified development bundles into dist/ (assets are
// synced incrementally) and launches Electron on them. Ctrl+Shift+R reloads the
// renderer and Ctrl+Shift+I opens DevTools in development builds.
const {
  spawn,
} = require('child_process');
const electronPath = require('electron');
const {
  buildApp,
  distDir,
  rootDir,
} = require('./lib/buildPipeline');

async function main() {
  await buildApp({
    mode: 'development',
    appEnv: 'development',
    clean: false,
  });

  const app = spawn(electronPath, [distDir, ...process.argv.slice(2)], {
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
}

main().catch((error) => {
  console.error('[dev] Development build failed.');
  console.error(error);
  process.exitCode = 1;
});
