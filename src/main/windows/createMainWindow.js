const {
  BrowserWindow,
  shell
} = require('electron');
const {
  resolveAppPaths
} = require('../paths/resolveAppPaths');
const {
  sanitizeExternalUrl
} = require('../security/safeExternalUrl');

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
      preload: paths.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
    const safeUrl = sanitizeExternalUrl(url);
    if (safeUrl) shell.openExternal(safeUrl);
    return {
      action: 'deny'
    };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return;

    event.preventDefault();
    const safeUrl = sanitizeExternalUrl(url);
    if (safeUrl) shell.openExternal(safeUrl);
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

module.exports = {
  createMainWindow
};