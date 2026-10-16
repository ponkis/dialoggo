const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Formats a byte count for display, e.g. 1536 -> "1.5 KB". */
function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 || size >= 100 ? 0 : 1;
  return `${size.toFixed(digits)} ${UNITS[unitIndex]}`;
}

module.exports = {
  formatBytes,
};
