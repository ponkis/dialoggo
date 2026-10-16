const MAX_AUDIO_CACHE_ENTRIES = 18;
const MAX_AUDIO_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Web Audio playback for interface sounds and voice clips. Clips are fetched
 * from the app's asset protocol, decoded once, and kept in a small LRU cache.
 */
function createAudioService({
  uiSounds = {},
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const audioBufferCache = new Map();
  let audioCtx = null;
  let audioUnlockBound = false;
  let audioResumePromise = null;

  function getAudioContextClass() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = getAudioContextClass();
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not available in this Electron runtime.');
      }

      audioCtx = new AudioContextClass();
    }

    return audioCtx;
  }

  /** Returns the audio context only if it has already been created. */
  function peekAudioContext() {
    return audioCtx;
  }

  async function ensureAudioContextRunning() {
    const ctx = getAudioContext();
    if (ctx.state === 'running') return ctx;
    if (audioResumePromise) return audioResumePromise;

    audioResumePromise = ctx.resume()
      .catch(() => ctx)
      .then(() => {
        audioResumePromise = null;
        return ctx;
      });

    return audioResumePromise;
  }

  function bindAudioUnlockListeners() {
    if (audioUnlockBound || typeof window === 'undefined') return;

    audioUnlockBound = true;
    const unlock = () => {
      void ensureAudioContextRunning();
    };

    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, unlock, {
        once: true,
        passive: true,
      });
    });
  }

  function rememberAudioBuffer(url, audioBuffer) {
    if (audioBufferCache.has(url)) {
      audioBufferCache.delete(url);
    }

    audioBufferCache.set(url, audioBuffer);

    while (audioBufferCache.size > MAX_AUDIO_CACHE_ENTRIES) {
      const oldestKey = audioBufferCache.keys().next().value;
      if (!oldestKey) break;
      audioBufferCache.delete(oldestKey);
    }
  }

  async function fetchAudioData(url) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Audio asset request failed (${response.status}): ${url}`);
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_FILE_BYTES) {
      throw new Error(`Audio asset exceeds the ${MAX_AUDIO_FILE_BYTES}-byte limit: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_AUDIO_FILE_BYTES) {
      throw new Error(`Audio asset exceeds the ${MAX_AUDIO_FILE_BYTES}-byte limit: ${url}`);
    }

    return arrayBuffer;
  }

  async function loadAudioBuffer(url) {
    if (audioBufferCache.has(url)) {
      const cachedBuffer = audioBufferCache.get(url);
      rememberAudioBuffer(url, cachedBuffer);
      return cachedBuffer;
    }

    const ctx = getAudioContext();
    const arrayBuffer = await fetchAudioData(url);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    rememberAudioBuffer(url, audioBuffer);
    return audioBuffer;
  }

  function playAudioBuffer(audioBuffer, options = {}) {
    const {
      playbackRate = 1,
      offset = 0,
      duration = Math.max(0, audioBuffer.duration - offset),
      volume = 1,
      fadeInMs = 0,
      fadeOutMs = 0,
    } = options;

    const ctx = getAudioContext();
    if (ctx.state !== 'running') {
      void ensureAudioContextRunning();
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;

    const gainNode = ctx.createGain();
    const targetGain = Math.max(0, volume);
    gainNode.gain.value = targetGain;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, audioBuffer.duration - 0.001)));
    const remaining = Math.max(0.001, audioBuffer.duration - safeOffset);
    const sliceDuration = Math.max(0.001, Math.min(duration, remaining));
    const now = ctx.currentTime;
    const actualDuration = sliceDuration / playbackRate;
    const fadeInSec = Math.max(0, Math.min(fadeInMs / 1000, actualDuration * 0.4));
    const fadeOutSec = Math.max(0, Math.min(fadeOutMs / 1000, actualDuration * 0.45));

    if (fadeInSec > 0 || fadeOutSec > 0) {
      gainNode.gain.setValueAtTime(0.001, now);

      if (fadeInSec > 0) {
        gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeInSec);
      } else {
        gainNode.gain.setValueAtTime(targetGain, now);
      }

      const fadeOutStart = Math.max(now + fadeInSec, now + actualDuration - fadeOutSec);
      gainNode.gain.setValueAtTime(targetGain, fadeOutStart);

      if (fadeOutSec > 0) {
        gainNode.gain.linearRampToValueAtTime(0.001, now + actualDuration);
      }
    }

    source.start(0, safeOffset, sliceDuration);
    return {
      source,
      gainNode,
      duration: actualDuration,
    };
  }

  async function playSoundFile(url) {
    const buffer = await loadAudioBuffer(url);
    const {
      source,
      duration,
    } = playAudioBuffer(buffer);

    return new Promise((resolve) => {
      source.onended = () => resolve(duration);
      setTimeout(() => resolve(duration), duration * 1000 + 100);
    });
  }

  function getUiSoundUrl(key) {
    return uiSounds[key] || null;
  }

  function playMenuSound(key) {
    const url = getUiSoundUrl(key);
    if (!url) return;

    loadAudioBuffer(url)
      .then((buffer) => playAudioBuffer(buffer))
      .catch(() => { });
  }

  function getMenuSoundVolumeGain() {
    return 1;
  }

  bindAudioUnlockListeners();

  return {
    getAudioContext,
    getMenuSoundVolumeGain,
    getUiSoundUrl,
    loadAudioBuffer,
    peekAudioContext,
    playAudioBuffer,
    playMenuSound,
    playSoundFile,
  };
}

module.exports = {
  MAX_AUDIO_FILE_BYTES,
  createAudioService,
};
