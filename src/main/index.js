const {
  app,
  BrowserWindow
} = require('electron');
const {
  registerWindowControls
} = require('./ipc/registerWindowControls');
const {
  createMainWindow
} = require('./windows/createMainWindow');

let mainWindow = null;

function getMainWindow() {
  return mainWindow;
}

function sendWindowState(channel) {
  mainWindow?.webContents.send(channel);
}

function bootstrapMainWindow() {
  mainWindow = createMainWindow();

  mainWindow.on('maximize', () => {
    sendWindowState('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    sendWindowState('window-unmaximized');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

registerWindowControls(getMainWindow);

app.whenReady().then(() => {
  bootstrapMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});