const path = require('path');
const log = require('electron-log/main');
const {
  APP_METADATA,
} = require('../../shared/appMetadata');

let configuredLogger = null;

function serializeLogMeta(value, depth = 0) {
  if (depth > 5) return '[depth-limit]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeLogMeta(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value).forEach((key) => {
      output[key] = serializeLogMeta(value[key], depth + 1);
    });
    return output;
  }

  return value;
}

function getLogger(app) {
  if (configuredLogger) return configuredLogger;

  log.initialize();
  log.transports.file.level = 'info';
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', APP_METADATA.logFileName);

  configuredLogger = log;
  return configuredLogger;
}

module.exports = {
  getLogger,
  serializeLogMeta,
};
