function createAppView(model, audioService) {
  const {
    env,
    state,
    characters,
    constants
  } = model;

  const refs = {
    charGrid: document.getElementById('character-grid'),
    characterSearchInput: document.getElementById('character-search-input'),
    characterSearchClear: document.getElementById('character-search-clear'),
    characterSearchEmpty: document.getElementById('character-search-empty'),
    input: document.getElementById('dialogue-input'),
    dialogueInputHighlight: document.getElementById('dialogue-input-highlight'),
    dialogueInputCounter: document.getElementById('dialogue-input-counter'),
    btnPlay: document.getElementById('btn-play'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),
    btnFastForward: document.getElementById('btn-fastforward'),
    app: document.querySelector('.app'),
    previewArea: document.getElementById('preview-area'),
    panelWrapper: document.querySelector('.panel-wrapper'),
    bottombar: document.querySelector('.bottombar'),
    placeholder: document.getElementById('preview-placeholder'),
    placeholderAnim: document.getElementById('placeholder-anim'),
    startupOverlay: document.getElementById('startup-overlay'),
    startupLoadingAnim: document.getElementById('startup-loading-anim'),
    startupIntroCanvas: document.getElementById('startup-intro-canvas'),
    dialogueContainer: document.getElementById('dialogue-container'),
    dialogueBox: document.getElementById('dialogue-box'),
    dialogueTextArea: document.getElementById('dialogue-text-area'),
    dialogueText: document.getElementById('dialogue-text'),
    dialogueTextN64Canvas: document.getElementById('dialogue-text-n64-canvas'),
    spriteCanvas: document.getElementById('sprite-canvas'),
    statusDot: document.getElementById('status-dot'),
    charCount: document.getElementById('char-count'),
    versionLabel: document.getElementById('version-label'),
    reelLeft: document.getElementById('reel-arrow-left'),
    reelRight: document.getElementById('reel-arrow-right'),
    controlsPanel: document.getElementById('controls-panel'),
    settingsPanel: document.getElementById('settings-panel'),
    backgroundsPanel: document.getElementById('backgrounds-panel'),
    flipCard: document.getElementById('flip-card'),
    sleeveCamera: document.getElementById('sleeve-tab-camera'),
    sleeveBackgrounds: document.getElementById('sleeve-tab-backgrounds'),
    sleeveGuide: document.getElementById('sleeve-tab-guide'),
    sleeveCharacter: document.getElementById('sleeve-tab-character'),
    sleeveSettings: document.getElementById('sleeve-tab-settings'),
    inputMirrored: document.getElementById('input-mirrored-dialogue'),
    menuSoundsVolumeInputs: Array.from(document.querySelectorAll('input[name="menu-sounds-volume"]')),
    inputN64: document.getElementById('input-n64-mode'),
    inputHideBroken: document.getElementById('input-hide-broken-chars'),
  };

  let n64PixelScratch = null;
  let n64DialogueTextHi = null;
  let n64DialogueTextSmall = null;
  let n64TextResizeRaf = 0;
  let n64ShakeAnimationRaf = 0;
  const DIALOGUE_SHAKE_CYCLE_MS = 280;

  const MAX_SPRITE_IMAGE_CACHE_ENTRIES = 120;
  const spriteImageCache = new Map();
  const cardAnimState = new Map();
  let flipCardAnimation = null;
  const dialogueShakeSamples = [
    { x: 0, y: 0 },
    { x: -3.1, y: -2.3 },
    { x: 3.8, y: 1.8 },
    { x: -2.4, y: 3.4 },
    { x: 3.1, y: -2.8 },
    { x: -3.6, y: 1.5 },
    { x: 2.1, y: 3.7 },
    { x: 3.3, y: -3.2 },
    { x: -2.5, y: -1.5 },
  ];

  function getDialogueShakeSample(elapsed, index, scale = 1) {
    const sampleDuration = DIALOGUE_SHAKE_CYCLE_MS / dialogueShakeSamples.length;
    const sampleIndex = Math.floor((elapsed + (index * sampleDuration)) / sampleDuration) % dialogueShakeSamples.length;
    const sample = dialogueShakeSamples[sampleIndex < 0 ? sampleIndex + dialogueShakeSamples.length : sampleIndex];
    return {
      x: sample.x * scale,
      y: sample.y * scale,
    };
  }

  function rememberSpriteImage(filePath, image) {
    if (spriteImageCache.has(filePath)) {
      spriteImageCache.delete(filePath);
    }

    spriteImageCache.set(filePath, image);

    while (spriteImageCache.size > MAX_SPRITE_IMAGE_CACHE_ENTRIES) {
      const oldestKey = spriteImageCache.keys().next().value;
      if (!oldestKey) break;
      spriteImageCache.delete(oldestKey);
    }
  }

  function fileToSrc(filePath) {
    return env.fs.toFileUrl(filePath);
  }

  function loadSpriteImage(filePath) {
    return new Promise((resolve, reject) => {
      if (spriteImageCache.has(filePath)) {
        const cachedImage = spriteImageCache.get(filePath);
        rememberSpriteImage(filePath, cachedImage);
        resolve(cachedImage);
        return;
      }

      const image = new Image();
      image.onload = () => {
        rememberSpriteImage(filePath, image);
        resolve(image);
      };
      image.onerror = reject;
      image.src = fileToSrc(filePath);
    });
  }

  function collectFilesRecursive(rootDir, extensions) {
    if (!env.fs.existsSync(rootDir)) return [];

    const collected = [];
    const walk = (directory) => {
      env.fs.readdirSync(directory, {
        withFileTypes: true
      }).forEach((entry) => {
        const fullPath = env.path.join(directory, entry.name);

        if (entry.isDirectory === true) {
          walk(fullPath);
          return;
        }

        if (!extensions || extensions.has(env.path.extname(entry.name).toLowerCase())) {
          collected.push(fullPath);
        }
      });
    };

    walk(rootDir);
    return collected;
  }

  function getN64PixelScratchCanvas(sw, sh) {
    if (!n64PixelScratch) n64PixelScratch = document.createElement('canvas');
    if (n64PixelScratch.width !== sw || n64PixelScratch.height !== sh) {
      n64PixelScratch.width = sw;
      n64PixelScratch.height = sh;
    }
    return n64PixelScratch;
  }

  class SpriteRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
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
      this.sourceCanvas = null;
    }

    async loadCharacter(character) {
      this.stop();
      this.idleFrames = character.idleFrames;
      this.speakFrames = character.speakFrames;

      const allFrames = [...this.idleFrames, ...this.speakFrames];
      const loadedFrames = await Promise.all(allFrames.map((frame) => loadSpriteImage(frame)));
      this.frameImages.clear();
      allFrames.forEach((frame, index) => {
        this.frameImages.set(frame, loadedFrames[index]);
      });

      this.frameIndex = 0;
      this.mode = 'idle';
      this.showFrame(this.idleFrames, 0);
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

      if (state.n64ModeEnabled) {
        const blockSize = constants.N64_CANVAS_PIXEL_BLOCK;
        const sampleWidth = Math.max(1, Math.floor(canvasWidth / blockSize));
        const sampleHeight = Math.max(1, Math.floor(canvasHeight / blockSize));
        const scratchCanvas = getN64PixelScratchCanvas(sampleWidth, sampleHeight);
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

        const speedMultiplier = state.isFastForwarding ? constants.FAST_FORWARD_SPRITE_MULTIPLIER : 1;
        const delay = Math.max(frameTime / speedMultiplier, 24);
        this.speakTimer = setTimeout(step, delay);
      };

      const speedMultiplier = state.isFastForwarding ? constants.FAST_FORWARD_SPRITE_MULTIPLIER : 1;
      const initialDelay = Math.max(frameTime / speedMultiplier, 24);
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
      this.stopSpeaking();
      this.mode = 'idle';

      return new Promise((resolve) => {
        if (this.frameIndex > 0) {
          let currentFrame = this.frameIndex;
          this.speakTimer = setInterval(() => {
            currentFrame -= 1;
            if (currentFrame <= 0) {
              currentFrame = 0;
              clearInterval(this.speakTimer);
              this.speakTimer = null;
              this.frameIndex = 0;
              this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
              resolve();
              return;
            }

            this.frameIndex = currentFrame;
            this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, currentFrame);
          }, 30);
          return;
        }

        this.frameIndex = 0;
        this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
        resolve();
      });
    }

    stopSpeaking() {
      if (!this.speakTimer) return;
      clearInterval(this.speakTimer);
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }

    stop() {
      this.stopSpeaking();
      this.clearIdleStartTimeout();
      if (!this.idleTimer) return;
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  const spriteRenderer = new SpriteRenderer(refs.spriteCanvas);

  function setActionButtonBlocked(element, blocked) {
    if (!element) return;
    element.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }

  function isActionButtonBlocked(element) {
    return !!element && element.getAttribute('aria-disabled') === 'true';
  }

  function getN64DialogueTextHiCanvas(width, height) {
    if (!n64DialogueTextHi || n64DialogueTextHi.width !== width || n64DialogueTextHi.height !== height) {
      n64DialogueTextHi = document.createElement('canvas');
      n64DialogueTextHi.width = width;
      n64DialogueTextHi.height = height;
    }
    return n64DialogueTextHi;
  }

  function getN64DialogueTextSmallCanvas(width, height) {
    if (!n64DialogueTextSmall || n64DialogueTextSmall.width !== width || n64DialogueTextSmall.height !== height) {
      n64DialogueTextSmall = document.createElement('canvas');
      n64DialogueTextSmall.width = width;
      n64DialogueTextSmall.height = height;
    }
    return n64DialogueTextSmall;
  }

  function parseTranslateYpx(transformValue) {
    if (!transformValue || transformValue === 'none') return 0;
    const match = transformValue.match(/translateY\((-?[0-9.]+)px\)/);
    return match ? parseFloat(match[1], 10) : 0;
  }

  function getScrollWrapperTranslateYpx(scrollWrapper) {
    if (!scrollWrapper) return 0;

    const transformValue = getComputedStyle(scrollWrapper).transform;
    if (!transformValue || transformValue === 'none') {
      return parseTranslateYpx(scrollWrapper.style.transform);
    }

    const matrixMatch = transformValue.match(/^matrix\(([^)]+)\)$/);
    if (matrixMatch) {
      const values = matrixMatch[1].split(',').map((value) => parseFloat(value.trim()));
      if (values.length >= 6 && Number.isFinite(values[5])) return values[5];
    }

    const matrix3dMatch = transformValue.match(/^matrix3d\(([^)]+)\)$/);
    if (matrix3dMatch) {
      const values = matrix3dMatch[1].split(',').map((value) => parseFloat(value.trim()));
      if (values.length >= 16 && Number.isFinite(values[13])) return values[13];
    }

    return parseTranslateYpx(scrollWrapper.style.transform);
  }

  async function n64RepaintDuringScrollTransition(scrollWrapper, durationMs = 350) {
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      renderN64DialogueTextCanvas();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    renderN64DialogueTextCanvas();
  }

  function clearN64DialogueTextCanvas() {
    stopN64ShakeLoop();
    const canvas = refs.dialogueTextN64Canvas;
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width > 0 && canvas.height > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function stopN64ShakeLoop() {
    if (!n64ShakeAnimationRaf) return;
    cancelAnimationFrame(n64ShakeAnimationRaf);
    n64ShakeAnimationRaf = 0;
  }

  function syncN64ShakeLoop() {
    const needsLoop = state.n64ModeEnabled && !!refs.dialogueText?.querySelector('.dialogue-char-shake');
    if (!needsLoop) {
      stopN64ShakeLoop();
      return;
    }

    if (n64ShakeAnimationRaf) return;

    const tick = () => {
      n64ShakeAnimationRaf = requestAnimationFrame(tick);
      renderN64DialogueTextCanvas();
    };

    n64ShakeAnimationRaf = requestAnimationFrame(tick);
  }

  function renderN64DialogueTextCanvas() {
    try {
      const canvas = refs.dialogueTextN64Canvas;
      const area = refs.dialogueTextArea;
      if (!state.n64ModeEnabled || !canvas || !area || !refs.dialogueText) {
        stopN64ShakeLoop();
        return;
      }

      const scrollWrapper = refs.dialogueText.querySelector('.dialogue-scroll');
      if (!scrollWrapper) {
        clearN64DialogueTextCanvas();
        return;
      }

      const rect = area.getBoundingClientRect();
      let width = Math.round(rect.width);
      let height = Math.round(rect.height);

      if (width < 12) {
        width = Math.max(48, Math.floor(area.clientWidth), Math.floor(refs.dialogueText.offsetWidth || 0));
      }

      if (height < 12) {
        height = Math.max(33, Math.floor(area.clientHeight), Math.floor(refs.dialogueText.offsetHeight || 0));
      }

      width = Math.min(2048, Math.max(48, width));
      height = Math.min(512, Math.max(33, height));

      const hiCanvas = getN64DialogueTextHiCanvas(width, height);
      const hiCtx = hiCanvas.getContext('2d');
      if (!hiCtx) return;

      const padTop = 6;
      const padLeft = state.dialogueMirrored ? 32 : 14;

      hiCtx.clearRect(0, 0, width, height);
      hiCtx.save();
      hiCtx.beginPath();
      hiCtx.rect(0, padTop, width, 2 * constants.N64_TEXT_LINE_HEIGHT);
      hiCtx.clip();
      hiCtx.font = constants.N64_TEXT_FONT;

      if ('letterSpacing' in hiCtx) {
        try {
          hiCtx.letterSpacing = '0.5px';
        } catch { }
      }

      hiCtx.textBaseline = 'top';
      hiCtx.fillStyle = '#ffffff';
      hiCtx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      hiCtx.shadowOffsetX = 1;
      hiCtx.shadowOffsetY = 1;
      hiCtx.shadowBlur = 0;
      const letterSpacing = 0.5;

      const lineElements = scrollWrapper.querySelectorAll('.line');
      const scrollY = getScrollWrapperTranslateYpx(scrollWrapper);
      const centered = refs.dialogueText.classList.contains('centered');
      const elapsed = performance.now();

      for (let i = 0; i < lineElements.length; i += 1) {
        const lineElement = lineElements[i];
        let y = padTop + (i * constants.N64_TEXT_LINE_HEIGHT) + scrollY;
        if (centered && lineElements.length === 1) {
          y = (height - constants.N64_TEXT_LINE_HEIGHT) / 2;
        }

        const characterElements = Array.from(lineElement.querySelectorAll('.dialogue-char'));
        if (characterElements.length === 0) {
          hiCtx.textAlign = 'left';
          hiCtx.fillStyle = '#ffffff';
          hiCtx.fillText(lineElement.textContent || '', padLeft, y);
          continue;
        }

        let x = padLeft;
        characterElements.forEach((characterElement, index) => {
          const characterText = characterElement.textContent || '';
          const emphasized = characterElement.classList.contains('dialogue-char-emphasis');
          const shakeSample = emphasized ? getDialogueShakeSample(elapsed, index, 1) : null;
          const shakeX = shakeSample ? shakeSample.x : 0;
          const shakeY = shakeSample ? shakeSample.y : 0;

          hiCtx.fillStyle = '#ffffff';
          hiCtx.fillText(characterText, x + shakeX, y + shakeY);
          x += hiCtx.measureText(characterText).width + letterSpacing;
        });
      }

      hiCtx.restore();

      const sampleWidth = Math.max(1, Math.floor(width / constants.N64_TEXT_PIXEL_BLOCK));
      const sampleHeight = Math.max(1, Math.floor(height / constants.N64_TEXT_PIXEL_BLOCK));
      const smallCanvas = getN64DialogueTextSmallCanvas(sampleWidth, sampleHeight);
      const smallCtx = smallCanvas.getContext('2d');
      if (!smallCtx) return;

      smallCtx.imageSmoothingEnabled = false;
      try {
        smallCtx.mozImageSmoothingEnabled = false;
      } catch { }

      smallCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      smallCtx.drawImage(hiCanvas, 0, 0, sampleWidth, sampleHeight);

      canvas.width = width;
      canvas.height = height;

      const outputCtx = canvas.getContext('2d');
      if (!outputCtx) return;

      outputCtx.imageSmoothingEnabled = false;
      try {
        outputCtx.mozImageSmoothingEnabled = false;
      } catch { }

      outputCtx.clearRect(0, 0, width, height);
      outputCtx.drawImage(smallCanvas, 0, 0, width, height);
      syncN64ShakeLoop();
    } catch (error) {
      console.warn('[Dialoggo] N64 dialogue text canvas:', error);
      env.log?.warn('N64 dialogue text canvas warning', {
        name: error?.name,
        message: error?.message,
      });
    }
  }

  function scheduleN64DialogueTextCanvasResize() {
    if (!state.n64ModeEnabled || !refs.dialogueText?.querySelector('.dialogue-scroll')) return;
    if (n64TextResizeRaf) cancelAnimationFrame(n64TextResizeRaf);

    n64TextResizeRaf = requestAnimationFrame(() => {
      n64TextResizeRaf = 0;
      renderN64DialogueTextCanvas();
    });
  }

  if (typeof ResizeObserver !== 'undefined' && refs.dialogueTextArea) {
    new ResizeObserver(() => {
      scheduleN64DialogueTextCanvasResize();
    }).observe(refs.dialogueTextArea);
  }

  function setInputLocked(locked) {
    refs.input.readOnly = locked;
    refs.input.classList.toggle('is-locked', locked);
    refs.input.parentElement?.classList.toggle('is-locked', locked);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createDialogueCharacterElement(character, index) {
    const characterSpan = document.createElement('span');
    characterSpan.className = 'dialogue-char';
    characterSpan.textContent = character.value;

    if (character.emphasis && /\S/.test(character.value)) {
      characterSpan.classList.add('dialogue-char-emphasis', 'dialogue-char-shake');
      characterSpan.style.setProperty('--dialogue-char-shake-duration', `${270 + ((index % 5) * 22)}ms`);
      characterSpan.style.setProperty('--dialogue-char-shake-delay', `${-180 - ((index % 7) * 85)}ms`);
      characterSpan.style.setProperty('--dialogue-char-shake-rotate', `${((index % 3) - 1) * 5}deg`);
    }

    return characterSpan;
  }

  function appendDialogueCharacter(lineElement, character, index) {
    if (!lineElement) return;
    lineElement.appendChild(createDialogueCharacterElement(character, index));
    syncN64ShakeLoop();
  }

  function buildDialogueInputHighlightMarkup(value) {
    const source = String(value || '');
    const segments = [];
    let emphasis = false;
    const pairedMarkerStarts = model.getPairedDialogueMarkerStarts(source);
    let runStart = 0;

    function pushRun(endIndex) {
      if (endIndex <= runStart) return;
      const className = emphasis ? 'text-input-emphasis' : 'text-input-plain';
      segments.push(`<span class="${className}">${escapeHtml(source.slice(runStart, endIndex))}</span>`);
    }

    for (let index = 0; index < source.length; index += 1) {
      if (source.startsWith('**', index) && pairedMarkerStarts.has(index)) {
        pushRun(index);
        segments.push('<span class="text-input-modifier">**</span>');
        emphasis = !emphasis;
        runStart = index + 2;
        index += 1;
        continue;
      }

      if (source.startsWith('**', index)) {
        pushRun(index);
        segments.push(`<span class="text-input-plain">${escapeHtml(source.slice(index, index + 2))}</span>`);
        runStart = index + 2;
        index += 1;
        continue;
      }
    }

    pushRun(source.length);

    if (segments.length === 0) {
      return '<span class="text-input-trailing-space">&#8203;</span>';
    }

    return `${segments.join('')}<span class="text-input-trailing-space">&#8203;</span>`;
  }

  function syncDialogueInputHighlightScroll() {
    if (!refs.dialogueInputHighlight || !refs.input) return;
    refs.dialogueInputHighlight.scrollTop = refs.input.scrollTop;
    refs.dialogueInputHighlight.scrollLeft = refs.input.scrollLeft;
  }

  function syncDialogueInputHighlightMetrics() {
    if (!refs.dialogueInputHighlight || !refs.input) return;

    const computed = window.getComputedStyle(refs.input);
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const borderRight = parseFloat(computed.borderRightWidth) || 0;
    const basePaddingRight = parseFloat(computed.paddingRight) || 0;
    const scrollbarWidth = Math.max(0, refs.input.offsetWidth - refs.input.clientWidth - borderLeft - borderRight);

    refs.dialogueInputHighlight.style.paddingTop = computed.paddingTop;
    refs.dialogueInputHighlight.style.paddingRight = `${basePaddingRight + scrollbarWidth}px`;
    refs.dialogueInputHighlight.style.paddingBottom = computed.paddingBottom;
    refs.dialogueInputHighlight.style.paddingLeft = computed.paddingLeft;
    refs.dialogueInputHighlight.style.font = computed.font;
    refs.dialogueInputHighlight.style.lineHeight = computed.lineHeight;
    refs.dialogueInputHighlight.style.letterSpacing = computed.letterSpacing;
  }

  function syncDialogueInputHighlight() {
    if (!refs.dialogueInputHighlight || !refs.input) return;

    const hasValue = refs.input.value.length > 0;
    refs.input.parentElement?.classList.toggle('has-value', hasValue);
    syncDialogueInputHighlightMetrics();
    refs.dialogueInputHighlight.innerHTML = buildDialogueInputHighlightMarkup(refs.input.value);
    syncDialogueInputHighlightScroll();
  }

  function syncDialogueInputCounter() {
    if (!refs.dialogueInputCounter || !refs.input) return;

    const length = refs.input.value.length;
    refs.dialogueInputCounter.textContent = `${length} / ${constants.DIALOGUE_INPUT_MAX_LENGTH}`;
    refs.dialogueInputCounter.classList.toggle('is-near-limit', length >= constants.DIALOGUE_INPUT_MAX_LENGTH - 100 && length < constants.DIALOGUE_INPUT_MAX_LENGTH);
    refs.dialogueInputCounter.classList.toggle('is-at-limit', length >= constants.DIALOGUE_INPUT_MAX_LENGTH);
  }

  function normalizeDialogueInput() {
    if (!refs.input) return;

    const clamped = model.clampDialogueInputValue(refs.input.value);
    if (refs.input.value !== clamped) {
      const selectionStart = Math.min(refs.input.selectionStart ?? clamped.length, clamped.length);
      const selectionEnd = Math.min(refs.input.selectionEnd ?? clamped.length, clamped.length);
      refs.input.value = clamped;
      refs.input.setSelectionRange(selectionStart, selectionEnd);
    }

    refs.input.setCustomValidity('');
    syncDialogueInputHighlight();
    syncDialogueInputCounter();
  }

  function syncCharacterSearchClearButton() {
    if (!refs.characterSearchClear || !refs.characterSearchInput) return;
    refs.characterSearchClear.hidden = refs.characterSearchInput.value.length === 0;
  }

  function updateFastForwardAvailability(canFastForward) {
    if (!refs.btnFastForward) return;
    setActionButtonBlocked(refs.btnFastForward, !canFastForward);
    refs.btnFastForward.classList.toggle('fast-forwarding', state.isFastForwarding);
    refs.btnFastForward.title = canFastForward ? 'Hold to fast forward' : 'Fast forward';
  }

  function applyCharacterFilters({
    resetScroll = false
  } = {}) {
    const query = model.normalizeCharacterSearch(refs.characterSearchInput?.value);
    let visibleCount = 0;

    document.querySelectorAll('.char-btn').forEach((button) => {
      const searchIndex = button.dataset.searchIndex || '';
      const matchesSearch = !query || searchIndex.includes(query);

      button.classList.toggle('search-hidden', !matchesSearch);
      const visible = matchesSearch && !button.classList.contains('hidden-broken');
      if (visible) visibleCount += 1;
    });

    refs.characterSearchEmpty?.classList.toggle('visible', visibleCount === 0);

    if (refs.charGrid) {
      if (visibleCount > 0) {
        refs.charGrid.style.minHeight = '';
        requestAnimationFrame(() => {
          const height = Math.ceil(refs.charGrid.getBoundingClientRect().height);
          if (height > 0) refs.charGrid.dataset.emptyHeight = String(height);
        });
      } else {
        const storedHeight = Number(refs.charGrid.dataset.emptyHeight || 0);
        refs.charGrid.style.minHeight = storedHeight > 0 ? `${storedHeight}px` : '';
      }
    }

    if (resetScroll && refs.charGrid) {
      refs.charGrid.scrollLeft = 0;
    }

    requestAnimationFrame(updateReelArrows);
  }

  function stopCardAnim(characterId) {
    const cardState = cardAnimState.get(characterId);
    if (!cardState) return;
    clearInterval(cardState.timer);
    clearTimeout(cardState.timer);
    cardState.timer = null;
  }

  function setCardFrame(cardState, frames, index) {
    const framePath = frames[index];
    if (!framePath) return;
    cardState.img.src = fileToSrc(framePath);
  }

  function startCardIdleAnim(characterId) {
    const cardState = cardAnimState.get(characterId);
    if (!cardState) return;

    const frames = cardState.char.idleFrames;
    if (!frames?.length) return;

    stopCardAnim(characterId);
    cardState.mode = 'idle';
    cardState.frameIndex = 0;
    cardState.direction = 1;
    setCardFrame(cardState, frames, cardState.frameIndex);

    const lastFrame = Math.max(0, frames.length - 1);
    const schedule = () => {
      const hold = 1500 + Math.floor(Math.random() * 2200);
      cardState.timer = setTimeout(playCycle, hold);
    };

    const playCycle = () => {
      if (cardState.mode !== 'idle') return;

      let index = 1;
      let direction = 1;
      const step = () => {
        if (cardState.mode !== 'idle') return;

        cardState.frameIndex = index;
        setCardFrame(cardState, frames, cardState.frameIndex);
        if (index >= lastFrame) direction = -1;
        index += direction;

        if (index <= 0) {
          cardState.frameIndex = 0;
          setCardFrame(cardState, frames, 0);
          schedule();
          return;
        }

        cardState.timer = setTimeout(step, 80);
      };

      cardState.timer = setTimeout(step, 80);
    };

    schedule();
  }

  function startCardSpeakThenIdle(characterId) {
    const cardState = cardAnimState.get(characterId);
    if (!cardState) return;

    const speakFrames = cardState.char.speakFrames;
    if (!speakFrames?.length) {
      startCardIdleAnim(characterId);
      return;
    }

    stopCardAnim(characterId);
    cardState.mode = 'speak';
    cardState.frameIndex = 0;
    cardState.direction = 1;
    setCardFrame(cardState, speakFrames, cardState.frameIndex);

    cardState.timer = setInterval(() => {
      if (cardState.mode !== 'speak') return;

      cardState.frameIndex += cardState.direction;
      if (cardState.frameIndex >= speakFrames.length - 1) cardState.direction = -1;
      else if (cardState.frameIndex <= 0) {
        startCardIdleAnim(characterId);
        return;
      }

      setCardFrame(cardState, speakFrames, cardState.frameIndex);
    }, 70);
  }

  function updateReelArrows() {
    const atStart = refs.charGrid.scrollLeft <= 2;
    const atEnd = refs.charGrid.scrollLeft + refs.charGrid.clientWidth >= refs.charGrid.scrollWidth - 2;
    refs.reelLeft.classList.toggle('hidden', atStart);
    refs.reelRight.classList.toggle('hidden', atEnd);
  }

  function dialogueBoxExtraClasses() {
    return `${state.dialogueMirrored ? ' mirrored' : ''}${state.n64ModeEnabled ? ' n64-mode' : ''}`;
  }

  function syncN64ClassOnDialogueBox() {
    refs.dialogueBox?.classList.toggle('n64-mode', state.n64ModeEnabled);
    if (!state.n64ModeEnabled) stopN64ShakeLoop();
  }

  function redrawSpriteForN64Toggle() {
    if (!spriteRenderer.idleFrames?.length && !spriteRenderer.speakFrames?.length) return;

    if (spriteRenderer.mode === 'speaking') {
      spriteRenderer.showFrame(spriteRenderer.speakFrames, spriteRenderer.frameIndex);
      return;
    }

    if (spriteRenderer.mode === 'idle') {
      spriteRenderer.showFrame(spriteRenderer.idleFrames, spriteRenderer.frameIndex);
    }
  }

  let placeholderFrameIdx = 0;
  let placeholderTimer = null;
  let startupLoadingFrameIdx = 0;
  let startupLoadingTimer = null;
  let startupRevealAudioHandle = null;
  const placeholderFrames = [];

  for (let i = 1; i <= 22; i += 1) {
    placeholderFrames.push(env.path.join(env.guiAnimDir, 'loading', `${i}.png`));
  }

  function startPlaceholderAnim() {
    if (placeholderTimer) return;

    placeholderFrameIdx = 0;
    showPlaceholderFrame();
    placeholderTimer = setInterval(() => {
      placeholderFrameIdx = (placeholderFrameIdx + 1) % placeholderFrames.length;
      showPlaceholderFrame();
    }, 90);
  }

  function showPlaceholderFrame() {
    const framePath = placeholderFrames[placeholderFrameIdx];
    if (framePath && env.fs.existsSync(framePath)) {
      refs.placeholderAnim.src = fileToSrc(framePath);
    }
  }

  function startStartupLoadingAnim() {
    if (!refs.startupLoadingAnim || startupLoadingTimer) return;

    startupLoadingFrameIdx = 0;
    showStartupLoadingFrame();
    startupLoadingTimer = setInterval(() => {
      startupLoadingFrameIdx = (startupLoadingFrameIdx + 1) % placeholderFrames.length;
      showStartupLoadingFrame();
    }, 90);
  }

  function showStartupLoadingFrame() {
    const framePath = placeholderFrames[startupLoadingFrameIdx];
    if (framePath && env.fs.existsSync(framePath) && refs.startupLoadingAnim) {
      refs.startupLoadingAnim.src = fileToSrc(framePath);
    }
  }

  function stopPlaceholderAnim() {
    if (!placeholderTimer) return;
    clearInterval(placeholderTimer);
    placeholderTimer = null;
  }

  function stopStartupLoadingAnim() {
    if (!startupLoadingTimer) return;
    clearInterval(startupLoadingTimer);
    startupLoadingTimer = null;
  }

  async function startStartupRevealSound() {
    if (!env.fs.existsSync(env.startupRevealSoundPath)) return;

    stopStartupRevealSound();

    try {
      const buffer = await audioService.loadAudioBuffer(env.startupRevealSoundPath);
      startupRevealAudioHandle = audioService.playAudioBuffer(buffer, {
        volume: audioService.getMenuSoundVolumeGain(),
      });
    } catch {
      startupRevealAudioHandle = null;
    }
  }

  function stopStartupRevealSound() {
    if (!startupRevealAudioHandle?.source) {
      startupRevealAudioHandle = null;
      return;
    }

    const {
      source,
      gainNode
    } = startupRevealAudioHandle;
    startupRevealAudioHandle = null;

    try {
      const ctx = audioService.getAudioContext();
      const now = ctx.currentTime;
      const currentGain = Math.max(0.001, gainNode?.gain?.value ?? audioService.getMenuSoundVolumeGain());

      if (gainNode) {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentGain, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.09);
      }

      setTimeout(() => {
        try {
          source.stop();
        } catch { }
      }, 95);
    } catch {
      try {
        source.stop();
      } catch { }
    }
  }

  async function prewarmStartupAssets() {
    const startupImageFiles = placeholderFrames.filter((filePath) => env.fs.existsSync(filePath));
    const startupAudioFiles = env.fs.existsSync(env.startupRevealSoundPath) ? [env.startupRevealSoundPath] : [];

    await Promise.allSettled([
      ...startupImageFiles.map((filePath) => loadSpriteImage(filePath).catch(() => null)),
      ...startupAudioFiles.map((filePath) => audioService.loadAudioBuffer(filePath).catch(() => null)),
    ]);
  }

  function scheduleBackgroundAssetWarmup() {
    const deferredAudioFiles = [
      env.path.join(env.sndDir, 'gui', '1.wav'),
      env.path.join(env.sndDir, 'gui', '2.wav'),
      env.path.join(env.sndDir, 'gui', '3.wav'),
      env.path.join(env.sndDir, 'gui', '4.wav'),
      env.path.join(env.sndDir, 'gui', '5.wav'),
      env.startupRevealSoundPath,
    ].filter((filePath, index, values) => (
      values.indexOf(filePath) === index && env.fs.existsSync(filePath)
    ));

    setTimeout(() => {
      deferredAudioFiles.forEach((filePath, index) => {
        setTimeout(() => {
          audioService.loadAudioBuffer(filePath).catch(() => null);
        }, index * 40);
      });
    }, 0);
  }

  function resizeStartupIntroCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(window.innerWidth * dpr));
    const height = Math.max(1, Math.round(window.innerHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function drawStartupIntroFrame(ctx, jiggyPath, viewportWidth, viewportHeight, progress) {
    const initialScale = 0.12;
    const finalScale = (Math.hypot(viewportWidth, viewportHeight) * 1.8) / constants.STARTUP_JIGGY_SIZE;
    const scale = initialScale + ((finalScale - initialScale) * progress);
    const rotationDeg = -18 + ((250 - (-18)) * progress);

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    if (!jiggyPath) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(
      (viewportWidth / 2) + constants.STARTUP_JIGGY_CENTER_OFFSET_X,
      (viewportHeight / 2) + constants.STARTUP_JIGGY_CENTER_OFFSET_Y,
    );
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-(constants.STARTUP_JIGGY_SIZE / 2), -(constants.STARTUP_JIGGY_SIZE / 2));
    ctx.fillStyle = '#ffffff';
    ctx.fill(jiggyPath);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  async function playStartupIntroAnimation() {
    if (!refs.startupIntroCanvas) {
      await model.sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    const ctx = refs.startupIntroCanvas.getContext('2d');
    if (!ctx) {
      await model.sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    let jiggyPath = null;
    try {
      jiggyPath = new Path2D(constants.STARTUP_JIGGY_PATH_DATA);
    } catch {
      await model.sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    return new Promise((resolve) => {
      let startTimestamp = null;

      const tick = (timestamp) => {
        if (startTimestamp === null) startTimestamp = timestamp;

        const elapsed = timestamp - startTimestamp;
        const progress = Math.max(0, Math.min(1, elapsed / constants.STARTUP_INTRO_MS));
        const viewport = resizeStartupIntroCanvas(refs.startupIntroCanvas, ctx);

        drawStartupIntroFrame(ctx, jiggyPath, viewport.width, viewport.height, progress);

        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }

        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  async function runStartupSequence() {
    if (!refs.startupOverlay) return;

    startStartupLoadingAnim();

    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await prewarmStartupAssets();
    } catch (error) {
      console.warn('[Dialoggo] startup prewarm failed', error);
      env.log?.warn('Startup prewarm failed', {
        name: error?.name,
        message: error?.message,
      });
    } finally {
      stopStartupLoadingAnim();
      document.body.classList.remove('startup-loading');
      document.body.classList.add('startup-intro-running');

      try {
        await startStartupRevealSound();
        await Promise.race([
          playStartupIntroAnimation(),
          model.sleep(constants.STARTUP_INTRO_MS + 180),
        ]);
      } catch (error) {
        console.warn('[Dialoggo] startup intro failed', error);
        env.log?.warn('Startup intro failed', {
          name: error?.name,
          message: error?.message,
        });
      } finally {
        stopStartupRevealSound();
      }

      await model.sleep(120);

      document.body.classList.remove('startup-active', 'startup-intro-running');
      document.body.classList.add('startup-complete');

      setTimeout(() => {
        refs.startupOverlay.remove();
      }, 320);

      scheduleBackgroundAssetWarmup();
    }
  }

  function buildCharacterGrid(onCharacterSelected) {
    refs.charGrid.innerHTML = '';
    cardAnimState.clear();

    characters.forEach((character) => {
      const button = document.createElement('button');
      button.className = 'char-btn';
      button.dataset.id = character.id;
      button.dataset.searchIndex = model.normalizeCharacterSearch(`${character.displayName} ${character.id}`);
      button.disabled = !character.isAvailable;
      if (!character.isAvailable) button.classList.add('unavailable');

      const spriteWrap = document.createElement('div');
      spriteWrap.className = 'char-btn-sprite';

      const spriteImage = document.createElement('img');
      const previewPath = character.previewSpritePath || null;
      if (previewPath) {
        spriteImage.src = fileToSrc(previewPath);
      } else {
        const placeholderPath = env.path.join(env.charImgDir, 'tooty', 's5.png');
        if (env.fs.existsSync(placeholderPath)) {
          spriteImage.src = fileToSrc(placeholderPath);
          spriteImage.classList.add('missing-char-icon');
        }
      }

      spriteImage.alt = character.displayName;
      spriteWrap.appendChild(spriteImage);

      const label = document.createElement('span');
      label.textContent = character.displayName;

      button.appendChild(spriteWrap);
      button.appendChild(label);

      if (!character.isAvailable) {
        const warningPath = env.path.join(env.guiImgDir, '1.png');
        if (env.fs.existsSync(warningPath)) {
          const badge = document.createElement('img');
          badge.className = 'warning-badge';
          badge.src = fileToSrc(warningPath);
          badge.alt = 'Unavailable';
          badge.title = (!character.hasAllSprites && !character.hasAnySound) ?
            'Missing sprite frames and no usable sounds' :
            (!character.hasAllSprites ? 'Missing sprite frames' : 'No usable sounds found');
          button.appendChild(badge);
        }
      }

      cardAnimState.set(character.id, {
        timer: null,
        frameIndex: 0,
        direction: 1,
        mode: 'idle',
        img: spriteImage,
        char: character,
      });

      button.addEventListener('mouseenter', () => {
        if (button.disabled) return;
        startCardIdleAnim(character.id);
      });

      button.addEventListener('mouseleave', () => {
        if (button.disabled) return;

        if (state.selectedCharacter?.id === character.id) {
          const cardState = cardAnimState.get(character.id);
          if (cardState?.mode !== 'speak') startCardIdleAnim(character.id);
          return;
        }

        stopCardAnim(character.id);
        if (previewPath) spriteImage.src = fileToSrc(previewPath);
      });

      button.addEventListener('click', () => {
        if (button.disabled) return;
        const wasActive = state.selectedCharacter?.id === character.id;
        onCharacterSelected(character, wasActive);
      });

      refs.charGrid.appendChild(button);
    });

    applyCharacterFilters();
  }

  function updateSelectedCharacterCard(character) {
    document.querySelectorAll('.char-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.id === character?.id);
      const buttonCharacterId = button.dataset.id;
      if (!buttonCharacterId) return;

      const cardState = cardAnimState.get(buttonCharacterId);
      if (!cardState) return;

      if (buttonCharacterId === character?.id) {
        startCardIdleAnim(buttonCharacterId);
        return;
      }

      stopCardAnim(buttonCharacterId);
      const previewPath = cardState.char.idleFrames[0] || cardState.char.speakFrames[0];
      if (previewPath) cardState.img.src = fileToSrc(previewPath);
    });
  }

  function computeExpandedPreviewHeight() {
    if (!refs.app || !refs.bottombar) return 280;

    const storedHeight = refs.panelWrapper?.dataset?.naturalPanelHeight;
    const panelHeight = storedHeight ? Number(storedHeight) : (refs.panelWrapper?.offsetHeight ?? 200);
    return Math.max(120, refs.app.clientHeight - refs.bottombar.offsetHeight - panelHeight);
  }

  function setPreviewPlaceholderSuppressed(suppressed) {
    refs.previewArea?.classList.toggle('preview-placeholder-suppressed', suppressed);
  }

  function setFrontPanel(panel) {
    refs.controlsPanel?.classList.toggle('active', panel === 'controls');
    refs.backgroundsPanel?.classList.toggle('active', panel === 'backgrounds');

    refs.controlsPanel?.setAttribute('aria-hidden', panel !== 'controls' ? 'true' : 'false');
    refs.backgroundsPanel?.setAttribute('aria-hidden', panel !== 'backgrounds' ? 'true' : 'false');
  }

  function setActiveBackPanel(panel) {
    refs.settingsPanel?.classList.toggle('active', panel === 'settings');
    refs.settingsPanel?.setAttribute('aria-hidden', panel !== 'settings' ? 'true' : 'false');
  }

  function setFlipCardPanel(panel) {
    refs.flipCard?.classList.toggle('panel-settings', panel === 'settings');
  }

  function applyPanelState(panel) {
    if (panel === 'settings') {
      setActiveBackPanel('settings');
      setFlipCardPanel('settings');
      return;
    }

    setFlipCardPanel(null);
    setActiveBackPanel(null);
    setFrontPanel(panel);
  }

  function getFlipPhaseAngles(fromPanel, toPanel) {
    if (fromPanel === 'settings' && toPanel !== 'settings') {
      return {
        outFrom: 180,
        outTo: 90,
        inFrom: 90,
        inTo: 0,
      };
    }

    if (fromPanel !== 'settings' && toPanel === 'settings') {
      return {
        outFrom: 0,
        outTo: 90,
        inFrom: 90,
        inTo: 180,
      };
    }

    return {
      outFrom: 0,
      outTo: 90,
      inFrom: -90,
      inTo: 0,
    };
  }

  async function runFlipPhase(fromDeg, toDeg, duration) {
    if (!refs.flipCard || typeof refs.flipCard.animate !== 'function' || fromDeg === toDeg) return;

    if (flipCardAnimation) {
      flipCardAnimation.cancel();
      flipCardAnimation = null;
    }

    const animation = refs.flipCard.animate(
      [
        { transform: `rotateY(${fromDeg}deg)` },
        { transform: `rotateY(${toDeg}deg)` },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.4, 0.2, 0.2, 1)',
        fill: 'forwards',
      },
    );

    flipCardAnimation = animation;

    try {
      await animation.finished;
    } catch {
      // Ignore cancellations; the final state is applied by the caller.
    } finally {
      if (typeof animation.commitStyles === 'function') {
        animation.commitStyles();
      }

      animation.cancel();

      if (flipCardAnimation === animation) {
        flipCardAnimation = null;
      }
    }
  }

  async function flipPanel(fromPanel, toPanel) {
    if (fromPanel === toPanel) {
      applyPanelState(toPanel);
      return;
    }

    if (!refs.flipCard || typeof refs.flipCard.animate !== 'function') {
      applyPanelState(toPanel);
      return;
    }

    const phaseMs = Math.round(constants.FLIP_CARD_MS / 2);
    const angles = getFlipPhaseAngles(fromPanel, toPanel);
    refs.flipCard.classList.add('panel-flipping');

    try {
      await runFlipPhase(angles.outFrom, angles.outTo, phaseMs);
      applyPanelState(toPanel);
      await runFlipPhase(angles.inFrom, angles.inTo, phaseMs);
    } finally {
      if (flipCardAnimation) {
        flipCardAnimation.cancel();
        flipCardAnimation = null;
      }

      refs.flipCard.classList.remove('panel-flipping');
      refs.flipCard.style.transform = '';
    }
  }

  async function collapsePreviewThenSettings() {
    const height = Math.round(refs.previewArea.getBoundingClientRect().height);
    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${height}px`;
    refs.previewArea.style.overflow = 'hidden';
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    refs.previewArea.classList.add('preview-strip-collapsed', 'preview-settings-muted', 'preview-content-hidden');
    setPreviewPlaceholderSuppressed(true);
    stopPlaceholderAnim();

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
    });

    await model.sleep(constants.PREVIEW_COLLAPSE_MS + 40);
  }

  async function expandPreviewAfterControls(options = {}) {
    const keepPlaceholderSuppressed = options.keepPlaceholderSuppressed === true;
    const targetHeight = computeExpandedPreviewHeight();
    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
    refs.previewArea.style.overflow = 'hidden';
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${targetHeight}px`;
      refs.previewArea.classList.remove('preview-settings-muted');

      if (keepPlaceholderSuppressed) {
        setPreviewPlaceholderSuppressed(true);
        stopPlaceholderAnim();
      } else {
        refs.previewArea.classList.remove('preview-placeholder-suppressed');
      }

      if (!keepPlaceholderSuppressed && !refs.dialogueContainer.classList.contains('active')) {
        startPlaceholderAnim();
      }
    });

    await model.sleep(constants.PREVIEW_COLLAPSE_MS + 50);

    refs.previewArea.classList.remove('preview-strip-collapsed', 'preview-content-hidden');
    refs.previewArea.style.height = '';
    refs.previewArea.style.flex = '';
    refs.previewArea.style.minHeight = '';
    refs.previewArea.style.overflow = '';
    refs.previewArea.style.transition = '';
    refs.app?.classList.remove('settings-panel-open');
    if (refs.panelWrapper) delete refs.panelWrapper.dataset.naturalPanelHeight;

    if (keepPlaceholderSuppressed) {
      setPreviewPlaceholderSuppressed(true);
      stopPlaceholderAnim();
    }
  }

  function isLargeScreen() {
    return window.innerHeight >= 820;
  }

  function syncSettingsLayoutMode() {
    // Maximization support has been removed; keep the hook as a no-op for panel flow callers.
  }

  function flipToControlsInstant() {
    if (state.activePanel === 'controls') return;

    if (flipCardAnimation) {
      flipCardAnimation.cancel();
      flipCardAnimation = null;
    }

    refs.flipCard?.classList.remove('panel-flipping');
    if (refs.flipCard) refs.flipCard.style.transform = '';
    setFlipCardPanel(null);
    setFrontPanel('controls');
    setActiveBackPanel(null);
    refs.sleeveBackgrounds.classList.remove('active');
    refs.sleeveSettings.classList.remove('active');
    state.frontPanel = 'controls';
    state.activePanel = 'controls';
    refs.previewArea.classList.remove('preview-settings-muted', 'preview-strip-collapsed', 'preview-content-hidden');
    setPreviewPlaceholderSuppressed(false);
    refs.previewArea.style.height = '';
    refs.previewArea.style.flex = '';
    refs.previewArea.style.minHeight = '';
    refs.previewArea.style.overflow = '';
    refs.previewArea.style.transition = '';
    refs.app?.classList.remove('settings-panel-open');
    if (refs.panelWrapper) delete refs.panelWrapper.dataset.naturalPanelHeight;
    syncSettingsLayoutMode('controls');

    if (!refs.dialogueContainer.classList.contains('active')) {
      startPlaceholderAnim();
    }
  }

  refs.versionLabel.textContent = `v${env.appVersion}`;
  refs.charCount.textContent = `${characters.length} chars`;
  setFrontPanel(state.frontPanel || 'controls');
  setActiveBackPanel(state.activePanel === 'settings' ? 'settings' : null);
  setFlipCardPanel(state.activePanel === 'settings' ? 'settings' : null);
  window.addEventListener('resize', syncDialogueInputHighlight);
  syncDialogueInputHighlightMetrics();
  startPlaceholderAnim();

  return {
    refs,
    spriteRenderer,
    cardAnimState,
    fileToSrc,
    loadSpriteImage,
    collectFilesRecursive,
    setActionButtonBlocked,
    isActionButtonBlocked,
    clearN64DialogueTextCanvas,
    renderN64DialogueTextCanvas,
    n64RepaintDuringScrollTransition,
    setInputLocked,
    appendDialogueCharacter,
    normalizeDialogueInput,
    syncDialogueInputHighlight,
    syncDialogueInputHighlightMetrics,
    syncDialogueInputHighlightScroll,
    syncDialogueInputCounter,
    syncCharacterSearchClearButton,
    updateFastForwardAvailability,
    applyCharacterFilters,
    stopCardAnim,
    startCardIdleAnim,
    startCardSpeakThenIdle,
    startPlaceholderAnim,
    stopPlaceholderAnim,
    runStartupSequence,
    buildCharacterGrid,
    updateSelectedCharacterCard,
    updateReelArrows,
    dialogueBoxExtraClasses,
    syncN64ClassOnDialogueBox,
    redrawSpriteForN64Toggle,
    computeExpandedPreviewHeight,
    setPreviewPlaceholderSuppressed,
    setFrontPanel,
    flipPanel,
    setActiveBackPanel,
    setFlipCardPanel,
    collapsePreviewThenSettings,
    expandPreviewAfterControls,
    isLargeScreen,
    syncSettingsLayoutMode,
    flipToControlsInstant,
  };
}

module.exports = {
  createAppView
};
