const {
  BrowserWindow,
  shell
} = require('electron');
const path = require('path');

function createMainWindow() {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0c16',
    icon: path.join(__dirname, '..', '..', '..', 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    resizable: false,
    maximizable: true,
    show: false,
  });

  window.loadFile(path.join(__dirname, '..', '..', '..', 'public', 'index.html'));

  window.webContents.setWindowOpenHandler(({
    url
  }) => {
    shell.openExternal(url);
    return {
      action: 'deny'
    };
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

module.exports = {
  createMainWindow
};