const path = require('path');

const LOADING_FRAME_COUNT = 22;

const MENU_SOUND_FILES = Object.freeze({
  click: '1.wav',
  select: '2.wav',
  arrowRight: '3.wav',
  arrowLeft: '4.wav',
  forbidden: '5.wav',
  startupReveal: '6.wav',
  shutdown: '7.wav',
  settingsOpen: '3.wav',
  settingsClose: '4.wav',
  favoriteAdd: '10.wav',
  favoriteRemove: '9.wav',
});

/**
 * Resolves the interface assets the renderer needs up front. Missing files are
 * reported as null so the renderer never has to probe the filesystem itself.
 */
function discoverUiAssets(fsIndex, layout, toAssetUrl) {
  const optionalUrl = (filePath) => (fsIndex.exists(filePath) ? toAssetUrl(filePath) : null);

  const sounds = {};
  Object.entries(MENU_SOUND_FILES).forEach(([key, fileName]) => {
    sounds[key] = optionalUrl(path.join(layout.guiSndDir, fileName));
  });

  const loadingFrames = [];
  for (let i = 1; i <= LOADING_FRAME_COUNT; i += 1) {
    loadingFrames.push(optionalUrl(path.join(layout.guiAnimDir, 'loading', `${i}.png`)));
  }

  return {
    loadingFrames,
    missingCharacterImage: optionalUrl(path.join(layout.genericImgDir, '2.png')),
    warningBadgeImage: optionalUrl(path.join(layout.guiImgDir, '1.png')),
    sounds,
  };
}

function discoverGenericSounds(fsIndex, layout, toAssetUrl) {
  return fsIndex.listAudioFiles(layout.genericSndDir).map(toAssetUrl);
}

module.exports = {
  LOADING_FRAME_COUNT,
  MENU_SOUND_FILES,
  discoverGenericSounds,
  discoverUiAssets,
};
