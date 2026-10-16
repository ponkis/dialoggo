const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeLogPayload,
} = require('../../../src/main/ipc/handlers/logHandlers');
const {
  isTrustedSender,
} = require('../../../src/main/ipc/validateSender');
const {
  IPC_CHANNELS,
} = require('../../../src/shared/ipcChannels');

test('only frames served by the app protocol are trusted', () => {
  const eventFrom = (url) => ({
    senderFrame: url === undefined ? null : {
      url,
    },
  });

  assert.equal(isTrustedSender(eventFrom('dialoggo://app/index.html')), true);
  assert.equal(isTrustedSender(eventFrom('dialoggo://other/index.html')), false);
  assert.equal(isTrustedSender(eventFrom('https://ponkis.xyz/')), false);
  assert.equal(isTrustedSender(eventFrom('file:///index.html')), false);
  assert.equal(isTrustedSender(eventFrom(undefined)), false);
  assert.equal(isTrustedSender(null), false);
});

test('renderer log payloads are normalized', () => {
  assert.deepEqual(normalizeLogPayload({
    level: 'error',
    message: 'boom',
    meta: {
      error: new Error('x'),
    },
  }).level, 'error');

  const invalid = normalizeLogPayload({
    level: 'shell',
    message: '   ',
  });
  assert.equal(invalid.level, 'info');
  assert.equal(invalid.message, 'Renderer log message');

  assert.equal(normalizeLogPayload({
    message: 'x'.repeat(5000),
  }).message.length, 2000);
  assert.equal(normalizeLogPayload(undefined).level, 'info');
});

test('IPC channel names are unique', () => {
  const channels = Object.values(IPC_CHANNELS);
  assert.equal(new Set(channels).size, channels.length);
});
