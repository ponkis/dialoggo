const electron = require('electron');
const {
  APP_METADATA,
} = require('../shared/appMetadata');
const {
  Application,
} = require('./Application');
const {
  applyEnvironmentToApp,
  createEnvironment,
} = require('./config/environment');
const {
  resolveAppPaths,
} = require('./config/paths');
const {
  createLogger,
} = require('./logging/logger');
const {
  registerAssetSchemePrivileges,
} = require('./protocol/assetProtocol');

const {
  app,
  crashReporter,
  protocol,
} = electron;

const environment = createEnvironment();

// These calls must happen before the app is ready: the userData path decides
// where logs and storage live, and scheme privileges are fixed at startup.
applyEnvironmentToApp(app, environment);
registerAssetSchemePrivileges(protocol);

crashReporter.start({
  productName: environment.productName,
  companyName: APP_METADATA.companyName,
  submitURL: '',
  uploadToServer: false,
  compress: true,
});

const application = new Application({
  electron,
  environment,
  paths: resolveAppPaths(__dirname),
  logger: createLogger(app, environment),
  smokeTest: process.env.DIALOGGO_SMOKE_TEST === '1',
});

application.start();
