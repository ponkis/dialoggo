// Single source of truth for every IPC channel. The preload and the main-process
// handlers both import from here, so a renamed channel cannot drift silently.
const IPC_CHANNELS = Object.freeze({
  appGetInfo: 'app:get-info',
  appRendererReady: 'app:renderer-ready',
  catalogGet: 'catalog:get',
  log: 'log:write',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesCancelDownload: 'updates:cancel-download',
  updatesInstall: 'updates:install',
  updatesProgress: 'updates:progress',
  windowClose: 'window:close',
  windowMinimize: 'window:minimize',
});

const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

module.exports = {
  IPC_CHANNELS,
  LOG_LEVELS,
};
