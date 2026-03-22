function sanitizeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

module.exports = {
  sanitizeExternalUrl,
};