const {
  ipcMain,
} = require('electron');
const {
  serializeLogMeta,
} = require('../logging/getLogger');

const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

function registerLoggingBridge(logger) {
  ipcMain.on('app-log', (_event, payload = {}) => {
    const level = ALLOWED_LEVELS.has(payload.level) ? payload.level : 'info';
    const message = typeof payload.message === 'string' && payload.message.trim() ?
      payload.message :
      'Renderer log message';
    const metadata = serializeLogMeta(payload.meta);

    if (metadata === undefined) {
      logger[level](`[renderer] ${message}`);
      return;
    }

    logger[level](`[renderer] ${message}`, metadata);
  });
}

module.exports = {
  registerLoggingBridge,
};