const {
  getDialoggoBridge,
} = require('../runtime/getBridge');

const SPEAK_FRAME_COUNT = 6;
const IDLE_FRAME_COUNT = 4;
const FAST_FORWARD_TEXT_MULTIPLIER = 1.75;
const FAST_FORWARD_AUDIO_RATE = 1.3;
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
const DIALOGUE_SHAKE_MARKER = '**';

const storageKeys = {
  n64Mode: 'dialoggo-n64-mode',
  mirrorMode: 'dialoggo-mirror-mode',
  hideBrokenChars: 'dialoggo-hide-broken-chars',
  menuSoundsVolume: 'dialoggo-menu-sounds-volume',
};

function createEnvironment() {
  const bridge = getDialoggoBridge();
  const {
    paths,
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
    charDataDir: paths.charDataDir,
    charImgDir: paths.charImgDir,
    charSndDir: paths.charSndDir,
    guiImgDir: paths.guiImgDir,
    guiAnimDir: paths.guiAnimDir,
    startupRevealSoundPath: bridge.path.join(paths.sndDir, 'gui', '6.wav'),
    appVersion,
    platform,
    log: bridge.log,
  };
}

function isDirectoryEntry(entry) {
  return !!entry && (entry.isDirectory === true || typeof entry.isDirectory === 'function' && entry.isDirectory());
}

function listCharacterDirectoryNames(env, rootDir) {
  if (!env.fs.existsSync(rootDir)) return [];

  return env.fs.readdirSync(rootDir, {
    withFileTypes: true,
  })
    .filter((entry) => isDirectoryEntry(entry))
    .map((entry) => entry.name);
}

function formatCharacterFolderName(folderName) {
  const sanitizedFolderName = String(folderName || '')
    .replace(/-/g, ' ')
    .trim();

  if (!sanitizedFolderName) return '';

  return sanitizedFolderName.charAt(0).toUpperCase() + sanitizedFolderName.slice(1);
}

function getCharacterDisplayName(folderName, characterConfig) {
  const configuredName = String(characterConfig?.name || '').trim();
  if (configuredName) return configuredName;
  return formatCharacterFolderName(folderName);
}

function readCharacterConfig(env, characterName) {
  const configPath = env.path.join(env.charDataDir, characterName, 'config.json');
  if (!env.fs.existsSync(configPath)) return {};

  try {
    return env.fs.readJsonFile(configPath, {
      fallback: {},
      label: `Character config for ${characterName}`,
      maxBytes: 16 * 1024,
    }) || {};
  } catch {
    return {};
  }
}

function discoverCharacters(env) {
  const characters = [];
  const names = new Set([
    ...listCharacterDirectoryNames(env, env.charDataDir),
    ...listCharacterDirectoryNames(env, env.charImgDir),
    ...listCharacterDirectoryNames(env, env.charSndDir),
  ]);

  if (names.size === 0) return characters;

  for (const name of names) {
    const imgDir = env.path.join(env.charImgDir, name);
    const sndDir = env.path.join(env.charSndDir, name);
    const characterConfig = readCharacterConfig(env, name);
    const soundConfig = typeof characterConfig?.sound === 'object' && characterConfig.sound !== null
      ? characterConfig.sound
      : {};
    const hasImgDirectory = env.fs.existsSync(imgDir);
    const hasSoundDirectory = env.fs.existsSync(sndDir);

    if (!hasImgDirectory && !hasSoundDirectory) continue;

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
    const hasAllSprites = speakFrames.length === SPEAK_FRAME_COUNT && idleFrames.length === IDLE_FRAME_COUNT;
    const hasAnySound = soundFiles.length > 0;
    const hasDisplaySprite = hasImgDirectory && env.fs.existsSync(displaySpritePath);

    characters.push({
      id: name,
      displayName: getCharacterDisplayName(name, characterConfig?.character),
      speakFrames,
      idleFrames,
      previewSpritePath: hasDisplaySprite ? displaySpritePath : null,
      sounds: soundFiles,
      hasVariablePitch: soundConfig?.hasVariablePitch === true,
      basePitchTones: Number.isFinite(parsedBasePitchTones) ? parsedBasePitchTones : 0,
      canStretch: soundConfig?.canStretch === true,
      isAvailable: hasAllSprites && hasAnySound,
      hasAllSprites,
      hasAnySound,
      hasImgDirectory,
      hasSoundDirectory,
    });
  }

  return characters;
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

function clampMenuSoundsVolumeLevel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(6, Math.round(parsed)));
}

