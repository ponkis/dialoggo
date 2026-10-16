/**
 * Draws the selected character on the preview canvas: an idle blink loop,
 * mouth movement sized to each voice clip, and the optional N64 pixelation.
 */
class SpriteRenderer {
  constructor({
    canvas,
    state,
    constants,
    images,
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.constants = constants;
    this.images = images;
    this.frameIndex = 0;
    this.mode = 'idle';
    this.idleFrames = [];
    this.speakFrames = [];
    this.frameImages = new Map();
    this.idleTimer = null;
    this.idleStartTimeout = null;
    this.idleBlinkHoldMin = 1800;
    this.idleBlinkHoldMax = 4200;
    this.idleBlinkFrameDelay = 75;
    this.speakTimer = null;
    this.smoothCloseResolver = null;
    this.sourceCanvas = null;
    this.pixelScratchCanvas = null;
  }

  async loadCharacter(character) {
    this.stop();
    this.idleFrames = character.idleFrames;
    this.speakFrames = character.speakFrames;

    const allFrames = [...this.idleFrames, ...this.speakFrames];
    const loadedFrames = await Promise.all(allFrames.map((frame) => this.images.load(frame)));
    this.frameImages.clear();
    allFrames.forEach((frame, index) => {
      this.frameImages.set(frame, loadedFrames[index]);
    });

    this.frameIndex = 0;
    this.mode = 'idle';
    this.showFrame(this.idleFrames, 0);
  }

  getPixelScratchCanvas(width, height) {
    if (!this.pixelScratchCanvas) this.pixelScratchCanvas = document.createElement('canvas');
    if (this.pixelScratchCanvas.width !== width || this.pixelScratchCanvas.height !== height) {
      this.pixelScratchCanvas.width = width;
      this.pixelScratchCanvas.height = height;
    }
    return this.pixelScratchCanvas;
  }

  showFrame(framesArray, frameIdx) {
    if (!framesArray?.[frameIdx]) return;
    const image = this.frameImages.get(framesArray[frameIdx]);
    if (!image) return;

    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    if (!this.sourceCanvas) {
      this.sourceCanvas = document.createElement('canvas');
      this.sourceCanvas.width = canvasWidth;
      this.sourceCanvas.height = canvasHeight;
    }

    const sourceCtx = this.sourceCanvas.getContext('2d');
    sourceCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    const scale = Math.min(canvasWidth / image.width, canvasHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = (canvasHeight - drawHeight) / 2;

    sourceCtx.imageSmoothingEnabled = false;
    sourceCtx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    if (this.state.n64ModeEnabled) {
      const blockSize = this.constants.N64_CANVAS_PIXEL_BLOCK;
      const sampleWidth = Math.max(1, Math.floor(canvasWidth / blockSize));
      const sampleHeight = Math.max(1, Math.floor(canvasHeight / blockSize));
      const scratchCanvas = this.getPixelScratchCanvas(sampleWidth, sampleHeight);
      const scratchCtx = scratchCanvas.getContext('2d');

      scratchCtx.imageSmoothingEnabled = false;
      scratchCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      scratchCtx.drawImage(this.sourceCanvas, 0, 0, sampleWidth, sampleHeight);

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratchCanvas, 0, 0, sampleWidth, sampleHeight, 0, 0, canvasWidth, canvasHeight);
      return;
    }

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.sourceCanvas, 0, 0);
  }

  /** Repaints the current frame, e.g. after the N64 display mode changes. */
  redraw() {
    if (!this.idleFrames?.length && !this.speakFrames?.length) return;

    if (this.mode === 'speaking') {
      this.showFrame(this.speakFrames, this.frameIndex);
      return;
    }

    if (this.mode === 'idle') {
      this.showFrame(this.idleFrames, this.frameIndex);
    }
  }

  /** Shows the first speaking frame, ready for a dialogue line to start. */
  showSpeakingStart() {
    this.stop();
    this.frameIndex = 0;
    this.showFrame(this.speakFrames, 0);
  }

  startIdle() {
    this.stop();
    this.mode = 'idle';
    this.frameIndex = 0;
    this.showFrame(this.idleFrames, 0);
    if (!this.idleFrames.length) return;

    const lastFrame = Math.max(0, this.idleFrames.length - 1);

    const playBlinkCycle = () => {
      let index = 1;
      let direction = 1;

      const step = () => {
        if (this.mode !== 'idle') return;

        this.frameIndex = index;
        this.showFrame(this.idleFrames, index);
        if (index >= lastFrame) direction = -1;
        index += direction;

        if (index <= 0) {
          this.frameIndex = 0;
          this.showFrame(this.idleFrames, 0);
          scheduleNextBlink();
          return;
        }

        this.idleTimer = setTimeout(step, this.idleBlinkFrameDelay);
      };

      this.idleTimer = setTimeout(step, this.idleBlinkFrameDelay);
    };

    const scheduleNextBlink = () => {
      const hold = this.idleBlinkHoldMin + Math.floor(Math.random() * (this.idleBlinkHoldMax - this.idleBlinkHoldMin + 1));
      this.idleTimer = setTimeout(playBlinkCycle, hold);
    };

    scheduleNextBlink();
  }

