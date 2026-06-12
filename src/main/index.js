const {
  app,
  BrowserWindow,
  crashReporter,
} = require('electron');
const {
  registerWindowControls
} = require('./ipc/registerWindowControls');
const {
  registerLoggingBridge,
} = require('./ipc/registerLoggingBridge');
const {
  getLogger,
  serializeLogMeta,
} = require('./logging/getLogger');
const {
  createMainWindow
} = require('./windows/createMainWindow');
const {
  APP_METADATA,
} = require('../shared/appMetadata');

let mainWindow = null;

app.setName(APP_METADATA.productName);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_METADATA.appId);
}
app.setAboutPanelOptions({
  applicationName: APP_METADATA.productName,
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: APP_METADATA.copyright,
  website: APP_METADATA.homepage,
});

const logger = getLogger(app);

crashReporter.start({
  productName: APP_METADATA.productName,
  companyName: APP_METADATA.companyName,
  submitURL: '',
  uploadToServer: false,
  compress: true,
});

function getMainWindow() {
  return mainWindow;
}

function bootstrapMainWindow() {
  mainWindow = createMainWindow();
  logger.info('Main window created');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process exited unexpectedly', serializeLogMeta(details));
  });
}

registerWindowControls(getMainWindow);
registerLoggingBridge(logger);

process.on('uncaughtException', (error) => {
  logger.error('Main process uncaught exception', serializeLogMeta(error));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Main process unhandled rejection', serializeLogMeta(reason));
});

app.whenReady().then(() => {
  logger.info('App ready', {
    userData: app.getPath('userData'),
    crashDumps: app.getPath('crashDumps'),
  });
  bootstrapMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting app');
  app.quit();
});
