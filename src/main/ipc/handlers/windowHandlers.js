const {
  IPC_CHANNELS,
} = require('../../../shared/ipcChannels');
const {
  isTrustedSender,
} = require('../validateSender');

function registerWindowHandlers({
  ipcMain,
  getMainWindow,
}) {
  ipcMain.on(IPC_CHANNELS.windowMinimize, (event) => {
    if (!isTrustedSender(event)) return;
    getMainWindow()?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.windowClose, (event) => {
    if (!isTrustedSender(event)) return;
    getMainWindow()?.close();
  });
}

module.exports = {
  registerWindowHandlers,
};
