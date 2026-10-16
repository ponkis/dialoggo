const path = require('path');
const {
  parseCharacterSkipFrequency,
} = require('../../../shared/catalog/soundConfig');
const {
  createPackSorter,
  getConfiguredDisplayName,
  listDirectoryNamesFromRoots,
  sortItemsByDisplayName,
} = require('./catalogFiles');

const SPEAK_FRAME_COUNT = 6;
const IDLE_FRAME_COUNT = 4;
const RESERVED_PACK_DIRECTORY_NAMES = new Set(['char', 'generic', 'gui']);
const CUSTOM_PACK_ID = 'custom';
const sortPacks = createPackSorter(new Map([
  [CUSTOM_PACK_ID, 0],
]));

function readPackConfig(fsIndex, layout, packName) {
  return fsIndex.readConfig(
    path.join(layout.packDataDir, packName, 'config.json'),
    `Pack config for ${packName}`,
  );
}

function readCharacterConfig(fsIndex, layout, packName, characterName) {
  return fsIndex.readConfig(
    path.join(layout.packDataDir, packName, characterName, 'config.json'),
    `Character config for ${packName}/${characterName}`,
  );
}

function collectFrames(fsIndex, imgDir, prefix, count) {
  const frames = [];
  for (let i = 1; i <= count; i += 1) {
    const spritePath = path.join(imgDir, `${prefix}${i}.png`);
    if (fsIndex.exists(spritePath)) frames.push(spritePath);
  }
  return frames;
}

function discoverCharacterCatalog(fsIndex, layout, toAssetUrl) {
  const packs = [];
  const characters = [];

  listDirectoryNamesFromRoots(fsIndex, [
    layout.packDataDir,
    layout.packImgDir,
    layout.packSndDir,
  ], RESERVED_PACK_DIRECTORY_NAMES).forEach((packName) => {
    const packDataDir = path.join(layout.packDataDir, packName);
    const packImgDir = path.join(layout.packImgDir, packName);
    const packSndDir = path.join(layout.packSndDir, packName);
    const packDisplayName = getConfiguredDisplayName(packName, readPackConfig(fsIndex, layout, packName));
    const characterNames = listDirectoryNamesFromRoots(fsIndex, [
      packDataDir,
      packImgDir,
      packSndDir,
    ]);
    const sortedCharacterNames = sortItemsByDisplayName(characterNames, (characterName) => {
      const characterConfig = readCharacterConfig(fsIndex, layout, packName, characterName);
      return getConfiguredDisplayName(characterName, characterConfig?.character);
    });
    let discoveredCharacterCount = 0;

    if (sortedCharacterNames.length === 0) return;

    sortedCharacterNames.forEach((characterName) => {
      const imgDir = path.join(packImgDir, characterName);
      const sndDir = path.join(packSndDir, characterName);
      const characterConfig = readCharacterConfig(fsIndex, layout, packName, characterName);
      const soundConfig = typeof characterConfig?.sound === 'object' && characterConfig.sound !== null ?
        characterConfig.sound :
        {};
      const hasImgDirectory = fsIndex.exists(imgDir);
      const hasSoundDirectory = fsIndex.exists(sndDir);

      if (!hasImgDirectory && !hasSoundDirectory) return;
      discoveredCharacterCount += 1;

      const speakFrames = hasImgDirectory ? collectFrames(fsIndex, imgDir, 's', SPEAK_FRAME_COUNT) : [];
      const idleFrames = hasImgDirectory ? collectFrames(fsIndex, imgDir, 'i', IDLE_FRAME_COUNT) : [];
      const soundFiles = hasSoundDirectory ? fsIndex.listAudioFiles(sndDir) : [];
      const displaySpritePath = path.join(imgDir, 'i1.png');

      const parsedBasePitchTones = Number(soundConfig?.pitch);
      const hasAllSprites = speakFrames.length === SPEAK_FRAME_COUNT && idleFrames.length === IDLE_FRAME_COUNT;
      const hasAnySound = soundFiles.length > 0;
      const hasDisplaySprite = hasImgDirectory && fsIndex.exists(displaySpritePath);

      characters.push({
        id: `${packName}/${characterName}`,
        packId: packName,
        packDisplayName,
        folderName: characterName,
        displayName: getConfiguredDisplayName(characterName, characterConfig?.character),
        speakFrames: speakFrames.map(toAssetUrl),
        idleFrames: idleFrames.map(toAssetUrl),
        previewSpriteUrl: hasDisplaySprite ? toAssetUrl(displaySpritePath) : null,
        sounds: soundFiles.map(toAssetUrl),
        hasVariablePitch: soundConfig?.hasVariablePitch === true,
        basePitchTones: Number.isFinite(parsedBasePitchTones) ? parsedBasePitchTones : 0,
        canStretch: soundConfig?.canStretch === true,
        skipFrequency: parseCharacterSkipFrequency(soundConfig?.skipFrequency),
        isAvailable: hasAllSprites && hasAnySound,
        hasAllSprites,
        hasAnySound,
        hasImgDirectory,
        hasSoundDirectory,
      });
    });

    if (discoveredCharacterCount > 0) {
      packs.push({
        id: packName,
        displayName: packDisplayName,
        characterCount: discoveredCharacterCount,
      });
    }
  });

  return {
    packs: sortPacks(packs),
    characters,
  };
}

module.exports = {
  IDLE_FRAME_COUNT,
  SPEAK_FRAME_COUNT,
  discoverCharacterCatalog,
};
