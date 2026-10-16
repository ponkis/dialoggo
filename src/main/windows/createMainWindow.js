const {
  BrowserWindow,
  shell,
} = require('electron');
const {
  APP_PROTOCOL,
} = require('../../shared/appMetadata');
const {
  sanitizeExternalUrl,
} = require('../security/externalUrl');

const MAIN_WINDOW_URL = `${APP_PROTOCOL.origin}/index.html`;

function openExternalSafely(url) {
  const safeUrl = sanitizeExternalUrl(url);
  if (safeUrl) void shell.openExternal(safeUrl);
}

function registerDeveloperShortcuts(window) {
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
}

function registerNavigationGuards(window) {
  window.webContents.setWindowOpenHandler(({
    url,
  }) => {
    openExternalSafely(url);
    return {
      action: 'deny',
    };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return;

    event.preventDefault();
    openExternalSafely(url);
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function createMainWindow({
  paths,
  environment,
}) {
  const window = new BrowserWindow({
    width: 800,
    height: 800,
    minWidth: 800,
    minHeight: 800,
    backgroundColor: '#0a0c16',
    icon: paths.iconPath,
    title: environment.productName,
    webPreferences: {
      preload: paths.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
  });

  window.removeMenu();
  registerNavigationGuards(window);
  if (environment.isDevelopment) registerDeveloperShortcuts(window);

  window.once('ready-to-show', () => {
    window.show();
  });

  void window.loadURL(MAIN_WINDOW_URL);
  return window;
}

module.exports = {
  MAIN_WINDOW_URL,
  createMainWindow,
};
