const {
  IPC_CHANNELS,
} = require('../../../shared/ipcChannels');
const {
  createUntrustedSenderError,
  isTrustedSender,
} = require('../validateSender');

function registerUpdateHandlers({
  ipcMain,
  updateService,
  onInstallLaunched,
}) {
  if (!updateService) return;

  const handle = (channel, handler) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) throw createUntrustedSenderError(channel);
      return handler(event, ...args);
    });
  };

  handle(IPC_CHANNELS.updatesCheck, () => updateService.check());

  handle(IPC_CHANNELS.updatesDownload, (event) => updateService.download({
    onProgress(progress) {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.updatesProgress, progress);
    },
  }));

  handle(IPC_CHANNELS.updatesInstall, async () => {
    const result = await updateService.install();
    if (result.ok) onInstallLaunched?.();
    return result;
  });

  ipcMain.on(IPC_CHANNELS.updatesCancelDownload, (event) => {
    if (!isTrustedSender(event)) return;
    updateService.cancelDownload();
  });
}

module.exports = {
  registerUpdateHandlers,
};
