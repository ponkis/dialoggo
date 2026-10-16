const {
  pick,
  sleep,
} = require('../core/timing');
const {
  FAST_FORWARD_AUDIO_RATE,
  getCharacterPlaybackConfig,
  getSpeechBurstProfile,
  getSpeechCutTargetDuration,
} = require('../domain/speechPlayback');

/**
 * Loops a character's voice clips while dialogue is typing, cutting and
 * pitching each clip per the character's sound config and driving the sprite
 * renderer's mouth animation for every clip it plays.
 */
class SpeechSoundLoop {
  constructor({
    audioService,
    spriteRenderer,
  }) {
    this.audioService = audioService;
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

  start(soundUrls, character = null) {
    this.stop();
    this.sounds = soundUrls;
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
    const audioCtx = this.audioService.peekAudioContext();
    if (!this.currentSource || !audioCtx) return;

    try {
      this.currentSource.playbackRate.setTargetAtTime(
        this.currentBasePlaybackRate * (enabled ? FAST_FORWARD_AUDIO_RATE : 1),
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
    this.killCurrentAudio();
    this._resolveWait();

    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /** Fades out and stops the clip that is currently playing, if any. */
  killCurrentAudio() {
    if (!this.currentSource) return;

    const audioCtx = this.audioService.peekAudioContext();
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

    const burstProfile = getSpeechBurstProfile(bufferDuration, this.fastForward, this.character);
    if (!burstProfile.shouldStart) return null;

    this._burstClipsRemaining = burstProfile.clipCount;
    this._burstStrength = burstProfile.burstStrength;
    this._burstPendingCooldownClips = burstProfile.cooldownClips;

    return this._getSpeechCadence(bufferDuration);
  }

  async _loop() {
    while (this.running) {
      if (this.paused) {
        await sleep(50);
        continue;
      }

      if (this.sounds.length === 0) {
        await sleep(50);
        continue;
      }

      const soundUrl = pick(this.sounds);

      try {
        const buffer = await this.audioService.loadAudioBuffer(soundUrl);
        if (!this.running) break;
        if (this.paused) continue;

        const cadence = this._getSpeechCadence(buffer.duration);
        const targetDuration = getSpeechCutTargetDuration(
          buffer.duration,
          this.fastForward,
          cadence,
          this.character,
        );
        const playbackConfig = getCharacterPlaybackConfig(
          buffer.duration,
          this.character,
          targetDuration,
          this.fastForward,
        );

        this.currentBasePlaybackRate = playbackConfig.basePlaybackRate;

        const {
          source,
          gainNode,
          duration,
        } = this.audioService.playAudioBuffer(buffer, {
          playbackRate: playbackConfig.playbackRate,
          offset: 0,
          duration: playbackConfig.sourceDuration,
          fadeInMs: 12,
          fadeOutMs: this.fastForward ? 16 : 22,
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

module.exports = {
  SpeechSoundLoop,
};
