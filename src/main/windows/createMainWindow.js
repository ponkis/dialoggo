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
    height: 800,
    minWidth: 800,
    minHeight: 800,
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
    maximizable: false,
    fullscreenable: false,
    show: false,
  });

  window.removeMenu();
  window.loadFile(paths.indexHtmlPath);

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const hasPrimaryModifier = process.platform === 'darwin' ? input.meta : input.control;
    if (!hasPrimaryModifier || !input.shift) return;

    const key = String(input.key || '').toLowerCase();

    if (key === 'i') {
      event.preventDefault();
      window.webContents.openDevTools({
        mode: 'detach',
      });
      return;
    }

    if (key === 'r') {
      event.preventDefault();
      window.webContents.reloadIgnoringCache();
    }
  });

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
