const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STORAGE_KEYS,
  createPreferencesStore,
} = require('../../../src/renderer/state/PreferencesStore');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('flags fall back when unset and round-trip when saved', () => {
  const storage = createMemoryStorage();
  const preferences = createPreferencesStore(() => storage);
  assert.equal(preferences.readFlag(STORAGE_KEYS.n64Mode, true), true);

  preferences.writeString(STORAGE_KEYS.n64Mode, false);
  assert.equal(preferences.readFlag(STORAGE_KEYS.n64Mode, true), false);
});

test('id lists ignore corrupt JSON', () => {
  const storage = createMemoryStorage();
  const preferences = createPreferencesStore(() => storage);
  storage.setItem(STORAGE_KEYS.favoriteCharacters, '{not json');
  assert.deepEqual(preferences.readIdList(STORAGE_KEYS.favoriteCharacters), []);

  preferences.writeIdList(STORAGE_KEYS.favoriteCharacters, ['bk/banjo']);
  assert.deepEqual(preferences.readIdList(STORAGE_KEYS.favoriteCharacters), ['bk/banjo']);
});

test('blocked storage never throws', () => {
  const preferences = createPreferencesStore(() => {
    throw new Error('storage disabled');
  });
  assert.equal(preferences.readString('x'), null);
  assert.doesNotThrow(() => preferences.writeString('x', 'y'));
  assert.doesNotThrow(() => preferences.remove('x'));
  assert.deepEqual(preferences.readIdList('x'), []);
});

test('storage keys keep their persisted names', () => {
  assert.equal(STORAGE_KEYS.favoriteCharacters, 'dialoggo-favorite-characters');
  assert.equal(STORAGE_KEYS.selectedBackground, 'dialoggo-selected-background');
});
