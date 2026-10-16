const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createCollectionStore,
} = require('../../../src/renderer/state/createCollectionStore');

function createFixture(saved = {}) {
  const lists = new Map(Object.entries(saved));
  const preferences = {
    readIdList: (key) => lists.get(key) || [],
    writeIdList: (key, ids) => lists.set(key, [...ids]),
  };
  const state = {
    favorites: [],
    recent: [],
    hidden: [],
  };
  const store = createCollectionStore({
    state,
    preferences,
    validIds: new Set(['a', 'b', 'c', 'd']),
    recentLimit: 2,
    fields: {
      favorites: 'favorites',
      recent: 'recent',
      hidden: 'hidden',
    },
    storageKeys: {
      favorites: 'fav',
      recent: 'rec',
      hidden: 'hid',
    },
  });
  return {
    lists,
    state,
    store,
  };
}

test('load sanitizes saved lists and drops hidden favorites', () => {
  const {
    lists,
    state,
    store,
  } = createFixture({
    fav: ['a', 'b', 'zzz'],
    rec: ['a', 'b', 'c'],
    hid: ['b'],
  });

  store.load();
  assert.deepEqual(state.favorites, ['a']);
  assert.deepEqual(state.recent, ['a', 'b']);
  assert.deepEqual(state.hidden, ['b']);
  assert.deepEqual(lists.get('fav'), ['a']);
});

test('moveToRecent reports whether the list changed', () => {
  const {
    state,
    store,
  } = createFixture();

  assert.equal(store.moveToRecent('a'), true);
  assert.equal(store.moveToRecent('a'), false);
  assert.equal(store.moveToRecent('b'), true);
  assert.equal(store.moveToRecent('c'), true);
  assert.deepEqual(state.recent, ['c', 'b']);
  assert.equal(store.moveToRecent('unknown'), false);
});

test('hiding a favorite removes it from favorites', () => {
  const {
    state,
    store,
  } = createFixture();

  assert.equal(store.toggleFavorite('a'), false);
  assert.deepEqual(state.favorites, ['a']);
  assert.equal(store.toggleHidden('a'), false);
  assert.deepEqual(state.hidden, ['a']);
  assert.deepEqual(state.favorites, []);
  assert.equal(store.toggleHidden('a'), true);
  assert.deepEqual(state.hidden, []);
});
