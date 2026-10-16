const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FAST_FORWARD_AUDIO_RATE,
  getCharacterPlaybackConfig,
  getSpeechBurstProfile,
  getSpeechCutTargetDuration,
  semitoneOffsetToRate,
} = require('../../../src/renderer/domain/speechPlayback');

test('semitoneOffsetToRate maps an octave to a doubled rate', () => {
  assert.equal(semitoneOffsetToRate(0), 1);
  assert.equal(semitoneOffsetToRate(12), 2);
  assert.equal(semitoneOffsetToRate(-12), 0.5);
});

test('short clips never start a skip burst', () => {
  assert.equal(getSpeechBurstProfile(0.2, false, null).shouldStart, false);
});

test('a skip frequency of zero disables cutting', () => {
  const character = {
    skipFrequency: 0,
  };
  assert.equal(getSpeechBurstProfile(1, false, character).shouldStart, false);
  assert.equal(getSpeechCutTargetDuration(1, false, null, character), 1);
});

test('cut target duration stays within the clip', () => {
  for (let i = 0; i < 200; i += 1) {
    const duration = getSpeechCutTargetDuration(0.8, i % 2 === 0, null, null);
    assert.ok(duration > 0 && duration <= 0.8, `unexpected duration ${duration}`);
  }
});

test('playback config applies pitch and fast forward', () => {
  const character = {
    basePitchTones: 6,
    hasVariablePitch: false,
    canStretch: true,
  };
  const config = getCharacterPlaybackConfig(1, character, 0.5, true);
  assert.equal(config.basePlaybackRate, 2);
  assert.equal(config.playbackRate, 2 * FAST_FORWARD_AUDIO_RATE);
  assert.equal(config.sourceDuration, 0.5);
});

test('non-stretchable voices consume more source audio at higher pitch', () => {
  const config = getCharacterPlaybackConfig(1, {
    basePitchTones: 6,
    canStretch: false,
  }, 0.25, false);
  assert.equal(config.sourceDuration, 0.5);
});
