const {
  clampNumber,
} = require('../math');

const DEFAULT_SKIP_FREQUENCY = 1;
const MIN_SKIP_FREQUENCY = 0;
const MAX_SKIP_FREQUENCY = 2.5;

function parseCharacterSkipFrequency(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return DEFAULT_SKIP_FREQUENCY;
  if (parsedValue <= 0) return 0;
  return clampNumber(parsedValue, MIN_SKIP_FREQUENCY, MAX_SKIP_FREQUENCY);
}

module.exports = {
  DEFAULT_SKIP_FREQUENCY,
  MAX_SKIP_FREQUENCY,
  MIN_SKIP_FREQUENCY,
  parseCharacterSkipFrequency,
};
