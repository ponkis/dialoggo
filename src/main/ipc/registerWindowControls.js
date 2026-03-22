const {
  ipcMain
} = require('electron');

function registerWindowControls(getMainWindow) {
  ipcMain.on('window-minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    const window = getMainWindow();
    if (!window) return;

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });

  ipcMain.on('window-close', () => {
    getMainWindow()?.close();
  });
}

module.exports = {
  registerWindowControls
};