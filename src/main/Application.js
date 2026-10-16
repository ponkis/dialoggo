const {
  APP_METADATA,
} = require('../shared/appMetadata');
const {
  serializeLogMeta,
} = require('./logging/serializeLogMeta');
const {
  registerIpcHandlers,
} = require('./ipc/registerIpcHandlers');
const {
  registerAssetProtocolHandler,
} = require('./protocol/assetProtocol');
const {
  createCatalogService,
} = require('./services/catalog/CatalogService');
const {
  createMainWindow,
} = require('./windows/createMainWindow');

const SMOKE_TEST_TIMEOUT_MS = 30000;

/**
 * Owns the Electron lifecycle for the main process: the single-instance lock,
 * protocol and IPC registration, the main window, and smoke-test exits.
 */
class Application {
  constructor({
    electron,
    environment,
    paths,
    logger,
    smokeTest = false,
  }) {
    this.electron = electron;
    this.environment = environment;
    this.paths = paths;
    this.logger = logger;
    this.smokeTest = smokeTest;
    this.mainWindow = null;
    this.catalogService = createCatalogService({
      assetsDir: paths.assetsDir,
      rendererDir: paths.rendererDir,
      logger,
    });
  }

  start() {
    const {
      app,
    } = this.electron;

    if (!app.requestSingleInstanceLock()) {
      this.logger.info('Another instance is already running; exiting');
      app.quit();
      return;
    }

    this.configureAboutPanel();
    this.registerProcessErrorHandlers();
    this.registerIpc();

    app.on('second-instance', () => this.focusMainWindow());
    app.on('window-all-closed', () => {
      this.logger.info('All windows closed, quitting app');
      app.quit();
    });

    app.whenReady()
      .then(() => this.onReady())
      .catch((error) => {
        this.logger.error('App failed to start', serializeLogMeta(error));
        this.exitSmokeTest(1, 'startup failed');
      });
  }

  onReady() {
    const {
      app,
      BrowserWindow,
      net,
      protocol,
    } = this.electron;

    this.logger.info('App ready', {
      environment: this.environment.name,
      version: app.getVersion(),
      userData: app.getPath('userData'),
    });

    registerAssetProtocolHandler({
      protocol,
      net,
      rootDir: this.paths.rendererDir,
      logger: this.logger,
    });

    this.openMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) this.openMainWindow();
    });

    if (this.smokeTest) {
      setTimeout(() => this.exitSmokeTest(1, 'renderer did not report ready in time'), SMOKE_TEST_TIMEOUT_MS).unref();
    }
  }

  configureAboutPanel() {
    const {
      app,
    } = this.electron;

    app.setAboutPanelOptions({
      applicationName: this.environment.productName,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: APP_METADATA.copyright,
      website: APP_METADATA.homepage,
    });
  }

  registerProcessErrorHandlers() {
    process.on('uncaughtException', (error) => {
      this.logger.error('Main process uncaught exception', serializeLogMeta(error));
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Main process unhandled rejection', serializeLogMeta(reason));
    });
  }

  registerIpc() {
    registerIpcHandlers({
      ipcMain: this.electron.ipcMain,
      logger: this.logger,
      catalogService: this.catalogService,
      getMainWindow: () => this.mainWindow,
      getAppInfo: () => this.getAppInfo(),
      onRendererReady: (summary) => this.onRendererReady(summary),
    });
  }

  getAppInfo() {
    const {
      app,
    } = this.electron;

    return {
      appId: this.environment.appId,
      appName: this.environment.productName,
      appAuthor: APP_METADATA.author,
      appHomepage: APP_METADATA.homepage,
      appVersion: app.getVersion() || APP_METADATA.versionFallback,
      companyName: APP_METADATA.companyName,
      environment: this.environment.name,
      platform: process.platform,
    };
  }

  openMainWindow() {
    this.mainWindow = createMainWindow({
      paths: this.paths,
      environment: this.environment,
    });
    this.logger.info('Main window created');

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error('Renderer process exited unexpectedly', serializeLogMeta(details));
      this.exitSmokeTest(1, 'renderer process exited');
    });

    this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
      this.logger.error('Renderer failed to load', {
        errorCode,
        errorDescription,
        validatedUrl,
      });
      this.exitSmokeTest(1, 'renderer failed to load');
    });
  }

  focusMainWindow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.focus();
  }

  onRendererReady(summary) {
    const payload = serializeLogMeta(summary);
    this.logger.info('Renderer reported startup status', payload);

    if (!this.smokeTest) return;

    if (summary?.ok === true) {
      this.exitSmokeTest(0, 'renderer started');
      return;
    }

    this.exitSmokeTest(1, 'renderer reported a startup failure');
  }

  exitSmokeTest(code, reason) {
    if (!this.smokeTest) return;

    const message = `[smoke] ${code === 0 ? 'passed' : 'failed'}: ${reason}`;
    if (code === 0) this.logger.info(message);
    else this.logger.error(message);

    this.electron.app.exit(code);
  }
}

module.exports = {
  Application,
};
