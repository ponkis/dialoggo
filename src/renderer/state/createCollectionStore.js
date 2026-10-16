const {
  sanitizeIdList,
} = require('../domain/idList');

/**
 * Favorites, recents, and hidden items for one catalog (characters or
 * backgrounds). The lists live on the shared app state under the given field
 * names and are persisted under the given storage keys.
 */
function createCollectionStore({
  state,
  preferences,
  validIds,
  recentLimit,
  fields,
  storageKeys,
}) {
  const sanitize = (itemIds, options = {}) => sanitizeIdList(itemIds, {
    validIds,
    ...options,
  });

  function persist(listName) {
    preferences.writeIdList(storageKeys[listName], state[fields[listName]]);
  }

  function loadList(listName, options) {
    const ids = sanitize(preferences.readIdList(storageKeys[listName]), options);
    state[fields[listName]] = ids;
    persist(listName);
  }

  function load() {
    loadList('favorites');
    loadList('recent', {
      limit: recentLimit,
    });
    loadList('hidden');

    const hiddenIds = state[fields.hidden];
    const favoriteIds = state[fields.favorites];
    if (hiddenIds.length && favoriteIds.length) {
      const hiddenSet = new Set(hiddenIds);
      const filtered = favoriteIds.filter((itemId) => !hiddenSet.has(itemId));
      if (filtered.length !== favoriteIds.length) {
        state[fields.favorites] = filtered;
        persist('favorites');
      }
    }
  }

  function isFavorite(itemId) {
    return state[fields.favorites].includes(itemId);
  }

  function isHidden(itemId) {
    return state[fields.hidden].includes(itemId);
  }

  /** Returns true when the recent list changed and the grid should re-render. */
  function moveToRecent(itemId) {
    if (!itemId || !validIds.has(itemId)) return false;

    const previousTop = state[fields.recent][0];
    state[fields.recent] = sanitize([itemId, ...state[fields.recent]], {
      limit: recentLimit,
    });

    if (previousTop === itemId) return false;

    persist('recent');
    return true;
  }

  /** Toggles the favorite flag and returns whether the item was a favorite before. */
  function toggleFavorite(itemId) {
    const wasFavorite = isFavorite(itemId);
    const nextIds = wasFavorite ?
      state[fields.favorites].filter((id) => id !== itemId) :
      [itemId, ...state[fields.favorites]];

    state[fields.favorites] = sanitize(nextIds);
    persist('favorites');
    return wasFavorite;
  }

  /** Toggles the hidden flag and returns whether the item was hidden before. Hiding drops the favorite. */
  function toggleHidden(itemId) {
    const wasHidden = isHidden(itemId);
    const nextIds = wasHidden ?
      state[fields.hidden].filter((id) => id !== itemId) :
      [itemId, ...state[fields.hidden]];

    state[fields.hidden] = sanitize(nextIds);

    if (!wasHidden && isFavorite(itemId)) {
      state[fields.favorites] = state[fields.favorites].filter((id) => id !== itemId);
      persist('favorites');
    }

    persist('hidden');
    return wasHidden;
  }

  return {
    has: (itemId) => Boolean(itemId) && validIds.has(itemId),
    isFavorite,
    isHidden,
    load,
    moveToRecent,
    toggleFavorite,
    toggleHidden,
  };
}

module.exports = {
  createCollectionStore,
};
