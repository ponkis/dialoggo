const {
  BrowserWindow,
  shell
} = require('electron');
const { resolveAppPaths } = require('../paths/resolveAppPaths');

function createMainWindow() {
  const paths = resolveAppPaths();

  const window = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0c16',
    icon: paths.iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    resizable: false,
    maximizable: true,
    show: false,
  });

  window.loadFile(paths.indexHtmlPath);

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