function clampDialogueInputValue(value) {
  return String(value || '').slice(0, DIALOGUE_INPUT_MAX_LENGTH);
}

function normalizeCharacterSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function createDialogueCharacter(value, emphasis = false) {
  return {
    value,
    emphasis,
  };
}

function createLineFromCharacters(characters) {
  return {
    text: characters.map((character) => character.value).join(''),
    characters,
  };
}

function getPairedDialogueMarkerStarts(text) {
  const source = String(text || '');
  const markerStarts = [];

  for (let index = 0; index < source.length; index += 1) {
    if (!source.startsWith(DIALOGUE_SHAKE_MARKER, index)) continue;
    markerStarts.push(index);
    index += DIALOGUE_SHAKE_MARKER.length - 1;
  }

  if (markerStarts.length < 2) return new Set();

  return new Set(markerStarts.slice(0, markerStarts.length - (markerStarts.length % 2)));
}

function parseDialogueMarkup(text) {
  const source = String(text || '').toUpperCase();
  const characters = [];
  let emphasis = false;
  const pairedMarkerStarts = getPairedDialogueMarkerStarts(source);

  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith(DIALOGUE_SHAKE_MARKER, index) && pairedMarkerStarts.has(index)) {
      emphasis = !emphasis;
      index += DIALOGUE_SHAKE_MARKER.length - 1;
      continue;
    }

    characters.push(createDialogueCharacter(source[index], emphasis));
  }

  return characters;
}

function splitStyledTextIntoLines(text, maxCharsPerLine = 32) {
  const lines = [];
  const parsedCharacters = parseDialogueMarkup(text);
  let manualLineCharacters = [];

  const flushManualLine = () => {
    const visibleText = manualLineCharacters.map((character) => character.value).join('');
    if (visibleText.trim() === '') {
      lines.push('');
      manualLineCharacters = [];
      return;
    }

    const words = [];
    let currentWord = [];

    manualLineCharacters.forEach((character) => {
      if (/\s/.test(character.value)) {
        if (currentWord.length > 0) {
          words.push(currentWord);
          currentWord = [];
        }
        return;
      }

      currentWord.push(character);
    });

    if (currentWord.length > 0) {
      words.push(currentWord);
    }

    let currentLine = [];

    for (const word of words) {
      let remainingWord = word.slice();

      while (remainingWord.length > maxCharsPerLine) {
        if (currentLine.length > 0) {
          lines.push(createLineFromCharacters(currentLine));
          currentLine = [];
        }

        lines.push(createLineFromCharacters(remainingWord.slice(0, maxCharsPerLine)));
        remainingWord = remainingWord.slice(maxCharsPerLine);
      }

      if (remainingWord.length === 0) continue;

      if (currentLine.length === 0) {
        currentLine = remainingWord.slice();
      } else if (currentLine.length + 1 + remainingWord.length <= maxCharsPerLine) {
        const previousChar = currentLine[currentLine.length - 1];
        const nextChar = remainingWord[0];
        currentLine.push(createDialogueCharacter(' ', !!(previousChar?.emphasis && nextChar?.emphasis)));
        currentLine.push(...remainingWord);
      } else {
        lines.push(createLineFromCharacters(currentLine));
        currentLine = remainingWord.slice();
      }
    }

    if (currentLine.length > 0) {
      lines.push(createLineFromCharacters(currentLine));
    }

    manualLineCharacters = [];
  };

  parsedCharacters.forEach((character) => {
    if (character.value === '\n') {
      flushManualLine();
      return;
    }

    manualLineCharacters.push(character);
  });

  flushManualLine();

  return lines.map((line) => (typeof line === 'string' ? createLineFromCharacters([]) : line));
}

