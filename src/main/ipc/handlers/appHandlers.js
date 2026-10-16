const {
  IPC_CHANNELS,
} = require('../../../shared/ipcChannels');
const {
  createUntrustedSenderError,
  isTrustedSender,
} = require('../validateSender');

function registerAppHandlers({
  ipcMain,
  getAppInfo,
  catalogService,
  onRendererReady,
}) {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, (event) => {
    if (!isTrustedSender(event)) throw createUntrustedSenderError(IPC_CHANNELS.appGetInfo);
    return getAppInfo();
  });

  ipcMain.handle(IPC_CHANNELS.catalogGet, (event) => {
    if (!isTrustedSender(event)) throw createUntrustedSenderError(IPC_CHANNELS.catalogGet);
    return catalogService.getCatalog();
  });

  ipcMain.on(IPC_CHANNELS.appRendererReady, (event, summary) => {
    if (!isTrustedSender(event)) return;
    onRendererReady?.(summary);
  });
}

module.exports = {
  registerAppHandlers,
};
