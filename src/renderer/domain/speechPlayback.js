const {
  clampNumber,
} = require('./math');

const FAST_FORWARD_AUDIO_RATE = 1.3;
const SPEECH_CUT_LONGNESS_WINDOW = 1.2;
const DEFAULT_SKIP_FREQUENCY = 1;
const MIN_SKIP_FREQUENCY = 0;
const MAX_SKIP_FREQUENCY = 2.5;

function parseCharacterSkipFrequency(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return DEFAULT_SKIP_FREQUENCY;
  if (parsedValue <= 0) return 0;
  return clampNumber(parsedValue, MIN_SKIP_FREQUENCY, MAX_SKIP_FREQUENCY);
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

function getCharacterSkipFrequency(character) {
  return parseCharacterSkipFrequency(character?.skipFrequency);
}

function scaleSkipProbability(baseProbability, skipFrequency, min = 0.04, max = 0.995) {
  return clampNumber(baseProbability * Math.pow(skipFrequency, 1.15), min, max);
}

function scaleSkipBurstStrength(baseBurstStrength, skipFrequency) {
  return clampNumber(baseBurstStrength * Math.pow(skipFrequency, 0.45), 0.22, 1);
}

function scaleSkipClipCount(baseClipCount, skipFrequency) {
  return Math.max(1, Math.round(baseClipCount * Math.pow(skipFrequency, 0.8)));
}

function scaleSkipRatio(baseRatio, skipFrequency, min, max) {
  const normalizedRatio = clampNumber(baseRatio, 0, 1);
  const scaledDistanceFromFull = (1 - normalizedRatio) * Math.pow(skipFrequency, 0.95);
  return clampNumber(1 - scaledDistanceFromFull, min, max);
}

function getSpeechClipLongness(bufferDuration) {
  return clampNumber((bufferDuration - 0.08) / SPEECH_CUT_LONGNESS_WINDOW, 0, 1);
}

function getSpeechBurstProfile(bufferDuration, fastForward, character = null) {
  if (bufferDuration < 0.32) {
    return {
      shouldStart: false,
      burstStrength: 0,
      clipCount: 0,
      cooldownClips: 0,
    };
  }

  const longness = getSpeechClipLongness(bufferDuration);
  const skipFrequency = getCharacterSkipFrequency(character);
  if (skipFrequency <= 0) {
    return {
      shouldStart: false,
      burstStrength: 0,
      clipCount: 0,
      cooldownClips: 0,
    };
  }
  const baseStartChance = clampNumber((0.21 + longness * 0.28 + (fastForward ? 0.11 : 0)) * 2, 0.42, 0.94);
  const startChance = scaleSkipProbability(baseStartChance, skipFrequency, 0.06, 0.98);
  if (Math.random() >= startChance) {
    return {
      shouldStart: false,
      burstStrength: 0,
      clipCount: 0,
      cooldownClips: 0,
    };
  }

  const baseBurstStrength = clampNumber(
    0.68 + longness * 0.22 + Math.random() * 0.14 + (fastForward ? 0.06 : 0),
    0.68,
    1,
  );
  const baseClipCount = (fastForward ? 4 : 3) + Math.floor(Math.random() * 3);

  return {
    shouldStart: true,
    burstStrength: scaleSkipBurstStrength(baseBurstStrength, skipFrequency),
    clipCount: scaleSkipClipCount(baseClipCount, skipFrequency),
    cooldownClips: Math.floor(Math.random() * 2),
  };
}

function getSpeechCutTargetDuration(bufferDuration, fastForward, cadence = null, character = null) {
  const longness = getSpeechClipLongness(bufferDuration);
  const burstStrength = clampNumber(Number(cadence?.burstStrength) || 0, 0, 1);
  const skipFrequency = getCharacterSkipFrequency(character);
  if (skipFrequency <= 0) return bufferDuration;
  const baseCutChance = clampNumber(
    0.38 + longness * 0.5 + (fastForward ? 0.1 : 0) + burstStrength * 0.22,
    0.38,
    0.985,
  );
  const cutChance = scaleSkipProbability(baseCutChance, skipFrequency, 0.05, 0.995);
  const shouldCut = Math.random() < cutChance;

  if (!shouldCut) {
    const baseFullRatioMin = clampNumber(
      (fastForward ?
        0.74 - longness * 0.08 :
        0.8 - longness * 0.09) - burstStrength * 0.18,
        0.46,
        0.9,
      );
    const fullRatioMin = scaleSkipRatio(baseFullRatioMin, skipFrequency, 0.32, 0.985);

    return bufferDuration * (fullRatioMin + Math.random() * (1 - fullRatioMin));
  }

  const baseMinRatio = clampNumber(
    (fastForward ?
      0.42 - longness * 0.16 :
      0.5 - longness * 0.2) - burstStrength * 0.18,
      0.18,
      0.82,
    );
  const minRatio = scaleSkipRatio(baseMinRatio, skipFrequency, 0.14, 0.9);
  const baseMaxRatio = clampNumber(
    (fastForward ?
      0.64 - longness * 0.12 :
      0.74 - longness * 0.14) - burstStrength * 0.2,
    baseMinRatio + 0.08,
    0.84,
  );
  const maxRatio = scaleSkipRatio(baseMaxRatio, skipFrequency, minRatio + 0.08, 0.96);
  const ratio = minRatio + Math.random() * (maxRatio - minRatio);

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

module.exports = {
  FAST_FORWARD_AUDIO_RATE,
  parseCharacterSkipFrequency,
  getCharacterPitchSemitoneOffset,
  semitoneOffsetToRate,
  getSpeechBurstProfile,
  getSpeechCutTargetDuration,
  getCharacterPlaybackConfig,
};
