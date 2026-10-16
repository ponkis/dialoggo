const path = require('path');
const {
  createPackSorter,
  getConfiguredDisplayName,
  listDirectoryNamesFromRoots,
  sortItemsByDisplayName,
} = require('./catalogFiles');

const CUSTOM_PACK_ID = 'custom';
const BACKGROUND_FILE_NAMES = ['bg.jpg', 'bg.png'];
const sortPacks = createPackSorter(new Map([
  [CUSTOM_PACK_ID, 0],
]));

function readBackgroundPackConfig(fsIndex, layout, packName) {
  return fsIndex.readConfig(
    path.join(layout.backgroundDataDir, packName, 'config.json'),
    `Background pack config for ${packName}`,
  );
}

function readBackgroundConfig(fsIndex, layout, packName, backgroundName) {
  return fsIndex.readConfig(
    path.join(layout.backgroundDataDir, packName, backgroundName, 'config.json'),
    `Background config for ${packName}/${backgroundName}`,
  );
}

function resolveBackgroundPreviewPath(fsIndex, layout, imageDirectory) {
  if (fsIndex.exists(imageDirectory)) {
    for (const fileName of BACKGROUND_FILE_NAMES) {
      const candidatePath = path.join(imageDirectory, fileName);
      if (fsIndex.exists(candidatePath)) return candidatePath;
    }
  }

  const fallbackPath = path.join(layout.genericImgDir, '1.jpg');
  return fsIndex.exists(fallbackPath) ? fallbackPath : null;
}

function isCustomPack(packName) {
  return String(packName).toLowerCase() === CUSTOM_PACK_ID;
}

function discoverBackgroundCatalog(fsIndex, layout, toAssetUrl) {
  const packs = [];
  const backgrounds = [];

  const discoveredPackNames = listDirectoryNamesFromRoots(fsIndex, [
    layout.backgroundDataDir,
    layout.backgroundImgDir,
  ]);

  if (!discoveredPackNames.some(isCustomPack)) {
    discoveredPackNames.push(CUSTOM_PACK_ID);
  }

  discoveredPackNames.forEach((packName) => {
    const packDataDir = path.join(layout.backgroundDataDir, packName);
    const packImgDir = path.join(layout.backgroundImgDir, packName);
    const packDisplayName = getConfiguredDisplayName(packName, readBackgroundPackConfig(fsIndex, layout, packName));
    const backgroundNames = listDirectoryNamesFromRoots(fsIndex, [
      packDataDir,
      packImgDir,
    ]);
    const sortedBackgroundNames = sortItemsByDisplayName(backgroundNames, (backgroundName) => {
      const backgroundConfig = readBackgroundConfig(fsIndex, layout, packName, backgroundName);
      return getConfiguredDisplayName(backgroundName, backgroundConfig?.background);
    });
    let discoveredBackgroundCount = 0;

    if (sortedBackgroundNames.length === 0) {
      if (isCustomPack(packName)) {
        packs.push({
          id: packName,
          displayName: packDisplayName,
          backgroundCount: 0,
        });
      }
      return;
    }

    sortedBackgroundNames.forEach((backgroundName) => {
      const imageDirectory = path.join(packImgDir, backgroundName);
      const dataDirectory = path.join(packDataDir, backgroundName);
      const hasDataDirectory = fsIndex.exists(dataDirectory);
      const hasImgDirectory = fsIndex.exists(imageDirectory);

      if (!hasDataDirectory && !hasImgDirectory) return;

      const backgroundConfig = readBackgroundConfig(fsIndex, layout, packName, backgroundName);
      const previewImagePath = resolveBackgroundPreviewPath(fsIndex, layout, imageDirectory);
      const hasBuiltImage = hasImgDirectory && BACKGROUND_FILE_NAMES.some((fileName) => (
        fsIndex.exists(path.join(imageDirectory, fileName))
      ));
      const isAvailable = hasBuiltImage && Boolean(previewImagePath);

      discoveredBackgroundCount += 1;
      backgrounds.push({
        id: `${packName}/${backgroundName}`,
        packId: packName,
        packDisplayName,
        folderName: backgroundName,
        displayName: getConfiguredDisplayName(backgroundName, backgroundConfig?.background),
        previewImageUrl: previewImagePath ? toAssetUrl(previewImagePath) : null,
        hasDataDirectory,
        hasImgDirectory,
        hasBuiltImage,
        isAvailable,
        isBroken: !isAvailable,
      });
    });

    if (discoveredBackgroundCount > 0) {
      packs.push({
        id: packName,
        displayName: packDisplayName,
        backgroundCount: discoveredBackgroundCount,
      });
    }
  });

  if (!packs.some((pack) => isCustomPack(pack?.id))) {
    packs.push({
      id: CUSTOM_PACK_ID,
      displayName: getConfiguredDisplayName(CUSTOM_PACK_ID, readBackgroundPackConfig(fsIndex, layout, CUSTOM_PACK_ID)),
      backgroundCount: 0,
    });
  }

  return {
    packs: sortPacks(packs),
    backgrounds,
  };
}

module.exports = {
  discoverBackgroundCatalog,
};
