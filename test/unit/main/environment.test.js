const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createEnvironment,
  resolveEnvironmentName,
} = require('../../../src/main/config/environment');

test('unknown or missing build environments resolve to production', () => {
  assert.equal(resolveEnvironmentName(undefined), 'production');
  assert.equal(resolveEnvironmentName('staging'), 'production');
  assert.equal(resolveEnvironmentName('development'), 'development');
});

test('development builds use a separate app id and name', () => {
  const development = createEnvironment('development');
  const production = createEnvironment('production');

  assert.equal(development.isDevelopment, true);
  assert.equal(development.productName, 'Dialoggo Development');
  assert.equal(development.appId, 'xyz.ponkis.dialoggo.dev');
  assert.equal(production.isProduction, true);
  assert.equal(production.productName, 'Dialoggo');
  assert.equal(production.appId, 'xyz.ponkis.dialoggo');
});
