const path = require('path');
const {
  APP_ENVIRONMENTS,
  APP_METADATA,
} = require('../../shared/appMetadata');

// Webpack's DefinePlugin replaces this expression with a string literal at
// build time, so a bundle can never change environment at runtime.
const BUILD_ENVIRONMENT = process.env.DIALOGGO_ENV;

function resolveEnvironmentName(value = BUILD_ENVIRONMENT) {
  return value === APP_ENVIRONMENTS.development ?
    APP_ENVIRONMENTS.development :
    APP_ENVIRONMENTS.production;
}

function createEnvironment(name = resolveEnvironmentName()) {
  const isDevelopment = name === APP_ENVIRONMENTS.development;

  return Object.freeze({
    name,
    isDevelopment,
    isProduction: !isDevelopment,
    appId: isDevelopment ? `${APP_METADATA.appId}.dev` : APP_METADATA.appId,
    productName: isDevelopment ? `${APP_METADATA.productName} Development` : APP_METADATA.productName,
  });
}

/**
 * Keeps development and production settings, logs, and crash dumps in separate
 * per-user folders so a development run can never touch production state.
 */
function applyEnvironmentToApp(app, environment) {
  app.setName(environment.productName);
  app.setPath('userData', path.join(app.getPath('appData'), environment.productName));

  if (process.platform === 'win32') {
    app.setAppUserModelId(environment.appId);
  }
}

module.exports = {
  applyEnvironmentToApp,
  createEnvironment,
  resolveEnvironmentName,
};
