const APP_METADATA = Object.freeze({
  appId: 'xyz.ponkis.dialoggo',
  name: 'Dialoggo',
  productName: 'Dialoggo',
  companyName: 'ponkis',
  author: 'ponkis',
  homepage: 'https://ponkis.xyz',
  repositoryUrl: 'https://github.com/ponkis/dialoggo',
  versionFallback: '1.0.0',
  copyright: 'Copyright (c) 2026 ponkis',
  logFileName: 'dialoggo.log',
});

const APP_ENVIRONMENTS = Object.freeze({
  development: 'development',
  production: 'production',
});

// The renderer is served from this privileged custom scheme instead of file://
// so the preload can stay sandboxed and assets load through one audited handler.
const APP_PROTOCOL = Object.freeze({
  scheme: 'dialoggo',
  host: 'app',
  origin: 'dialoggo://app',
});

module.exports = {
  APP_ENVIRONMENTS,
  APP_METADATA,
  APP_PROTOCOL,
};
