const path = require('path');
const log = require('electron-log/main');
const {
  APP_METADATA,
} = require('../../shared/appMetadata');

let configuredLogger = null;

function createLogger(app, environment) {
  if (configuredLogger) return configuredLogger;

  log.initialize();
  log.transports.file.level = environment.isDevelopment ? 'debug' : 'info';
  log.transports.console.level = environment.isDevelopment ? 'debug' : 'info';
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', APP_METADATA.logFileName);

  configuredLogger = log;
  return configuredLogger;
}

module.exports = {
  createLogger,
};
