const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_SKIP_FREQUENCY,
  MAX_SKIP_FREQUENCY,
  parseCharacterSkipFrequency,
} = require('../../../src/shared/catalog/soundConfig');

test('skip frequency parsing', () => {
  assert.equal(parseCharacterSkipFrequency(undefined), DEFAULT_SKIP_FREQUENCY);
  assert.equal(parseCharacterSkipFrequency('nope'), DEFAULT_SKIP_FREQUENCY);
  assert.equal(parseCharacterSkipFrequency(-1), 0);
  assert.equal(parseCharacterSkipFrequency(0), 0);
  assert.equal(parseCharacterSkipFrequency('1.5'), 1.5);
  assert.equal(parseCharacterSkipFrequency(99), MAX_SKIP_FREQUENCY);
});

test('parsing is idempotent', () => {
  [undefined, null, 0, 0.4, 3, 'x'].forEach((value) => {
    const once = parseCharacterSkipFrequency(value);
    assert.equal(parseCharacterSkipFrequency(once), once);
  });
});
