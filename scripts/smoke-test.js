// Launches the built app from dist/ in smoke-test mode: the main process exits
// 0 once the renderer reports a successful startup, or 1 on any load failure,
// renderer crash, or timeout. Run `npm run build` first.
const fs = require('fs');
const path = require('path');
const {
  spawn,
} = require('child_process');
const electronPath = require('electron');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const TIMEOUT_MS = 60000;

if (!fs.existsSync(path.join(distDir, 'package.json'))) {
  console.error('[smoke] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

// Linux CI runners cannot use Chromium's setuid sandbox helper.
const extraArgs = process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];

const child = spawn(electronPath, [distDir, ...extraArgs], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    DIALOGGO_SMOKE_TEST: '1',
    ELECTRON_ENABLE_LOGGING: '1',
  },
});

const timeout = setTimeout(() => {
  console.error(`[smoke] Electron did not exit within ${TIMEOUT_MS / 1000}s.`);
  child.kill();
  process.exitCode = 1;
}, TIMEOUT_MS);

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error('[smoke] Could not start Electron.');
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (code === 0) {
    console.log('[smoke] App started and the renderer reported ready.');
    return;
  }

  console.error(`[smoke] App exited with ${signal ? `signal ${signal}` : `code ${code}`}.`);
  process.exitCode = code || 1;
});
