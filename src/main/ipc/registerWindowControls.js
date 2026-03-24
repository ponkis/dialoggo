const {
  ipcMain
} = require('electron');

function registerWindowControls(getMainWindow) {
  ipcMain.on('window-minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window-close', () => {
    getMainWindow()?.close();
  });
}

module.exports = {
  registerWindowControls
};
