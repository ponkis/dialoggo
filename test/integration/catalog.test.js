const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  resolveAssetRequestPath,
} = require('../../src/main/protocol/assetProtocol');
const {
  createCatalogService,
} = require('../../src/main/services/catalog/CatalogService');
const {
  LOADING_FRAME_COUNT,
  MENU_SOUND_FILES,
} = require('../../src/main/services/catalog/uiAssets');

// Runs discovery against the real bundled assets in public/, which is the
// same tree the build copies into dist/renderer.
const rendererDir = path.resolve(__dirname, '..', '..', 'public');
const catalog = createCatalogService({
  assetsDir: path.join(rendererDir, 'assets'),
  rendererDir,
}).getCatalog();

function assertUrlResolvesToFile(url) {
  const filePath = resolveAssetRequestPath(url, rendererDir);
  assert.ok(filePath, `URL does not map into the renderer root: ${url}`);
  assert.ok(fs.statSync(filePath).isFile(), `Missing asset for ${url}`);
}

test('discovers the bundled character packs', () => {
  assert.ok(catalog.characters.length > 0);
  assert.ok(catalog.packs.some((pack) => pack.id === 'bk'));

  const banjo = catalog.characters.find((character) => character.id === 'bk/banjo');
  assert.ok(banjo, 'bk/banjo should be discovered');
  assert.equal(banjo.isAvailable, true);
  assert.equal(banjo.idleFrames.length, 4);
  assert.equal(banjo.speakFrames.length, 6);
  assert.ok(banjo.sounds.length > 0);
});

test('custom packs sort first and the custom background pack always exists', () => {
  assert.equal(catalog.packs[0].id, 'custom');
  assert.ok(catalog.backgroundPacks.some((pack) => pack.id === 'custom'));
});

test('character and background ids are unique', () => {
  const characterIds = catalog.characters.map((character) => character.id);
  const backgroundIds = catalog.backgrounds.map((background) => background.id);
  assert.equal(new Set(characterIds).size, characterIds.length);
  assert.equal(new Set(backgroundIds).size, backgroundIds.length);
});

test('every asset URL in the catalog resolves to a real file', () => {
  catalog.characters.forEach((character) => {
    [...character.idleFrames, ...character.speakFrames, ...character.sounds].forEach(assertUrlResolvesToFile);
    if (character.previewSpriteUrl) assertUrlResolvesToFile(character.previewSpriteUrl);
  });

  catalog.backgrounds.forEach((background) => {
    if (background.previewImageUrl) assertUrlResolvesToFile(background.previewImageUrl);
  });

  catalog.genericSounds.forEach(assertUrlResolvesToFile);
  catalog.ui.loadingFrames.filter(Boolean).forEach(assertUrlResolvesToFile);
  Object.values(catalog.ui.sounds).filter(Boolean).forEach(assertUrlResolvesToFile);
});

test('interface assets are present', () => {
  assert.equal(catalog.ui.loadingFrames.length, LOADING_FRAME_COUNT);
  assert.ok(catalog.ui.loadingFrames.every(Boolean));
  Object.keys(MENU_SOUND_FILES).forEach((key) => {
    assert.ok(catalog.ui.sounds[key], `Missing interface sound: ${key}`);
  });
  assert.ok(catalog.ui.missingCharacterImage);
  assert.ok(catalog.ui.warningBadgeImage);
});

test('the catalog survives structured cloning for IPC', () => {
  assert.deepEqual(structuredClone(catalog), catalog);
});
