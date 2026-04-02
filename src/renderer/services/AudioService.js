function createAudioService(model) {
  const {
    env,
    constants
  } = model;
  const MAX_AUDIO_CACHE_ENTRIES = 18;
  const MAX_AUDIO_FILE_BYTES = 8 * 1024 * 1024;
  const audioBufferCache = new Map();
  let audioCtx = null;
  let audioUnlockBound = false;
  let audioResumePromise = null;

  const menuSoundPaths = {
    click: env.path.join(env.sndDir, 'gui', '1.wav'),
    select: env.path.join(env.sndDir, 'gui', '2.wav'),
    arrowRight: env.path.join(env.sndDir, 'gui', '3.wav'),
    arrowLeft: env.path.join(env.sndDir, 'gui', '4.wav'),
    forbidden: env.path.join(env.sndDir, 'gui', '5.wav'),
    settingsOpen: env.path.join(env.sndDir, 'gui', '3.wav'),
    settingsClose: env.path.join(env.sndDir, 'gui', '4.wav'),
    favoriteAdd: env.path.join(env.sndDir, 'gui', '10.wav'),
    favoriteRemove: env.path.join(env.sndDir, 'gui', '9.wav'),
  };

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

  function rememberAudioBuffer(filePath, audioBuffer) {
    if (audioBufferCache.has(filePath)) {
      audioBufferCache.delete(filePath);
    }

    audioBufferCache.set(filePath, audioBuffer);

    while (audioBufferCache.size > MAX_AUDIO_CACHE_ENTRIES) {
      const oldestKey = audioBufferCache.keys().next().value;
      if (!oldestKey) break;
      audioBufferCache.delete(oldestKey);
    }
  }

  async function loadAudioBuffer(filePath) {
    if (audioBufferCache.has(filePath)) {
      const cachedBuffer = audioBufferCache.get(filePath);
      rememberAudioBuffer(filePath, cachedBuffer);
      return cachedBuffer;
    }

    const ctx = getAudioContext();
    const arrayBuffer = env.fs.readBinaryFile(filePath, {
      maxBytes: MAX_AUDIO_FILE_BYTES,
    });
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    rememberAudioBuffer(filePath, audioBuffer);
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

  async function playSoundFile(filePath) {
    const buffer = await loadAudioBuffer(filePath);
    const {
      source,
      duration
    } = playAudioBuffer(buffer);

    return new Promise((resolve) => {
      source.onended = () => resolve(duration);
      setTimeout(() => resolve(duration), duration * 1000 + 100);
    });
  }

  function playMenuSound(key) {
    const filePath = menuSoundPaths[key];
    if (!filePath || !env.fs.existsSync(filePath)) return;

    loadAudioBuffer(filePath)
      .then((buffer) => playAudioBuffer(buffer))
      .catch(() => { });
  }

  function getMenuSoundVolumeGain() {
    return 1;
  }

  bindAudioUnlockListeners();

  class SpeechSoundLoop {
    constructor(spriteRenderer) {
      this.spriteRenderer = spriteRenderer;
      this.sounds = [];
      this.character = null;
      this.running = false;
      this.paused = false;
      this.fastForward = false;
      this.currentBasePlaybackRate = 1;
      this.currentSource = null;
      this.currentGainNode = null;
      this._loopPromise = null;
      this._abortController = null;
      this._clipResolve = null;
      this._burstClipsRemaining = 0;
      this._burstStrength = 0;
      this._burstCooldownClips = 0;
      this._burstPendingCooldownClips = 0;
    }

    start(soundFiles, character = null) {
      this.stop();
      this.sounds = soundFiles;
      this.character = character;
      this.running = true;
      this.paused = false;
      this._resetBurstCadence();
      this._abortController = new AbortController();
      this._loopPromise = this._loop();
    }

    pause() {
      this.paused = true;
    }

    resume() {
      this.paused = false;
    }

    setFastForward(enabled) {
      this.fastForward = enabled;
      if (!this.currentSource || !audioCtx) return;

      try {
        this.currentSource.playbackRate.setTargetAtTime(
          this.currentBasePlaybackRate * (enabled ? constants.FAST_FORWARD_AUDIO_RATE : 1),
          audioCtx.currentTime,
          0.02,
        );
      } catch { }
    }

    stop() {
      this.running = false;
      this.paused = false;
      this.currentBasePlaybackRate = 1;
      this._resetBurstCadence();
      this._killCurrentAudio();
      this._resolveWait();

      if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
      }
    }

    async gracefulStop() {
      this.running = false;
      this.paused = false;
      this._resetBurstCadence();
      this._killCurrentAudio();
      this._resolveWait();

      if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
      }

      await this.spriteRenderer.smoothCloseAndIdle();
    }

    _killCurrentAudio() {
      if (!this.currentSource) return;

      if (this.currentGainNode && audioCtx) {
        try {
          const gainNode = this.currentGainNode;
          gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

          const source = this.currentSource;
          setTimeout(() => {
            try {
              source.stop();
            } catch { }
          }, 60);
        } catch { }
      } else {
        try {
          this.currentSource.stop();
        } catch { }
      }

      this.currentSource = null;
      this.currentGainNode = null;
    }

    _resolveWait() {
      if (!this._clipResolve) return;
      this._clipResolve();
      this._clipResolve = null;
    }

    _resetBurstCadence() {
      this._burstClipsRemaining = 0;
      this._burstStrength = 0;
      this._burstCooldownClips = 0;
      this._burstPendingCooldownClips = 0;
    }

    _getSpeechCadence(bufferDuration) {
      if (this._burstClipsRemaining > 0) {
        const burstStrength = this._burstStrength;
        this._burstClipsRemaining = Math.max(0, this._burstClipsRemaining - 1);

        if (this._burstClipsRemaining === 0) {
          this._burstStrength = 0;
          this._burstCooldownClips = this._burstPendingCooldownClips;
          this._burstPendingCooldownClips = 0;
        }

        return {
          burstStrength,
        };
      }

      if (this._burstCooldownClips > 0) {
        this._burstCooldownClips = Math.max(0, this._burstCooldownClips - 1);
        return null;
      }

      const burstProfile = model.getSpeechBurstProfile(bufferDuration, this.fastForward, this.character);
      if (!burstProfile.shouldStart) return null;

      this._burstClipsRemaining = burstProfile.clipCount;
      this._burstStrength = burstProfile.burstStrength;
      this._burstPendingCooldownClips = burstProfile.cooldownClips;

      return this._getSpeechCadence(bufferDuration);
    }

    async _loop() {
      while (this.running) {
        if (this.paused) {
          await model.sleep(50);
          continue;
        }

        if (this.sounds.length === 0) {
          await model.sleep(50);
          continue;
        }

        const soundFile = model.pick(this.sounds);

        try {
          const buffer = await loadAudioBuffer(soundFile);
          if (!this.running) break;
          if (this.paused) continue;

          const cadence = this._getSpeechCadence(buffer.duration);
          const targetDuration = model.getSpeechCutTargetDuration(
            buffer.duration,
            this.fastForward,
            cadence,
            this.character,
          );
          const playbackConfig = model.getCharacterPlaybackConfig(
            buffer.duration,
            this.character,
            targetDuration,
            this.fastForward,
          );

          this.currentBasePlaybackRate = playbackConfig.basePlaybackRate;

          const {
            source,
            gainNode,
            duration
          } = playAudioBuffer(buffer, {
            playbackRate: playbackConfig.playbackRate,
            offset: 0,
            duration: playbackConfig.sourceDuration,
            fadeInMs: 12,
            fadeOutMs: this.fastForward ? 32 : 44,
          });

          this.currentSource = source;
          this.currentGainNode = gainNode;

          const durationMs = duration * 1000;
          this.spriteRenderer.startSpeaking(durationMs);

          await new Promise((resolve) => {
            this._clipResolve = resolve;
            source.onended = resolve;
            setTimeout(resolve, durationMs + 50);
          });

          this._clipResolve = null;

          if (!this.running) break;

          this.currentSource = null;
          this.currentGainNode = null;
          this.currentBasePlaybackRate = 1;
        } catch {
          this._clipResolve = null;
          this.currentSource = null;
          this.currentGainNode = null;
          this.currentBasePlaybackRate = 1;

          if (!this.running) break;
        }
      }
    }
  }

  return {
    getAudioContext,
    loadAudioBuffer,
    playAudioBuffer,
    playSoundFile,
    playMenuSound,
    getMenuSoundVolumeGain,
    createSpeechLoop(spriteRenderer) {
      return new SpeechSoundLoop(spriteRenderer);
    },
  };
}

module.exports = {
  createAudioService
};
