function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  clampNumber,
};
