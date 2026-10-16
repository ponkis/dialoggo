// Keys are part of the persisted data format; renaming one drops saved values.
const STORAGE_KEYS = Object.freeze({
  n64Mode: 'dialoggo-n64-mode',
  mirrorMode: 'dialoggo-mirror-mode',
  shortcutVisualizerEnabled: 'dialoggo-shortcut-visualizer-enabled',
  hideBrokenChars: 'dialoggo-hide-broken-chars',
  hideBrokenBackgrounds: 'dialoggo-hide-broken-backgrounds',
  selectedBackground: 'dialoggo-selected-background',
  favoriteCharacters: 'dialoggo-favorite-characters',
  recentCharacters: 'dialoggo-recent-characters',
  favoriteBackgrounds: 'dialoggo-favorite-backgrounds',
  recentBackgrounds: 'dialoggo-recent-backgrounds',
  hiddenCharacters: 'dialoggo-hidden-characters',
  hiddenBackgrounds: 'dialoggo-hidden-backgrounds',
  hiddenCharactersCollapsed: 'dialoggo-hidden-characters-collapsed',
});

/**
 * Thin, failure-tolerant wrapper around Web Storage. Storage can be blocked or
 * full; every read falls back to "not saved" and every write is best effort.
 */
function createPreferencesStore(getStorage = () => globalThis.localStorage) {
  function readString(key) {
    try {
      return getStorage().getItem(key);
    } catch {
      return null;
    }
  }

  function writeString(key, value) {
    try {
      getStorage().setItem(key, String(value));
    } catch { }
  }

  function remove(key) {
    try {
      getStorage().removeItem(key);
    } catch { }
  }

  function readFlag(key, fallback) {
    const saved = readString(key);
    return saved === null ? fallback : saved === 'true';
  }

  function readIdList(key) {
    try {
      const saved = readString(key);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeIdList(key, itemIds) {
    try {
      writeString(key, JSON.stringify(itemIds));
    } catch { }
  }

  return {
    keys: STORAGE_KEYS,
    readFlag,
    readIdList,
    readString,
    remove,
    writeIdList,
    writeString,
  };
}

module.exports = {
  STORAGE_KEYS,
  createPreferencesStore,
};
