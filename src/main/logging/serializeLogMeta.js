/** Converts log metadata (including Errors) into plain, depth-limited data. */
function serializeLogMeta(value, depth = 0) {
  if (depth > 5) return '[depth-limit]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeLogMeta(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value).forEach((key) => {
      output[key] = serializeLogMeta(value[key], depth + 1);
    });
    return output;
  }

  return value;
}

module.exports = {
  serializeLogMeta,
};
