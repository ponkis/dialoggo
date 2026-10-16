const {
  IPC_CHANNELS,
  LOG_LEVELS,
} = require('../../../shared/ipcChannels');
const {
  serializeLogMeta,
} = require('../../logging/serializeLogMeta');
const {
  isTrustedSender,
} = require('../validateSender');

const ALLOWED_LEVELS = new Set(LOG_LEVELS);
const MAX_MESSAGE_LENGTH = 2000;

function normalizeLogPayload(payload = {}) {
  const level = ALLOWED_LEVELS.has(payload?.level) ? payload.level : 'info';
  const message = typeof payload?.message === 'string' && payload.message.trim() ?
    payload.message.slice(0, MAX_MESSAGE_LENGTH) :
    'Renderer log message';

  return {
    level,
    message,
    metadata: serializeLogMeta(payload?.meta),
  };
}

function registerLogHandlers({
  ipcMain,
  logger,
}) {
  ipcMain.on(IPC_CHANNELS.log, (event, payload) => {
    if (!isTrustedSender(event)) return;

    const {
      level,
      message,
      metadata,
    } = normalizeLogPayload(payload);

    if (metadata === undefined) {
      logger[level](`[renderer] ${message}`);
      return;
    }

    logger[level](`[renderer] ${message}`, metadata);
  });
}

module.exports = {
  normalizeLogPayload,
  registerLogHandlers,
};
