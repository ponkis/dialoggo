const {
  toAssetUrl,
} = require('../../protocol/assetProtocol');
const {
  discoverBackgroundCatalog,
} = require('./backgroundCatalog');
const {
  createAssetLayout,
  createFsIndex,
} = require('./catalogFiles');
const {
  discoverCharacterCatalog,
} = require('./characterCatalog');
const {
  discoverGenericSounds,
  discoverUiAssets,
} = require('./uiAssets');

/**
 * Discovers the bundled character, background, and interface assets once and
 * serves the result as plain, structured-clone-safe data with dialoggo:// URLs.
 */
function createCatalogService({
  assetsDir,
  rendererDir,
  logger = null,
}) {
  const layout = createAssetLayout(assetsDir);
  const toUrl = (absolutePath) => toAssetUrl(absolutePath, rendererDir);
  let cachedCatalog = null;

  function buildCatalog() {
    const startedAt = Date.now();
    const fsIndex = createFsIndex();
    const characterCatalog = discoverCharacterCatalog(fsIndex, layout, toUrl);
    const backgroundCatalog = discoverBackgroundCatalog(fsIndex, layout, toUrl);
    const catalog = {
      packs: characterCatalog.packs,
      characters: characterCatalog.characters,
      backgroundPacks: backgroundCatalog.packs,
      backgrounds: backgroundCatalog.backgrounds,
      genericSounds: discoverGenericSounds(fsIndex, layout, toUrl),
      ui: discoverUiAssets(fsIndex, layout, toUrl),
    };

    logger?.info('Asset catalog discovered', {
      characters: catalog.characters.length,
      backgrounds: catalog.backgrounds.length,
      genericSounds: catalog.genericSounds.length,
      durationMs: Date.now() - startedAt,
    });

    return catalog;
  }

  return {
    getCatalog() {
      if (!cachedCatalog) cachedCatalog = buildCatalog();
      return cachedCatalog;
    },
  };
}

module.exports = {
  createCatalogService,
};
