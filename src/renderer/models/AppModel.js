const {
  getDialoggoBridge,
} = require('../runtime/getBridge');

const {
  clampNumber,
} = require('../domain/math');
const {
  getPairedDialogueMarkerStarts,
  parseDialogueMarkup,
  splitStyledTextIntoLines,
  splitTextIntoLines,
} = require('../domain/dialogueText');
const {
  FAST_FORWARD_AUDIO_RATE,
  parseCharacterSkipFrequency,
  getCharacterPitchSemitoneOffset,
  semitoneOffsetToRate,
  getSpeechBurstProfile,
  getSpeechCutTargetDuration,
  getCharacterPlaybackConfig,
} = require('../domain/speechPlayback');

const SPEAK_FRAME_COUNT = 6;
const IDLE_FRAME_COUNT = 4;
const FAST_FORWARD_TEXT_MULTIPLIER = 1.75;
const FAST_FORWARD_SPRITE_MULTIPLIER = 1.18;
const STARTUP_INTRO_MS = 1160;
const STARTUP_JIGGY_SIZE = 48;
const STARTUP_JIGGY_CENTER_OFFSET_X = -2;
const STARTUP_JIGGY_CENTER_OFFSET_Y = -2;
const STARTUP_JIGGY_PATH_DATA = 'M47,26.54V11H31.46a6,6,0,1,0-8.92,0H11V26.54a6,6,0,1,0,0,8.92V47H22.54a6,6,0,1,1,8.92,0H47V35.46a6,6,0,1,1,0-8.92Z';
const N64_CANVAS_PIXEL_BLOCK = 3;
const N64_TEXT_PIXEL_BLOCK = 2;
const N64_TEXT_LINE_HEIGHT = 33;
const N64_TEXT_FONT = 'bold 30px "Andy Bold", "Comic Sans MS", cursive';
const DIALOGUE_INPUT_MAX_LENGTH = 1000;
const PREVIEW_STRIP_HEIGHT = 58;
const PREVIEW_COLLAPSE_MS = 420;
const FLIP_CARD_MS = 600;
const PREVIEW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MAX_RECENT_CHARACTERS = 5;
const MAX_RECENT_BACKGROUNDS = 5;

const storageKeys = {
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
};
const RESERVED_PACK_DIRECTORY_NAMES = new Set(['char', 'generic', 'gui']);
const CUSTOM_PACK_ID = 'custom';
const SPECIAL_PACK_ORDER = new Map([
  [CUSTOM_PACK_ID, 0],
]);
const BACKGROUND_FILE_NAMES = ['bg.jpg', 'bg.png'];

function createEnvironment() {
  const bridge = getDialoggoBridge();
  const {
    paths,
    appName,
    appAuthor,
    appHomepage,
    appVersion,
    platform,
  } = bridge.runtime;

  return {
    path: bridge.path,
    fs: bridge.files,
    publicDir: paths.publicDir,
    assetsDir: paths.assetsDir,
    dataDir: paths.dataDir,
    sndDir: paths.sndDir,
    imgDir: paths.imgDir,
    packDataDir: paths.packDataDir,
    packImgDir: paths.packImgDir,
    packSndDir: paths.packSndDir,
    backgroundDataDir: paths.backgroundDataDir,
    backgroundImgDir: paths.backgroundImgDir,
    genericImgDir: paths.genericImgDir,
    guiImgDir: paths.guiImgDir,
    guiAnimDir: paths.guiAnimDir,
    startupRevealSoundPath: bridge.path.join(paths.sndDir, 'gui', '6.wav'),
    appName,
    appAuthor,
    appHomepage,
    appVersion,
    platform,
    log: bridge.log,
  };
}

function isDirectoryEntry(entry) {
  return !!entry && (entry.isDirectory === true || typeof entry.isDirectory === 'function' && entry.isDirectory());
}

function listDirectoryNames(env, rootDir) {
  if (!env.fs.existsSync(rootDir)) return [];

  return env.fs.readdirSync(rootDir, {
    withFileTypes: true,
  })
    .filter((entry) => isDirectoryEntry(entry))
    .map((entry) => entry.name);
}

function sortDirectoryNames(directoryNames) {
  return [...directoryNames].sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: 'base',
  }));
}

function sortItemsByDisplayName(items, getDisplayName) {
  return [...items].sort((left, right) => {
    const leftName = String(getDisplayName(left) || '').trim();
    const rightName = String(getDisplayName(right) || '').trim();
    return leftName.localeCompare(rightName, undefined, {
      sensitivity: 'base',
    });
  });
}