  startIdleAfterDelay(delayMs) {
    this.clearIdleStartTimeout();
    this.idleStartTimeout = setTimeout(() => {
      this.idleStartTimeout = null;
      this.startIdle();
    }, delayMs);
  }

  clearIdleStartTimeout() {
    if (!this.idleStartTimeout) return;
    clearTimeout(this.idleStartTimeout);
    this.idleStartTimeout = null;
  }

  stopIdleState() {
    this.clearIdleStartTimeout();
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  startSpeaking(audioDurationMs) {
    this.stopSpeaking();

    let currentFrame = this.mode === 'speaking' ? this.frameIndex : 0;
    this.mode = 'speaking';

    let maxFrame = 5;
    if (audioDurationMs < 80) maxFrame = 1;
    else if (audioDurationMs < 150) maxFrame = 2;
    else if (audioDurationMs < 250) maxFrame = 3;
    else if (audioDurationMs < 400) maxFrame = 4;

    const totalFrames = maxFrame + 1;
    const openTime = Math.min(audioDurationMs * 0.6, audioDurationMs);
    const frameTime = Math.max(openTime / totalFrames, 35);
    let opening = currentFrame < maxFrame;

    this.showFrame(this.speakFrames, currentFrame);

    const getSpeedMultiplier = () => (
      this.state.isFastForwarding ? this.constants.FAST_FORWARD_SPRITE_MULTIPLIER : 1
    );

    const step = () => {
      if (this.mode !== 'speaking') return;

      if (opening) {
        currentFrame += 1;
        if (currentFrame >= maxFrame) {
          currentFrame = maxFrame;
          opening = false;
        }
      } else {
        currentFrame -= 1;
        if (currentFrame <= 0) {
          currentFrame = 0;
          this.speakTimer = null;
          this.frameIndex = currentFrame;
          this.showFrame(this.speakFrames, currentFrame);
          return;
        }
      }

      this.frameIndex = currentFrame;
      this.showFrame(this.speakFrames, currentFrame);

      const delay = Math.max(frameTime / getSpeedMultiplier(), 24);
      this.speakTimer = setTimeout(step, delay);
    };

    const initialDelay = Math.max(frameTime / getSpeedMultiplier(), 24);
    this.speakTimer = setTimeout(step, initialDelay);
  }

  resetToIdle() {
    this.stopSpeaking();
    this.mode = 'idle';

    if (this.frameIndex > 0) {
      let currentFrame = this.frameIndex;
      this.speakTimer = setInterval(() => {
        currentFrame -= 1;
        if (currentFrame <= 0) {
          currentFrame = 0;
          clearInterval(this.speakTimer);
          this.speakTimer = null;
        }
        this.frameIndex = currentFrame;
        this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, currentFrame);
      }, 30);
      return;
    }

    this.frameIndex = 0;
    this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
  }

  smoothCloseAndIdle() {
    const transitionFrames = this.mode === 'speaking' && this.speakFrames.length ?
      this.speakFrames :
      (this.idleFrames.length ? this.idleFrames : this.speakFrames);
    const finalFrames = this.idleFrames.length ? this.idleFrames : transitionFrames;

    this.stopSpeaking();
    this.stopIdleState();
    this.mode = 'idle';

    return new Promise((resolve) => {
      this.smoothCloseResolver = resolve;

      const finalizeClose = () => {
        this.frameIndex = 0;
        this.showFrame(finalFrames, 0);
        this.resolvePendingSmoothClose();
      };

      if (this.frameIndex > 0 && transitionFrames.length > 0) {
        let currentFrame = Math.min(this.frameIndex, transitionFrames.length - 1);
        this.speakTimer = setInterval(() => {
          currentFrame -= 1;
          if (currentFrame <= 0) {
            currentFrame = 0;
            clearInterval(this.speakTimer);
            this.speakTimer = null;
            finalizeClose();
            return;
          }

          this.frameIndex = currentFrame;
          this.showFrame(transitionFrames, currentFrame);
        }, 30);
        return;
      }

      finalizeClose();
    });
  }

  resolvePendingSmoothClose() {
    if (!this.smoothCloseResolver) return;
    const resolve = this.smoothCloseResolver;
    this.smoothCloseResolver = null;
    resolve();
  }

  stopSpeaking() {
    if (this.speakTimer) {
      clearInterval(this.speakTimer);
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
    this.resolvePendingSmoothClose();
  }

  stop() {
    this.stopSpeaking();
    this.clearIdleStartTimeout();
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

module.exports = {
  SpriteRenderer,
};