function splitTextIntoLines(text, maxCharsPerLine = 32) {
  return splitStyledTextIntoLines(text, maxCharsPerLine).map((line) => line.text);
}

function tonesToSemitoneOffset(value) {
  if (!Number.isFinite(value)) return 0;
  return value * 2;
}

function getCharacterPitchSemitoneOffset(character) {
  let semitoneOffset = tonesToSemitoneOffset(character?.basePitchTones ?? 0);
  if (character?.hasVariablePitch) {
    semitoneOffset += -2 + Math.random() * 4;
  }
  return semitoneOffset;
}

function semitoneOffsetToRate(semitoneOffset) {
  return Math.pow(2, semitoneOffset / 12);
}

function getSpeechCutTargetDuration(bufferDuration, fastForward) {
  const longness = Math.max(0, Math.min(1, (bufferDuration - 0.08) / 1.65));
  const cutChance = Math.max(0.28, Math.min(0.94, 0.28 + longness * 0.52 + (fastForward ? 0.08 : 0)));
  const shouldCut = Math.random() < cutChance;

  if (!shouldCut) {
    const fullRatioMin = fastForward ?
      0.82 - longness * 0.06 :
      0.87 - longness * 0.07;

    return bufferDuration * (fullRatioMin + Math.random() * (1 - fullRatioMin));
  }

  const minRatio = fastForward ?
    0.5 - longness * 0.14 :
    0.58 - longness * 0.18;
  const maxRatio = fastForward ?
    0.76 - longness * 0.1 :
    0.84 - longness * 0.12;
  const ratio = Math.max(0.34, Math.min(0.93, minRatio + Math.random() * (maxRatio - minRatio)));

  return Math.max(0.055, bufferDuration * ratio);
}

function getCharacterPlaybackConfig(bufferDuration, character, desiredDuration, fastForward) {
  const targetDuration = Math.max(0.055, Math.min(desiredDuration, bufferDuration));
  const semitoneOffset = getCharacterPitchSemitoneOffset(character);
  const basePlaybackRate = semitoneOffsetToRate(semitoneOffset);
  const playbackRate = basePlaybackRate * (fastForward ? FAST_FORWARD_AUDIO_RATE : 1);

  let sourceDuration = targetDuration;
  if (!character?.canStretch) {
    sourceDuration = Math.min(bufferDuration, targetDuration * basePlaybackRate);
  }

  return {
    basePlaybackRate,
    playbackRate,
    sourceDuration: Math.max(0.001, sourceDuration),
  };
}

function createAppModel() {
  const env = createEnvironment();

  return {
    env,
    characters: discoverCharacters(env),
    genericSounds: discoverGenericSounds(env),
    state: {
      selectedCharacter: null,
      isPlaying: false,
      isPaused: false,
      stopRequested: false,
      pauseTransitionLock: false,
      isFastForwarding: false,
      fastForwardKeyHeld: false,
      fastForwardButtonHeld: false,
      dialogueMirrored: false,
      n64ModeEnabled: false,
      hideBrokenChars: false,
      menuSoundsVolumeLevel: 6,
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
      PREVIEW_STRIP_HEIGHT,
      PREVIEW_COLLAPSE_MS,
      FLIP_CARD_MS,
      PREVIEW_EASE,
    },
    storageKeys,
    pick,
    sleep,
    clampMenuSoundsVolumeLevel,
    clampDialogueInputValue,
    normalizeCharacterSearch,
    getPairedDialogueMarkerStarts,
    parseDialogueMarkup,
    splitStyledTextIntoLines,
    splitTextIntoLines,
    getCharacterPitchSemitoneOffset,
    semitoneOffsetToRate,
    getSpeechCutTargetDuration,
    getCharacterPlaybackConfig,
  };
}

module.exports = {
  createAppModel
};