function sortPacks(packs) {
  return [...packs].sort((left, right) => {
    const leftId = String(left?.id || '').toLowerCase();
    const rightId = String(right?.id || '').toLowerCase();
    const leftPriority = SPECIAL_PACK_ORDER.has(leftId) ? SPECIAL_PACK_ORDER.get(leftId) : Number.MAX_SAFE_INTEGER;
    const rightPriority = SPECIAL_PACK_ORDER.has(rightId) ? SPECIAL_PACK_ORDER.get(rightId) : Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return String(left?.displayName || '').localeCompare(String(right?.displayName || ''), undefined, {
      sensitivity: 'base',
    });
  });
}

function formatAssetFolderName(folderName) {
  const sanitizedFolderName = String(folderName || '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!sanitizedFolderName) return '';

  return sanitizedFolderName
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCharacterDisplayName(folderName, characterConfig) {
  const configuredName = String(characterConfig?.name || '').trim();
  if (configuredName) return configuredName;
  return formatAssetFolderName(folderName);
}

function getBackgroundDisplayName(folderName, backgroundConfig) {
  const configuredName = String(backgroundConfig?.name || '').trim();
  if (configuredName) return configuredName;
  return formatAssetFolderName(folderName);
}

function getPackDisplayName(folderName, packConfig) {
  const configuredName = String(packConfig?.name || '').trim();
  if (configuredName) return configuredName;
  return formatAssetFolderName(folderName);
}

function readConfigFile(env, configPath, label) {
  if (!env.fs.existsSync(configPath)) return {};
  try {
    const value = env.fs.readJsonFile(configPath, {
      fallback: {},
      label,
      maxBytes: 16 * 1024,
    });
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

function readPackConfig(env, packName) {
  return readConfigFile(
    env,
    env.path.join(env.packDataDir, packName, 'config.json'),
    `Pack config for ${packName}`,
  );
}

function readCharacterConfig(env, packName, characterName) {
  return readConfigFile(
    env,
    env.path.join(env.packDataDir, packName, characterName, 'config.json'),
    `Character config for ${packName}/${characterName}`,
  );
}

function readBackgroundPackConfig(env, packName) {
  return readConfigFile(
    env,
    env.path.join(env.backgroundDataDir, packName, 'config.json'),
    `Background pack config for ${packName}`,
  );
}

function readBackgroundConfig(env, packName, backgroundName) {
  return readConfigFile(
    env,
    env.path.join(env.backgroundDataDir, packName, backgroundName, 'config.json'),
    `Background config for ${packName}/${backgroundName}`,
  );
}

function listDirectoryNamesFromRoots(env, rootDirs, reservedNames = null) {
  const packNames = new Set();

  rootDirs.forEach((rootDir) => {
    listDirectoryNames(env, rootDir).forEach((directoryName) => {
      if (reservedNames?.has(String(directoryName).toLowerCase())) return;
      packNames.add(directoryName);
    });
  });

  return sortDirectoryNames(packNames);
}

function discoverCharacterCatalog(env) {
  const packs = [];
  const characters = [];

  listDirectoryNamesFromRoots(env, [
    env.packDataDir,
    env.packImgDir,
    env.packSndDir,
  ], RESERVED_PACK_DIRECTORY_NAMES).forEach((packName) => {
    const packDataDir = env.path.join(env.packDataDir, packName);
    const packImgDir = env.path.join(env.packImgDir, packName);
    const packSndDir = env.path.join(env.packSndDir, packName);
    const packConfig = readPackConfig(env, packName);
    const packDisplayName = getPackDisplayName(packName, packConfig);
    const characterNames = listDirectoryNamesFromRoots(env, [
      packDataDir,
      packImgDir,
      packSndDir,
    ]);
    const sortedCharacterNames = sortItemsByDisplayName(characterNames, (characterName) => {
      const characterConfig = readCharacterConfig(env, packName, characterName);
      return getCharacterDisplayName(characterName, characterConfig?.character);
    });
    let discoveredCharacterCount = 0;

    if (sortedCharacterNames.length === 0) return;

    sortedCharacterNames.forEach((characterName) => {
      const imgDir = env.path.join(packImgDir, characterName);
      const sndDir = env.path.join(packSndDir, characterName);
      const characterConfig = readCharacterConfig(env, packName, characterName);
      const soundConfig = typeof characterConfig?.sound === 'object' && characterConfig.sound !== null
        ? characterConfig.sound
        : {};
      const hasImgDirectory = env.fs.existsSync(imgDir);
      const hasSoundDirectory = env.fs.existsSync(sndDir);

      if (!hasImgDirectory && !hasSoundDirectory) return;
      discoveredCharacterCount += 1;

      const speakFrames = [];
      const idleFrames = [];
      const displaySpritePath = env.path.join(imgDir, 'i1.png');

      if (hasImgDirectory) {
        for (let i = 1; i <= SPEAK_FRAME_COUNT; i += 1) {
          const spritePath = env.path.join(imgDir, `s${i}.png`);
          if (env.fs.existsSync(spritePath)) speakFrames.push(spritePath);
        }

        for (let i = 1; i <= IDLE_FRAME_COUNT; i += 1) {
          const spritePath = env.path.join(imgDir, `i${i}.png`);
          if (env.fs.existsSync(spritePath)) idleFrames.push(spritePath);
        }
      }

      const soundFiles = [];

      if (hasSoundDirectory) {
        const files = env.fs.readdirSync(sndDir).filter((file) => /\.(wav|mp3|ogg)$/i.test(file));
        files.forEach((file) => {
          soundFiles.push(env.path.join(sndDir, file));
        });
      }

      const parsedBasePitchTones = Number(soundConfig?.pitch);
      const parsedSkipFrequency = parseCharacterSkipFrequency(soundConfig?.skipFrequency);
      const hasAllSprites = speakFrames.length === SPEAK_FRAME_COUNT && idleFrames.length === IDLE_FRAME_COUNT;
      const hasAnySound = soundFiles.length > 0;
      const hasDisplaySprite = hasImgDirectory && env.fs.existsSync(displaySpritePath);

      characters.push({
        id: `${packName}/${characterName}`,
        packId: packName,
        packDisplayName,
        folderName: characterName,
        displayName: getCharacterDisplayName(characterName, characterConfig?.character),
        speakFrames,
        idleFrames,
        previewSpritePath: hasDisplaySprite ? displaySpritePath : null,
        sounds: soundFiles,
        hasVariablePitch: soundConfig?.hasVariablePitch === true,
        basePitchTones: Number.isFinite(parsedBasePitchTones) ? parsedBasePitchTones : 0,
        canStretch: soundConfig?.canStretch === true,
        skipFrequency: parsedSkipFrequency,
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

function resolveBackgroundPreviewPath(env, imageDirectory) {
  if (env.fs.existsSync(imageDirectory)) {
    for (const fileName of BACKGROUND_FILE_NAMES) {
      const candidatePath = env.path.join(imageDirectory, fileName);
      if (env.fs.existsSync(candidatePath)) return candidatePath;
    }
  }

  const fallbackPath = env.path.join(env.genericImgDir, '1.jpg');
  return env.fs.existsSync(fallbackPath) ? fallbackPath : null;
}

function discoverBackgroundCatalog(env) {
  const packs = [];
  const backgrounds = [];

  const discoveredPackNames = listDirectoryNamesFromRoots(env, [
    env.backgroundDataDir,
    env.backgroundImgDir,
  ]);

  if (!discoveredPackNames.some((packName) => String(packName).toLowerCase() === CUSTOM_PACK_ID)) {
    discoveredPackNames.push(CUSTOM_PACK_ID);
  }

  discoveredPackNames.forEach((packName) => {
    const packDataDir = env.path.join(env.backgroundDataDir, packName);
    const packImgDir = env.path.join(env.backgroundImgDir, packName);
    const packConfig = readBackgroundPackConfig(env, packName);
    const packDisplayName = getPackDisplayName(packName, packConfig);
    const backgroundNames = listDirectoryNamesFromRoots(env, [
      packDataDir,
      packImgDir,
    ]);
    const sortedBackgroundNames = sortItemsByDisplayName(backgroundNames, (backgroundName) => {
      const backgroundConfig = readBackgroundConfig(env, packName, backgroundName);
      return getBackgroundDisplayName(backgroundName, backgroundConfig?.background);
    });
    let discoveredBackgroundCount = 0;

    if (sortedBackgroundNames.length === 0) {
      if (String(packName).toLowerCase() === CUSTOM_PACK_ID) {
        packs.push({
          id: packName,
          displayName: packDisplayName,
          backgroundCount: 0,
        });
      }
      return;
    }

    sortedBackgroundNames.forEach((backgroundName) => {
      const imageDirectory = env.path.join(packImgDir, backgroundName);
      const dataDirectory = env.path.join(packDataDir, backgroundName);
      const hasDataDirectory = env.fs.existsSync(dataDirectory);
      const hasImgDirectory = env.fs.existsSync(imageDirectory);

      if (!hasDataDirectory && !hasImgDirectory) return;

      const backgroundConfig = readBackgroundConfig(env, packName, backgroundName);
      const previewImagePath = resolveBackgroundPreviewPath(env, imageDirectory);
      const hasBuiltImage = hasImgDirectory && BACKGROUND_FILE_NAMES.some((fileName) => (
        env.fs.existsSync(env.path.join(imageDirectory, fileName))
      ));
      const isAvailable = hasBuiltImage && Boolean(previewImagePath);

      discoveredBackgroundCount += 1;
      backgrounds.push({
        id: `${packName}/${backgroundName}`,
        packId: packName,
        packDisplayName,
        folderName: backgroundName,
        displayName: getBackgroundDisplayName(backgroundName, backgroundConfig?.background),
        previewImagePath,
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

  if (!packs.some((pack) => String(pack?.id).toLowerCase() === CUSTOM_PACK_ID)) {
    const customPackConfig = readBackgroundPackConfig(env, CUSTOM_PACK_ID);
    packs.push({
      id: CUSTOM_PACK_ID,
      displayName: getPackDisplayName(CUSTOM_PACK_ID, customPackConfig),
      backgroundCount: 0,
    });
  }

  return {
    packs: sortPacks(packs),
    backgrounds,
  };
}

function discoverGenericSounds(env) {
  const genericDir = env.path.join(env.sndDir, 'generic');
  if (!env.fs.existsSync(genericDir)) return [];

  return env.fs.readdirSync(genericDir)
    .filter((file) => /\.(wav|mp3|ogg)$/i.test(file))
    .map((file) => env.path.join(genericDir, file));
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDialogueInputValue(value) {
  return String(value || '').slice(0, DIALOGUE_INPUT_MAX_LENGTH);
}

function normalizeCharacterSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function createAppModel() {
  const env = createEnvironment();
  const characterCatalog = discoverCharacterCatalog(env);
  const backgroundCatalog = discoverBackgroundCatalog(env);

  return {
    env,
    packs: characterCatalog.packs,
    characters: characterCatalog.characters,
    backgroundPacks: backgroundCatalog.packs,
    backgrounds: backgroundCatalog.backgrounds,
    genericSounds: discoverGenericSounds(env),
    state: {
      selectedCharacter: null,
      selectedBackground: null,
      isPlaying: false,
      isPaused: false,
      stopRequested: false,
      pauseTransitionLock: false,
      isFastForwarding: false,
      fastForwardKeyHeld: false,
      fastForwardButtonHeld: false,
      dialogueMirrored: false,
      n64ModeEnabled: false,
      shortcutVisualizerEnabled: true,
      hideBrokenChars: false,
      hideBrokenBackgrounds: false,
      favoriteCharacterIds: [],
      recentCharacterIds: [],
      favoriteBackgroundIds: [],
      recentBackgroundIds: [],
      hiddenCharacterIds: [],
      hiddenBackgroundIds: [],
      hiddenCharactersCollapsed: true,
      favoriteContextMenu: {
        visible: false,
        targetId: null,
        targetType: null,
        x: 0,
        y: 0,
      },
      frontPanel: 'controls',
      activePanel: 'controls',
      panelTransitionLock: false,
      pauseResolve: null,
    },
    constants: {
      SPEAK_FRAME_COUNT,
      IDLE_FRAME_COUNT,
      FAST_FORWARD_TEXT_MULTIPLIER,
      FAST_FORWARD_AUDIO_RATE,
      FAST_FORWARD_SPRITE_MULTIPLIER,
      STARTUP_INTRO_MS,
      STARTUP_JIGGY_SIZE,
      STARTUP_JIGGY_CENTER_OFFSET_X,
      STARTUP_JIGGY_CENTER_OFFSET_Y,
      STARTUP_JIGGY_PATH_DATA,
      N64_CANVAS_PIXEL_BLOCK,
      N64_TEXT_PIXEL_BLOCK,
      N64_TEXT_LINE_HEIGHT,
      N64_TEXT_FONT,
      DIALOGUE_INPUT_MAX_LENGTH,
      MAX_RECENT_CHARACTERS,
      MAX_RECENT_BACKGROUNDS,
      PREVIEW_STRIP_HEIGHT,
      PREVIEW_COLLAPSE_MS,
      FLIP_CARD_MS,
      PREVIEW_EASE,
    },
    storageKeys,
    pick,
    sleep,
    clampDialogueInputValue,
    normalizeCharacterSearch,
    getPairedDialogueMarkerStarts,
    parseDialogueMarkup,
    splitStyledTextIntoLines,
    splitTextIntoLines,
    getCharacterPitchSemitoneOffset,
    semitoneOffsetToRate,
    getSpeechBurstProfile,
    getSpeechCutTargetDuration,
    getCharacterPlaybackConfig,
  };
}

module.exports = {
  createAppModel
};
