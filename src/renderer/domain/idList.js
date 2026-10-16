/**
 * Normalizes a list of catalog ids: trims, drops empties and duplicates, keeps
 * only ids present in validIds (a Map or Set) when given, and applies a limit.
 */
function sanitizeIdList(itemIds, {
  validIds = null,
  limit = Number.POSITIVE_INFINITY,
} = {}) {
  const sanitized = [];
  const seen = new Set();

  (Array.isArray(itemIds) ? itemIds : []).forEach((itemId) => {
    const normalizedId = String(itemId || '').trim();
    if (!normalizedId || seen.has(normalizedId) || (validIds?.has && !validIds.has(normalizedId))) return;
    seen.add(normalizedId);
    sanitized.push(normalizedId);
  });

  return sanitized.slice(0, limit);
}

module.exports = {
  sanitizeIdList,
};
