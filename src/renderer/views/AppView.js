function createAppView(model, audioService) {
  const {
    env,
    state,
    characters,
    packs,
    backgrounds,
    backgroundPacks,
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
    btnUpload: document.getElementById('btn-upload'),
    app: document.querySelector('.app'),
    previewArea: document.getElementById('preview-area'),
    previewAreaContent: document.getElementById('preview-area-content'),
    previewBackgroundCurrent: document.getElementById('preview-background-current'),
    previewBackgroundNext: document.getElementById('preview-background-next'),
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
    backgroundsSections: document.getElementById('backgrounds-sections'),
    flipCard: document.getElementById('flip-card'),
    sleeveCamera: document.getElementById('sleeve-tab-camera'),
    sleeveBackgrounds: document.getElementById('sleeve-tab-backgrounds'),
    sleeveGuide: document.getElementById('sleeve-tab-guide'),
    sleeveCharacter: document.getElementById('sleeve-tab-character'),
    sleeveSettings: document.getElementById('sleeve-tab-settings'),
    shortcutVisualizer: document.getElementById('shortcut-visualizer'),
    shortcutVisualizerKeys: document.getElementById('shortcut-visualizer-keys'),
    shortcutVisualizerAction: document.getElementById('shortcut-visualizer-action'),
    inputMirrored: document.getElementById('input-mirrored-dialogue'),
    inputN64: document.getElementById('input-n64-mode'),
    inputShortcutVisualizer: document.getElementById('input-shortcut-visualizer'),
    inputHideBroken: document.getElementById('input-hide-broken-chars'),
    inputHideBrokenBackgrounds: document.getElementById('input-hide-broken-backgrounds'),
    banner: document.getElementById('background-banner'),
    bannerTitle: document.getElementById('background-banner-title'),
    bannerSubtitle: document.getElementById('background-banner-subtitle'),
    formatToolbar: document.getElementById('dialogue-format-toolbar'),
  };
  let favoriteContextMenu = null;
  let favoriteContextMenuAction = null;

  let n64PixelScratch = null;
  let n64DialogueTextHi = null;
  let n64DialogueTextSmall = null;
  let n64TextResizeRaf = 0;
  let n64ShakeAnimationRaf = 0;
  let dialogueMeasureContext = null;
  const DIALOGUE_SHAKE_CYCLE_MS = 280;

  const MAX_SPRITE_IMAGE_CACHE_ENTRIES = 120;
  const spriteImageCache = new Map();
  const dialogueMeasureCache = new Map();
  const cardAnimState = new Map();
  const characterCardKeysById = new Map();
  let flipCardAnimation = null;
  let previewPlaceholderExplicitSuppression = false;
  let previewPlaceholderPanelIntent = null;
  let previewBackgroundTransitionTimer = 0;
  let previewBackgroundPendingImage = 'none';
  let previewBackgroundPendingHasImage = false;
  const PREVIEW_BACKGROUND_TRANSITION_MS = 760;
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

  const _truncCtx = document.createElement('canvas').getContext('2d');
  const shortcutKeyLabelMap = new Map([
    ['ctrl', 'Ctrl'],
    ['shift', 'Shift'],
    ['space', 'Space'],
    ['escape', 'Esc'],
  ]);
  const shortcutKeyOrder = new Map([
    ['ctrl', 0],
    ['shift', 1],
    ['space', 2],
    ['escape', 3],
  ]);

  function createHeartIcon({
    filled = true,
    wrapperClassName = '',
    svgClassName = '',
  } = {}) {
    const icon = document.createElement('span');
    if (wrapperClassName) icon.className = wrapperClassName;
    icon.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    if (svgClassName) svg.setAttribute('class', svgClassName);

    if (filled) {
      svg.setAttribute('fill', 'currentColor');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M178,40c-20.2,0-38.7,9.4-50,25.3C116.7,49.4,98.2,40,78,40C44.9,40,18,67,18,100.2c0,70.1,98.1,116.4,102.3,118.3a18,18,0,0,0,15.4,0c4.2-1.9,102.3-48.2,102.3-118.3C238,67,211.1,40,178,40Z');
      svg.appendChild(path);
    } else {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '18');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M178,48c-21.6,0-41.3,10.4-50,26.3C119.3,58.4,99.6,48,78,48C48.2,48,24,72.2,24,102c0,66.4,92.5,109.9,96.4,111.7a18.2,18.2,0,0,0,15.2,0C139.5,211.9,232,168.4,232,102C232,72.2,207.8,48,178,48Z');
      svg.appendChild(path);
    }

    icon.appendChild(svg);
    return icon;
  }

  function createFavoriteHeartIcon(wrapperClassName = 'char-btn-favorite-heart') {
    return createHeartIcon({
      filled: true,
      wrapperClassName,
    });
  }

  function buildFavoriteContextMenuContent(action, isFavorite) {
    const icon = createHeartIcon({
      filled: isFavorite,
      wrapperClassName: 'favorite-context-menu-action-icon',
    });
    const label = document.createElement('span');
    label.className = 'favorite-context-menu-action-label';
    label.textContent = isFavorite ? 'Remove from favorites' : 'Add to favorites';
    action.replaceChildren(icon, label);
  }

  function ensureFavoriteContextMenu() {
    if (favoriteContextMenu && favoriteContextMenuAction) {
      return {
        menu: favoriteContextMenu,
        action: favoriteContextMenuAction,
      };
    }

    favoriteContextMenu = document.createElement('div');
    favoriteContextMenu.className = 'favorite-context-menu';
    favoriteContextMenu.hidden = true;
    favoriteContextMenu.setAttribute('role', 'menu');
    favoriteContextMenu.setAttribute('aria-hidden', 'true');

    favoriteContextMenuAction = document.createElement('button');
    favoriteContextMenuAction.type = 'button';
    favoriteContextMenuAction.className = 'favorite-context-menu-action';
    favoriteContextMenuAction.setAttribute('role', 'menuitem');
    favoriteContextMenuAction.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    favoriteContextMenu.appendChild(favoriteContextMenuAction);
    document.body.appendChild(favoriteContextMenu);

    return {
      menu: favoriteContextMenu,
      action: favoriteContextMenuAction,
    };
  }

  function hideFavoriteContextMenu() {
    if (!favoriteContextMenu || !favoriteContextMenuAction) {
      state.favoriteContextMenu.visible = false;
      state.favoriteContextMenu.targetId = null;
      state.favoriteContextMenu.targetType = null;
      state.favoriteContextMenu.x = 0;
      state.favoriteContextMenu.y = 0;
      return;
    }

    state.favoriteContextMenu.visible = false;
    state.favoriteContextMenu.targetId = null;
    state.favoriteContextMenu.targetType = null;
    state.favoriteContextMenu.x = 0;
    state.favoriteContextMenu.y = 0;
    favoriteContextMenu.hidden = true;
    favoriteContextMenu.setAttribute('aria-hidden', 'true');
    delete favoriteContextMenu.dataset.targetId;
    delete favoriteContextMenu.dataset.targetType;
    favoriteContextMenuAction.onclick = null;
  }

  function showFavoriteContextMenu({
    targetId,
    targetType = 'character',
    isFavorite = false,
    x = 0,
    y = 0,
    onToggleFavorite = null,
  } = {}) {
    if (!targetId) return;

    const {
      menu,
      action,
    } = ensureFavoriteContextMenu();

    state.favoriteContextMenu.visible = true;
    state.favoriteContextMenu.targetId = targetId;
    state.favoriteContextMenu.targetType = targetType;
    state.favoriteContextMenu.x = x;
    state.favoriteContextMenu.y = y;

    menu.dataset.targetId = targetId;
    menu.dataset.targetType = targetType;
    buildFavoriteContextMenuContent(action, isFavorite);
    action.onclick = (event) => {
      event.preventDefault();
      onToggleFavorite?.();
    };

    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;

    const rect = menu.getBoundingClientRect();
    const clampedLeft = Math.min(
      Math.max(8, Math.round(x)),
      Math.max(8, Math.round(window.innerWidth - rect.width - 8)),
    );
    const clampedTop = Math.min(
      Math.max(8, Math.round(y)),
      Math.max(8, Math.round(window.innerHeight - rect.height - 8)),
    );

    menu.style.left = `${clampedLeft}px`;
    menu.style.top = `${clampedTop}px`;
    state.favoriteContextMenu.x = clampedLeft;
    state.favoriteContextMenu.y = clampedTop;

    requestAnimationFrame(() => {
      action.focus({
        preventScroll: true,
      });
    });
  }

  function isFavoriteContextMenuVisible() {
    return Boolean(favoriteContextMenu && state.favoriteContextMenu.visible === true && !favoriteContextMenu.hidden);
  }

  function isFavoriteContextMenuTarget(target) {
    return Boolean(favoriteContextMenu && target instanceof Node && favoriteContextMenu.contains(target));
  }

  function truncateTextToFit(text, maxWidth, fontStyle = '800 9px Outfit', letterSpacing = 0.65) {
    if (!text) return text;
    _truncCtx.font = fontStyle;

    const measure = (str) => {
      const upper = str.toUpperCase();
      return _truncCtx.measureText(upper).width + (upper.length - 1) * letterSpacing;
    };

    if (measure(text) <= maxWidth) return text;

    const words = text.split(' ');
    const suffix = '...';

    for (let count = words.length - 1; count >= 1; count--) {
      const candidate = words.slice(0, count).join(' ') + suffix;
      if (measure(candidate) <= maxWidth) return candidate;
    }

    return text;
  }

  function appendShortcutVisualizerActionText(host, text) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;

    const span = document.createElement('span');
    span.className = 'shortcut-visualizer-action-text';
    span.textContent = normalizedText;
    host.appendChild(span);
  }

  function buildShortcutVisualizerActionContent({
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    const normalizedAction = String(action || '').trim();
    const normalizedLeadingText = String(leadingText || '').trim();
    const normalizedTrailingText = String(trailingText || '').trim();
    const normalizedIconSrc = String(iconSrc || '').trim();
    const normalizedIconAlt = String(iconAlt || '').trim();
    const normalizedIconVariant = String(iconVariant || 'sprite').trim().toLowerCase();

    if (!normalizedIconSrc) {
      const fallbackText = normalizedAction || [normalizedLeadingText, normalizedTrailingText].filter(Boolean).join(' ');
      return {
        hasContent: fallbackText.length > 0,
        textContent: fallbackText,
        fragment: null,
      };
    }

    const fragment = document.createDocumentFragment();
    appendShortcutVisualizerActionText(fragment, normalizedLeadingText);

    const sprite = document.createElement('img');
    sprite.className = normalizedIconVariant === 'thumbnail'
      ? 'shortcut-visualizer-action-icon shortcut-visualizer-action-thumbnail'
      : 'shortcut-visualizer-action-icon shortcut-visualizer-action-sprite';
    sprite.src = normalizedIconSrc;
    sprite.alt = normalizedIconAlt;
    sprite.setAttribute('aria-hidden', normalizedIconAlt ? 'false' : 'true');
    fragment.appendChild(sprite);

    appendShortcutVisualizerActionText(fragment, normalizedTrailingText);

    return {
      hasContent: true,
      textContent: '',
      fragment,
    };
  }

  function syncShortcutVisualizer({
    visible = false,
    keys = [],
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    const root = refs.shortcutVisualizer;
    const keysHost = refs.shortcutVisualizerKeys;
    const actionHost = refs.shortcutVisualizerAction;
    if (!root || !keysHost || !actionHost) return;

    const normalizedKeys = Array.from(new Set(
      (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || '').toLowerCase())
        .filter((key) => shortcutKeyLabelMap.has(key)),
    )).sort((left, right) => {
      const leftOrder = shortcutKeyOrder.has(left) ? shortcutKeyOrder.get(left) : Number.MAX_SAFE_INTEGER;
      const rightOrder = shortcutKeyOrder.has(right) ? shortcutKeyOrder.get(right) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

    const actionContent = buildShortcutVisualizerActionContent({
      action,
      leadingText,
      trailingText,
      iconSrc,
      iconAlt,
      iconVariant,
    });
    const shouldShowTextOnly = normalizedKeys.length === 0 && actionContent.hasContent;

    if (!visible || (normalizedKeys.length === 0 && !actionContent.hasContent)) {
      keysHost.replaceChildren();
      actionHost.replaceChildren();
      actionHost.textContent = '';
      actionHost.hidden = true;
      root.classList.remove('visible');
      root.classList.remove('shortcut-visualizer-text-only');
      root.setAttribute('aria-hidden', 'true');
      return;
    }

    const fragment = document.createDocumentFragment();

    normalizedKeys.forEach((key, index) => {
      if (index > 0) {
        const plus = document.createElement('span');
        plus.className = 'shortcut-visualizer-plus';
        plus.textContent = '+';
        fragment.appendChild(plus);
      }

      const wrapper = document.createElement('span');
      wrapper.className = 'shortcut-keycap';
      wrapper.dataset.key = key;

      const d3wrapper = document.createElement('span');
      d3wrapper.className = 'shortcut-keycap-3dwrapper';

      const cover = document.createElement('span');
      cover.className = 'shortcut-keycap-cover';

      const label = document.createElement('span');
      label.className = 'shortcut-keycap-button';
      label.textContent = shortcutKeyLabelMap.get(key) || key;

      cover.appendChild(label);
      d3wrapper.appendChild(cover);
      wrapper.appendChild(d3wrapper);
      fragment.appendChild(wrapper);
    });

    keysHost.replaceChildren(fragment);
    keysHost.hidden = normalizedKeys.length === 0;

    actionHost.replaceChildren();
    if (actionContent.fragment) {
      actionHost.appendChild(actionContent.fragment);
    } else {
      actionHost.textContent = actionContent.textContent;
    }
    actionHost.hidden = !actionContent.hasContent;
    root.classList.toggle('shortcut-visualizer-text-only', shouldShowTextOnly);
    root.classList.add('visible');
    root.setAttribute('aria-hidden', 'false');
  }

  function setButtonKeyboardPressed(button, pressed) {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle('is-keyboard-pressed', pressed === true);
  }

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

  function getDialogueLetterSpacing(textStyle = null) {
    const style = textStyle || window.getComputedStyle(refs.dialogueText);
    const customSpacing = Number.parseFloat(style?.getPropertyValue('--dialogue-letter-spacing'));
    if (Number.isFinite(customSpacing)) return customSpacing;
    return Number.parseFloat(style?.letterSpacing) || 0;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
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
      this.smoothCloseResolver = null;
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
      const transitionFrames = this.mode === 'speaking' && this.speakFrames.length
        ? this.speakFrames
        : (this.idleFrames.length ? this.idleFrames : this.speakFrames);
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

      const areaStyle = window.getComputedStyle(area);
      const padTop = Number.parseFloat(areaStyle.paddingTop) || 6;
      const padRight = Number.parseFloat(areaStyle.paddingRight) || 0;
      const padLeft = Number.parseFloat(areaStyle.paddingLeft) || 0;
      const textStyle = window.getComputedStyle(refs.dialogueText);
      const font = textStyle.font || constants.N64_TEXT_FONT;
      const letterSpacing = getDialogueLetterSpacing(textStyle);
      const clipWidth = Math.max(1, width - padLeft - padRight);

      hiCtx.clearRect(0, 0, width, height);
      hiCtx.save();
      hiCtx.beginPath();
      hiCtx.rect(padLeft, padTop, clipWidth, 2 * constants.N64_TEXT_LINE_HEIGHT);
      hiCtx.clip();
      hiCtx.font = font;

      if ('letterSpacing' in hiCtx) {
        try {
          hiCtx.letterSpacing = `${letterSpacing}px`;
        } catch { }
      }

      hiCtx.textBaseline = 'top';
      hiCtx.fillStyle = '#ffffff';
      hiCtx.shadowColor = 'transparent';
      hiCtx.shadowOffsetX = 0;
      hiCtx.shadowOffsetY = 0;
      hiCtx.shadowBlur = 0;

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
          const italic = characterElement.classList.contains('dialogue-char-italic');
          const strikethrough = characterElement.classList.contains('dialogue-char-strikethrough');
          const shakeSample = emphasized ? getDialogueShakeSample(elapsed, index, 1) : null;
          const shakeX = shakeSample ? shakeSample.x : 0;
          const shakeY = shakeSample ? shakeSample.y : 0;

          if (italic) {
            hiCtx.font = `italic ${font}`;
          } else {
            hiCtx.font = font;
          }

          hiCtx.fillStyle = '#ffffff';
          hiCtx.fillText(characterText, x + shakeX, y + shakeY);
          
          const textWidth = hiCtx.measureText(characterText).width;

          if (strikethrough) {
            const lineY = y + shakeY + 16;
            hiCtx.fillRect(x + shakeX, lineY, textWidth, 3);
          }

          x += textWidth + letterSpacing;
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

    if (character.italic && /\S/.test(character.value)) {
      characterSpan.classList.add('dialogue-char-italic');
    }

    if (character.strikethrough && /\S/.test(character.value)) {
      characterSpan.classList.add('dialogue-char-strikethrough');
    }

    return characterSpan;
  }

  function appendDialogueCharacter(lineElement, character, index) {
    if (!lineElement) return;
    lineElement.appendChild(createDialogueCharacterElement(character, index));
    syncN64ShakeLoop();
  }

  function createDialogueLine(characters) {
    return {
      text: characters.map((character) => character.value).join(''),
      characters,
    };
  }

  function getDialogueWrapMetrics() {
    if (!refs.dialogueTextArea || !refs.dialogueText) return null;

    const textStyle = window.getComputedStyle(refs.dialogueText);
    const areaStyle = window.getComputedStyle(refs.dialogueTextArea);
    const effectiveLetterSpacing = getDialogueLetterSpacing(textStyle);
    const paddingLeft = Number.parseFloat(areaStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(areaStyle.paddingRight) || 0;
    const measuredWidth = Math.floor(refs.dialogueTextArea.clientWidth - paddingLeft - paddingRight);

    if (measuredWidth <= 0) return null;

    if (!dialogueMeasureContext) {
      const canvas = document.createElement('canvas');
      dialogueMeasureContext = canvas.getContext('2d');
    }

    if (!dialogueMeasureContext) return null;

    const font = textStyle.font || constants.N64_TEXT_FONT;
    dialogueMeasureContext.font = font;

    return {
      ctx: dialogueMeasureContext,
      fontKey: `${font}|${effectiveLetterSpacing}`,
      letterSpacing: effectiveLetterSpacing,
      maxWidth: measuredWidth,
    };
  }

  function measureDialogueCharactersWidth(characters, metrics) {
    if (!metrics || characters.length === 0) return 0;

    const text = characters.map((character) => character.value).join('');
    const cacheKey = `${metrics.fontKey}|line|${text}`;
    if (dialogueMeasureCache.has(cacheKey)) {
      return dialogueMeasureCache.get(cacheKey);
    }

    let width = 0;

    characters.forEach((character, index) => {
      const charCacheKey = `${metrics.fontKey}|char|${character.value}`;
      let charWidth = dialogueMeasureCache.get(charCacheKey);

      if (typeof charWidth !== 'number') {
        charWidth = metrics.ctx.measureText(character.value).width;
        dialogueMeasureCache.set(charCacheKey, charWidth);
      }

      width += charWidth;
      if (index < characters.length - 1) {
        width += metrics.letterSpacing;
      }
    });

    if (dialogueMeasureCache.size > 600) {
      dialogueMeasureCache.clear();
    }

    dialogueMeasureCache.set(cacheKey, width);
    return width;
  }

  function splitDialogueTextIntoRenderLines(text) {
    const metrics = getDialogueWrapMetrics();
    if (!metrics) {
      return model.splitStyledTextIntoLines(text);
    }

    return model.splitStyledTextIntoLines(text, {
      maxUnits: metrics.maxWidth,
      measureCharacters(characters) {
        return measureDialogueCharactersWidth(characters, metrics);
      },
    });
  }

  function buildDialogueInputHighlightMarkup(value) {
    const source = String(value || '');
    const segments = [];
    let emphasis = false;
    let italic = false;
    let strikethrough = false;
    const pairedShakeStarts = model.getPairedDialogueMarkerStarts(source, '**');
    const pairedItalicStarts = model.getPairedDialogueMarkerStarts(source, '_');
    const pairedStrikeStarts = model.getPairedDialogueMarkerStarts(source, '~~');
    let runStart = 0;

    function pushRun(endIndex) {
      if (endIndex <= runStart) return;
      const classes = ['text-input-plain'];
      if (emphasis) classes.push('text-input-emphasis');
      if (italic) classes.push('text-input-italic');
      if (strikethrough) classes.push('text-input-strikethrough');
      segments.push(`<span class="${classes.join(' ')}">${escapeHtml(source.slice(runStart, endIndex))}</span>`);
    }

    for (let index = 0; index < source.length; index += 1) {
      if (source.startsWith('**', index) && pairedShakeStarts.has(index)) {
        pushRun(index);
        segments.push('<span class="text-input-modifier">**</span>');
        emphasis = !emphasis;
        runStart = index + 2;
        index += 1;
        continue;
      }

      if (source.startsWith('~~', index) && pairedStrikeStarts.has(index)) {
        pushRun(index);
        segments.push('<span class="text-input-modifier text-input-modifier-strike">~~</span>');
        strikethrough = !strikethrough;
        runStart = index + 2;
        index += 1;
        continue;
      }

      if (source.startsWith('_', index) && pairedItalicStarts.has(index)) {
        pushRun(index);
        segments.push('<span class="text-input-modifier text-input-modifier-italic">_</span>');
        italic = !italic;
        runStart = index + 1;
        continue;
      }

      if (source.startsWith('**', index) || source.startsWith('~~', index)) {
        pushRun(index);
        segments.push(`<span class="text-input-plain">${escapeHtml(source.slice(index, index + 2))}</span>`);
        runStart = index + 2;
        index += 1;
        continue;
      }

      if (source.startsWith('_', index)) {
        pushRun(index);
        segments.push(`<span class="text-input-plain">${escapeHtml(source.slice(index, index + 1))}</span>`);
        runStart = index + 1;
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

    refs.dialogueInputHighlight.style.paddingTop = computed.paddingTop;
    refs.dialogueInputHighlight.style.paddingRight = computed.paddingRight;
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

  function updateFormatToolbarVisibility() {
    if (!refs.input || !refs.formatToolbar) return;
    const hasSelection = document.activeElement === refs.input && refs.input.selectionStart !== refs.input.selectionEnd;
    refs.formatToolbar.classList.toggle('hidden', !hasSelection);
  }

  function applyModifierToSelection(modifier) {
    if (!refs.input) return;
    const start = refs.input.selectionStart;
    const end = refs.input.selectionEnd;
    if (start === end) return;
    
    const value = refs.input.value;
    const before = value.substring(0, start);
    const selected = value.substring(start, end);
    const after = value.substring(end);
    
    const isWrapped = before.endsWith(modifier) && after.startsWith(modifier);
    
    let newValue;
    let newStart;
    let newEnd;

    if (isWrapped) {
      newValue = before.slice(0, -modifier.length) + selected + after.slice(modifier.length);
      newStart = start - modifier.length;
      newEnd = end - modifier.length;
    } else {
      newValue = before + modifier + selected + modifier + after;
      newStart = start + modifier.length;
      newEnd = end + modifier.length;
    }
    
    refs.input.value = newValue;
    refs.input.setSelectionRange(newStart, newEnd);
    refs.input.focus();
    normalizeDialogueInput();
    updateFormatToolbarVisibility();
  }

  function syncCharacterSearchClearButton() {
    if (!refs.characterSearchClear || !refs.characterSearchInput) return;
    refs.characterSearchClear.hidden = refs.characterSearchInput.value.length === 0;
  }

  function updateFastForwardAvailability(canFastForward) {
    if (!refs.btnFastForward) return;
    setActionButtonBlocked(refs.btnFastForward, !canFastForward);
    refs.btnFastForward.classList.toggle('fast-forwarding', state.isFastForwarding);
    refs.btnFastForward.title = canFastForward ? 'Hold Shift + Space to fast forward' : 'Fast forward';
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

    document.querySelectorAll('.character-pack-section').forEach((section) => {
      const hasVisibleButtons = Array.from(section.querySelectorAll('.char-btn')).some((button) => (
        !button.classList.contains('search-hidden') && !button.classList.contains('hidden-broken')
      ));
      section.classList.toggle('pack-hidden', !hasVisibleButtons);
      section.classList.remove('first-visible-pack');
    });

    const firstVisiblePack = document.querySelector('.character-pack-section:not(.pack-hidden)');
    firstVisiblePack?.classList.add('first-visible-pack');

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

  let backgroundPackSections = [];
  let activeBackgroundPackIdx = 0;

  function getBackgroundPackSectionIndexById(packId) {
    return backgroundPackSections.findIndex((section) => section.dataset.packId === packId);
  }

  function getActiveBackgroundPackId() {
    return backgroundPackSections[activeBackgroundPackIdx]?.dataset.packId || null;
  }

  function getVisibleBackgroundPackIndices() {
    return backgroundPackSections
      .map((_section, i) => i)
      .filter((i) => !backgroundPackSections[i].classList.contains('pack-hidden'));
  }

  function updateBackgroundPackNavArrows() {
    const visibleIndices = getVisibleBackgroundPackIndices();
    const currentPos = visibleIndices.indexOf(activeBackgroundPackIdx);
    const isFirst = currentPos <= 0;
    const isLast = currentPos >= visibleIndices.length - 1;

    backgroundPackSections.forEach((section) => {
      const prev = section.querySelector('.pack-nav-prev');
      const next = section.querySelector('.pack-nav-next');
      if (prev) prev.classList.toggle('hidden', isFirst);
      if (next) next.classList.toggle('hidden', isLast);
    });
  }

  function showBackgroundPack(index) {
    if (!backgroundPackSections.length) {
      activeBackgroundPackIdx = 0;
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, backgroundPackSections.length - 1));
    backgroundPackSections.forEach((section, i) => {
      section.classList.toggle('pack-active', i === safeIndex);
    });
    activeBackgroundPackIdx = safeIndex;
    updateBackgroundPackNavArrows();
    requestAnimationFrame(() => {
      syncBackgroundPackVerticalAlignment();
      const activeSection = backgroundPackSections[activeBackgroundPackIdx];
      if (activeSection) {
        const grid = activeSection.querySelector('.background-pack-grid');
        if (grid) grid.dispatchEvent(new Event('scroll'));
      }
    });
  }

  function navigateBackgroundPack(direction) {
    const visibleIndices = getVisibleBackgroundPackIndices();
    if (visibleIndices.length === 0) return;

    const currentPos = visibleIndices.indexOf(activeBackgroundPackIdx);
    const nextPos = currentPos + direction;

    if (nextPos >= 0 && nextPos < visibleIndices.length) {
      audioService.playMenuSound('click');
      showBackgroundPack(visibleIndices[nextPos]);
    }
  }

  function syncBackgroundPackVerticalAlignment() {
    const isCompactLayout = window.matchMedia('(max-width: 720px)').matches;

    backgroundPackSections.forEach((section) => {
      const packTop = section.querySelector('.background-pack-top');
      const packGrid = section.querySelector('.background-pack-grid');
      if (!packTop || !packGrid) return;

      const gridStyle = window.getComputedStyle(packGrid);
      const paddingTop = Number.parseFloat(gridStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(gridStyle.paddingBottom) || 0;
      const visualPaddingOffset = (paddingBottom - paddingTop) / 2;
      const offset = isCompactLayout
        ? 0
        : (-(packTop.getBoundingClientRect().height / 2) + visualPaddingOffset);

      packGrid.style.setProperty('--background-pack-grid-offset', `${offset}px`);
      const gridWrapper = packGrid.closest('.background-pack-grid-wrapper');
      if (gridWrapper) gridWrapper.style.setProperty('--background-pack-grid-offset', `${offset}px`);
    });
  }

  function applyBackgroundFilters() {
    document.querySelectorAll('.background-card.unavailable').forEach((button) => {
      button.classList.toggle('hidden-broken', state.hideBrokenBackgrounds);
    });

    document.querySelectorAll('.background-pack-section').forEach((section) => {
      const hasVisibleButtons = Array.from(section.querySelectorAll('.background-card, .background-pack-anchor')).some((button) => (
        !button.classList.contains('hidden-broken')
      ));
      section.classList.toggle('pack-hidden', !hasVisibleButtons);
    });

    const visibleIndices = getVisibleBackgroundPackIndices();
    if (visibleIndices.length > 0 && !visibleIndices.includes(activeBackgroundPackIdx)) {
      showBackgroundPack(visibleIndices[0]);
    } else {
      updateBackgroundPackNavArrows();
    }
  }

  function getBackgroundPackScrollState() {
    const scrollLeftByPackId = {};

    backgroundPackSections.forEach((section) => {
      const packId = section.dataset.packId;
      const grid = section.querySelector('.background-pack-grid');
      if (!packId || !grid) return;
      scrollLeftByPackId[packId] = grid.scrollLeft;
    });

    return scrollLeftByPackId;
  }

  function restoreBackgroundPackState({
    activePackId = null,
    scrollLeftByPackId = {},
  } = {}) {
    const visibleIndices = getVisibleBackgroundPackIndices();
    let targetIndex = getBackgroundPackSectionIndexById(activePackId);

    if (targetIndex < 0 || !visibleIndices.includes(targetIndex)) {
      targetIndex = visibleIndices[0] ?? 0;
    }

    showBackgroundPack(targetIndex);

    requestAnimationFrame(() => {
      backgroundPackSections.forEach((section) => {
        const packId = section.dataset.packId;
        const grid = section.querySelector('.background-pack-grid');
        if (!packId || !grid) return;

        const nextScrollLeft = Number(scrollLeftByPackId?.[packId]);
        if (Number.isFinite(nextScrollLeft)) {
          const previousBehavior = grid.style.scrollBehavior;
          grid.style.scrollBehavior = 'auto';
          grid.scrollLeft = Math.max(0, nextScrollLeft);
          void grid.offsetWidth;
          grid.style.scrollBehavior = previousBehavior;
        }

        grid.dispatchEvent(new Event('scroll'));
      });
    });
  }

  function stopCardAnim(characterId) {
    const cardKeys = cardAnimState.has(characterId)
      ? [characterId]
      : Array.from(characterCardKeysById.get(characterId) || []);

    cardKeys.forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;
      clearInterval(cardState.timer);
      clearTimeout(cardState.timer);
      cardState.timer = null;
      cardState.runId = (cardState.runId || 0) + 1;
      cardState.mode = 'stopped';
    });
  }

  function stopAllCardAnimations() {
    Array.from(cardAnimState.keys()).forEach((cardKey) => {
      stopCardAnim(cardKey);
    });
  }

  function setCardFrame(cardState, frames, index) {
    const framePath = frames[index];
    if (!framePath) return;
    cardState.img.src = fileToSrc(framePath);
    cardState.img.classList.remove('missing-char-icon');
  }

  function restoreCardPreviewImage(cardState) {
    if (!cardState?.defaultImagePath) return;
    cardState.img.src = fileToSrc(cardState.defaultImagePath);
    cardState.img.classList.toggle('missing-char-icon', cardState.usesMissingIcon === true);
  }

  function startCardIdleAnim(characterId) {
    const cardKeys = cardAnimState.has(characterId)
      ? [characterId]
      : Array.from(characterCardKeysById.get(characterId) || []);

    cardKeys.forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;

      const frames = cardState.char.idleFrames;
      if (!frames?.length) return;

      clearInterval(cardState.timer);
      clearTimeout(cardState.timer);
      cardState.timer = null;
      cardState.runId = (cardState.runId || 0) + 1;
      const runId = cardState.runId;
      cardState.mode = 'idle';
      cardState.frameIndex = 0;
      cardState.direction = 1;
      setCardFrame(cardState, frames, cardState.frameIndex);

      const lastFrame = Math.max(0, frames.length - 1);
      const schedule = () => {
        if (cardState.runId !== runId || cardState.mode !== 'idle') return;
        const hold = 1500 + Math.floor(Math.random() * 2200);
        cardState.timer = setTimeout(playCycle, hold);
      };

      const playCycle = () => {
        if (cardState.runId !== runId || cardState.mode !== 'idle') return;

        let index = 1;
        let direction = 1;
        const step = () => {
          if (cardState.runId !== runId || cardState.mode !== 'idle') return;

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
    });
  }

  function startCardSpeakThenIdle(characterId) {
    const cardKeys = cardAnimState.has(characterId)
      ? [characterId]
      : Array.from(characterCardKeysById.get(characterId) || []);

    cardKeys.forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;

      const speakFrames = cardState.char.speakFrames;
      if (!speakFrames?.length) {
        startCardIdleAnim(cardKey);
        return;
      }

      clearInterval(cardState.timer);
      clearTimeout(cardState.timer);
      cardState.timer = null;
      cardState.runId = (cardState.runId || 0) + 1;
      const runId = cardState.runId;
      cardState.mode = 'speak';
      cardState.frameIndex = 0;
      cardState.direction = 1;
      setCardFrame(cardState, speakFrames, cardState.frameIndex);

      cardState.timer = setInterval(() => {
        if (cardState.runId !== runId || cardState.mode !== 'speak') return;

        cardState.frameIndex += cardState.direction;
        if (cardState.frameIndex >= speakFrames.length - 1) cardState.direction = -1;
        else if (cardState.frameIndex <= 0) {
          startCardIdleAnim(cardKey);
          return;
        }

        setCardFrame(cardState, speakFrames, cardState.frameIndex);
      }, 70);
    });
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

  function buildCharacterGrid({
    onCharacterSelected = null,
    onCharacterContextMenu = null,
  } = {}) {
    refs.charGrid.innerHTML = '';
    stopAllCardAnimations();
    cardAnimState.clear();
    characterCardKeysById.clear();
    const fragment = document.createDocumentFragment();
    const missingCharacterFallbackPath = env.path.join(env.genericImgDir, '2.png');
    const hasMissingCharacterFallback = env.fs.existsSync(missingCharacterFallbackPath);
    const charactersByPack = new Map();
    const charactersById = new Map(characters.map((character) => [character.id, character]));
    const favoriteCharacterIds = new Set(state.favoriteCharacterIds || []);

    characters.forEach((character) => {
      if (!charactersByPack.has(character.packId)) {
        charactersByPack.set(character.packId, {
          id: character.packId,
          displayName: character.packDisplayName,
          characters: [],
        });
      }

      charactersByPack.get(character.packId).characters.push(character);
    });

    const buildSpecialPack = (id, displayName, characterIds) => {
      const packCharacters = characterIds
        .map((characterId) => charactersById.get(characterId))
        .filter((character) => Boolean(character));

      if (packCharacters.length === 0) return null;

      return {
        id,
        displayName,
        characters: packCharacters,
      };
    };

    const specialPacks = [
      buildSpecialPack('__favorites__', 'Favorites', state.favoriteCharacterIds || []),
      buildSpecialPack('__recent__', 'Recent', state.recentCharacterIds || []),
    ].filter((pack) => Boolean(pack));

    const regularPacks = Array.isArray(packs) && packs.length > 0
      ? packs
        .map((pack) => ({
          id: pack.id,
          displayName: pack.displayName,
          characters: charactersByPack.get(pack.id)?.characters || [],
        }))
        .filter((pack) => pack.characters.length > 0)
      : Array.from(charactersByPack.values());
    const orderedPacks = [...specialPacks, ...regularPacks];

    orderedPacks.forEach((pack) => {
      const packSection = document.createElement('section');
      packSection.className = 'character-pack-section';
      packSection.dataset.packId = pack.id;

      const packHeading = document.createElement('span');
      packHeading.className = 'character-pack-heading';
      packHeading.textContent = pack.displayName;

      const packSeparator = document.createElement('span');
      packSeparator.className = 'character-pack-separator';
      packSeparator.setAttribute('aria-hidden', 'true');
      packSection.appendChild(packSeparator);
      packSection.appendChild(packHeading);

      const packStrip = document.createElement('div');
      packStrip.className = 'character-pack-strip';

      pack.characters.forEach((character) => {
        const cardKey = `${pack.id}::${character.id}::${packStrip.childElementCount}`;
        const button = document.createElement('button');
        button.className = 'char-btn';
        button.dataset.id = character.id;
        button.dataset.cardKey = cardKey;
        button.dataset.packId = character.packId;
        button.dataset.searchIndex = model.normalizeCharacterSearch([
          character.displayName,
          character.folderName,
          character.packDisplayName,
          character.packId,
        ].join(' '));
        button.disabled = !character.isAvailable;
        if (!character.isAvailable) button.classList.add('unavailable');
        button.title = character.displayName;

        const spriteWrap = document.createElement('div');
        spriteWrap.className = 'char-btn-sprite';

        const spriteImage = document.createElement('img');
        const previewPath = character.previewSpritePath || null;
        const defaultImagePath = previewPath || (hasMissingCharacterFallback ? missingCharacterFallbackPath : null);
        const usesMissingIcon = !previewPath && Boolean(defaultImagePath);
        if (defaultImagePath) spriteImage.src = fileToSrc(defaultImagePath);
        spriteImage.classList.toggle('missing-char-icon', usesMissingIcon);

        spriteImage.alt = character.displayName;
        spriteWrap.appendChild(spriteImage);

        const label = document.createElement('span');
        label.className = 'char-btn-label';

        if (favoriteCharacterIds.has(character.id)) {
          label.appendChild(createFavoriteHeartIcon());
        }

        const labelText = document.createElement('span');
        labelText.className = 'char-btn-label-text';
        labelText.textContent = character.displayName;
        label.appendChild(labelText);

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

        cardAnimState.set(cardKey, {
          timer: null,
          runId: 0,
          frameIndex: 0,
          direction: 1,
          mode: 'idle',
          img: spriteImage,
          defaultImagePath,
          usesMissingIcon,
          char: character,
        });
        if (!characterCardKeysById.has(character.id)) {
          characterCardKeysById.set(character.id, new Set());
        }
        characterCardKeysById.get(character.id).add(cardKey);

        button.addEventListener('mouseenter', () => {
          if (button.disabled) return;
          if (state.selectedCharacter?.id === character.id) return;
          startCardIdleAnim(cardKey);
        });

        button.addEventListener('mouseleave', () => {
          if (button.disabled) return;

          if (state.selectedCharacter?.id === character.id) {
            const cardState = cardAnimState.get(cardKey);
            if (cardState?.mode !== 'speak') startCardIdleAnim(cardKey);
            return;
          }

          stopCardAnim(cardKey);
          restoreCardPreviewImage(cardAnimState.get(cardKey));
        });

        button.addEventListener('click', () => {
          if (button.disabled) return;
          const wasActive = state.selectedCharacter?.id === character.id;
          onCharacterSelected?.(character, wasActive);
        });

        button.addEventListener('contextmenu', (event) => {
          if (button.disabled) return;
          event.preventDefault();
          onCharacterContextMenu?.(character, event);
        });

        packStrip.appendChild(button);
      });

      packSection.appendChild(packStrip);
      fragment.appendChild(packSection);
    });

    refs.charGrid.appendChild(fragment);

    applyCharacterFilters();
  }

  function buildBackgroundGrid({
    onBackgroundSelected = null,
    onBackgroundContextMenu = null,
  } = {}) {
    if (!refs.backgroundsSections) return;

    refs.backgroundsSections.innerHTML = '';
    backgroundPackSections = [];
    activeBackgroundPackIdx = 0;
    const fragment = document.createDocumentFragment();
    const backgroundsByPack = new Map();
    const backgroundsById = new Map(backgrounds.map((background) => [background.id, background]));
    const favoriteBackgroundIds = new Set(state.favoriteBackgroundIds || []);

    backgrounds.forEach((background) => {
      if (!backgroundsByPack.has(background.packId)) {
        backgroundsByPack.set(background.packId, {
          id: background.packId,
          displayName: background.packDisplayName,
          backgrounds: [],
        });
      }

      backgroundsByPack.get(background.packId).backgrounds.push(background);
    });

    const buildSpecialPack = (id, displayName, backgroundIds) => {
      const packBackgrounds = backgroundIds
        .map((backgroundId) => backgroundsById.get(backgroundId))
        .filter((background) => Boolean(background));

      if (packBackgrounds.length === 0) return null;

      return {
        id,
        displayName,
        backgrounds: packBackgrounds,
      };
    };

    function attachBackgroundCardInteractions(button, onActivate) {
      let backgroundCardClickTimer = 0;

      const clearPressedState = () => {
        button.classList.remove('is-pressing');
      };

      const replayClickAnimation = () => {
        window.clearTimeout(backgroundCardClickTimer);
        button.classList.remove('is-clicked');
        void button.offsetWidth;
        button.classList.add('is-clicked');
        backgroundCardClickTimer = window.setTimeout(() => {
          button.classList.remove('is-clicked');
        }, 420);
      };

      button.addEventListener('pointerdown', (event) => {
        if (button.disabled || event.button !== 0) return;
        button.classList.add('is-pressing');
      });

      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((eventName) => {
        button.addEventListener(eventName, clearPressedState);
      });

      button.addEventListener('click', () => {
        if (button.disabled) return;
        clearPressedState();
        replayClickAnimation();
        onActivate();
      });
    }

    const computeBackgroundCardRotation = (background, index) => {
      const seed = `${background?.id || ''}:${background?.packId || ''}:${index}`;
      let hash = 0;
      for (let i = 0; i < seed.length; i += 1) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const normalized = ((Math.abs(hash) % 1000) / 1000);
      const rotation = (normalized * 8) - 4;
      return `${rotation.toFixed(2)}deg`;
    };

    const specialPacks = [
      buildSpecialPack('__favorites__', 'Favorites', state.favoriteBackgroundIds || []),
      buildSpecialPack('__recent__', 'Recent', state.recentBackgroundIds || []),
    ].filter((pack) => Boolean(pack));

    const regularPacks = Array.isArray(backgroundPacks) && backgroundPacks.length > 0
      ? backgroundPacks
        .map((pack) => ({
          id: pack.id,
          displayName: pack.displayName,
          backgrounds: backgroundsByPack.get(pack.id)?.backgrounds || [],
        }))
        .filter((pack) => (
          pack.backgrounds.length > 0
          || String(pack.id || '').toLowerCase() === 'custom'
        ))
      : Array.from(backgroundsByPack.values());
    const orderedPacks = [...specialPacks, ...regularPacks];

    orderedPacks.forEach((pack) => {
      const isCustomPack = String(pack.id || '').toLowerCase() === 'custom';
      const packSection = document.createElement('section');
      packSection.className = 'background-pack-section';
      packSection.dataset.packId = pack.id;

      const packTop = document.createElement('div');
      packTop.className = 'background-pack-top';

      const packHeader = document.createElement('div');
      packHeader.className = 'background-pack-header';

      const prevArrow = document.createElement('button');
      prevArrow.className = 'background-pack-nav-arrow pack-nav-prev';
      prevArrow.type = 'button';
      prevArrow.title = 'Previous pack';
      prevArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      prevArrow.addEventListener('click', () => navigateBackgroundPack(-1));

      const headerInfo = document.createElement('div');
      headerInfo.className = 'background-pack-header-info';

      const packHeading = document.createElement('span');
      packHeading.className = 'background-pack-heading';
      packHeading.textContent = pack.displayName;

      const packCount = document.createElement('span');
      packCount.className = 'background-pack-count';
      packCount.textContent = `${pack.backgrounds.length} background${pack.backgrounds.length === 1 ? '' : 's'}`;

      const nextArrow = document.createElement('button');
      nextArrow.className = 'background-pack-nav-arrow pack-nav-next';
      nextArrow.type = 'button';
      nextArrow.title = 'Next pack';
      nextArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      nextArrow.addEventListener('click', () => navigateBackgroundPack(1));

      const packDivider = document.createElement('span');
      packDivider.className = 'background-pack-divider';
      packDivider.setAttribute('aria-hidden', 'true');

      headerInfo.appendChild(packHeading);
      headerInfo.appendChild(packCount);
      packHeader.appendChild(prevArrow);
      packHeader.appendChild(headerInfo);
      packHeader.appendChild(nextArrow);
      packTop.appendChild(packHeader);
      packTop.appendChild(packDivider);
      packSection.appendChild(packTop);

      const packGrid = document.createElement('div');
      packGrid.className = 'background-pack-grid';

      if (isCustomPack) {
        const uploadButton = document.createElement('button');
        uploadButton.className = 'bg-upload-btn background-pack-anchor';
        uploadButton.dataset.packId = pack.id;
        uploadButton.type = 'button';
        uploadButton.title = 'Upload background';
        uploadButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
          <path d="M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
        </svg>`;
        attachBackgroundCardInteractions(uploadButton, () => {
          audioService.playMenuSound('click');
        });
        packGrid.appendChild(uploadButton);
      }

      pack.backgrounds.forEach((background, index) => {
        const button = document.createElement('button');
        button.className = 'background-card';
        button.dataset.id = background.id;
        button.dataset.packId = pack.id;
        button.style.setProperty('--card-rotation', computeBackgroundCardRotation(background, index));
        button.type = 'button';
        button.title = background.displayName;
        button.disabled = !background.isAvailable;
        if (!background.isAvailable) button.classList.add('unavailable');
        if (index === 0 && pack.backgrounds.length > 2) button.classList.add('background-card-featured');
        if (!background.hasBuiltImage) button.classList.add('background-card-fallback');

        const photo = document.createElement('div');
        photo.className = 'background-card-photo';

        const image = document.createElement('img');
        image.className = 'background-card-image';
        image.alt = background.displayName;
        image.loading = 'lazy';
        if (background.previewImagePath) image.src = fileToSrc(background.previewImagePath);
        photo.appendChild(image);

        if (favoriteBackgroundIds.has(background.id)) {
          photo.appendChild(createFavoriteHeartIcon('background-card-favorite-heart'));
        }

        const copy = document.createElement('div');
        copy.className = 'background-card-copy';

        const title = document.createElement('span');
        title.className = 'background-card-title';
        title.textContent = truncateTextToFit(background.displayName, 124);

        const meta = document.createElement('span');
        meta.className = 'background-card-meta';
        meta.textContent = background.packDisplayName;

        copy.appendChild(title);
        if (!isCustomPack) copy.appendChild(meta);
        button.appendChild(photo);
        button.appendChild(copy);

        // Randomly add tape decoration to some cards for organic polaroid feel
        const tapeSeed = `tape:${background?.id || ''}:${index}`;
        let tapeHash = 0;
        for (let ti = 0; ti < tapeSeed.length; ti += 1) {
          tapeHash = ((tapeHash << 5) - tapeHash) + tapeSeed.charCodeAt(ti);
          tapeHash |= 0;
        }
        const tapeChance = (Math.abs(tapeHash) % 1000) / 1000;
        if (tapeChance < 0.45) {
          const tape = document.createElement('div');
          tape.className = 'background-card-tape';
          const tapeLeftPercent = 20 + ((Math.abs(tapeHash >> 3) % 400) / 10);
          const tapeRotation = ((Math.abs(tapeHash >> 7) % 300) / 10) - 15;
          const tapeWidth = 32 + ((Math.abs(tapeHash >> 11) % 160) / 10);
          tape.style.left = `${tapeLeftPercent}%`;
          tape.style.transform = `translateX(-50%) rotate(${tapeRotation.toFixed(1)}deg)`;
          tape.style.width = `${tapeWidth.toFixed(0)}px`;
          button.appendChild(tape);
        }

        attachBackgroundCardInteractions(button, () => {
          const wasActive = state.selectedBackground?.id === background.id;
          onBackgroundSelected?.(background, wasActive);
        });
        button.addEventListener('contextmenu', (event) => {
          if (button.disabled) return;
          event.preventDefault();
          onBackgroundContextMenu?.(background, event);
        });

        packGrid.appendChild(button);
      });

      const gridWrapper = document.createElement('div');
      gridWrapper.className = 'background-pack-grid-wrapper';

      const scrollArrowLeft = document.createElement('div');
      scrollArrowLeft.className = 'bg-scroll-arrow bg-scroll-arrow-left hidden';
      const scrollArrowLeftHit = document.createElement('button');
      scrollArrowLeftHit.className = 'bg-scroll-arrow-hit';
      scrollArrowLeftHit.type = 'button';
      scrollArrowLeftHit.title = 'Scroll left';
      scrollArrowLeftHit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>';
      scrollArrowLeft.appendChild(scrollArrowLeftHit);

      const scrollArrowRight = document.createElement('div');
      scrollArrowRight.className = 'bg-scroll-arrow bg-scroll-arrow-right';
      const scrollArrowRightHit = document.createElement('button');
      scrollArrowRightHit.className = 'bg-scroll-arrow-hit';
      scrollArrowRightHit.type = 'button';
      scrollArrowRightHit.title = 'Scroll right';
      scrollArrowRightHit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
      scrollArrowRight.appendChild(scrollArrowRightHit);

      function updateBgScrollArrows() {
        const atStart = packGrid.scrollLeft <= 2;
        const atEnd = packGrid.scrollLeft + packGrid.clientWidth >= packGrid.scrollWidth - 2;
        scrollArrowLeft.classList.toggle('hidden', atStart);
        scrollArrowRight.classList.toggle('hidden', atEnd);
      }

      packGrid.addEventListener('scroll', updateBgScrollArrows);
      requestAnimationFrame(updateBgScrollArrows);

      const BG_SCROLL_STEP = 180;
      scrollArrowLeftHit.addEventListener('click', () => {
        if (scrollArrowLeft.classList.contains('hidden')) return;
        audioService.playMenuSound('arrowLeft');
        packGrid.scrollBy({ left: -BG_SCROLL_STEP, behavior: 'smooth' });
      });
      scrollArrowRightHit.addEventListener('click', () => {
        if (scrollArrowRight.classList.contains('hidden')) return;
        audioService.playMenuSound('arrowRight');
        packGrid.scrollBy({ left: BG_SCROLL_STEP, behavior: 'smooth' });
      });

      gridWrapper.appendChild(packGrid);
      packSection.appendChild(gridWrapper);
      packSection.appendChild(scrollArrowLeft);
      packSection.appendChild(scrollArrowRight);
      fragment.appendChild(packSection);
      backgroundPackSections.push(packSection);
    });

    refs.backgroundsSections.appendChild(fragment);
    showBackgroundPack(0);
    updateSelectedBackgroundCard(state.selectedBackground);
    applyBackgroundFilters();
  }

  function updateSelectedCharacterCard(character) {
    document.querySelectorAll('.char-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.id === character?.id);
      const buttonCardKey = button.dataset.cardKey;
      if (!buttonCardKey) return;

      const buttonCharacterId = button.dataset.id;
      if (!buttonCharacterId) return;

      const cardState = cardAnimState.get(buttonCardKey);
      if (!cardState) return;

      if (buttonCharacterId === character?.id) {
        startCardIdleAnim(buttonCardKey);
        return;
      }

      stopCardAnim(buttonCardKey);
      restoreCardPreviewImage(cardState);
    });
  }

  function updateSelectedBackgroundCard(background) {
    const selectedBackgroundId = background?.id || null;
    document.querySelectorAll('.background-card').forEach((button) => {
      button.classList.toggle('active', Boolean(selectedBackgroundId) && button.dataset.id === selectedBackgroundId);
    });
  }

  function setPreviewBackgroundLayer(layer, imageValue, hasImage) {
    if (!layer) return;

    layer.style.setProperty('--preview-layer-image', hasImage ? imageValue : 'none');
    layer.classList.toggle('has-image', hasImage);
  }

  function commitPreviewBackground(imageValue, hasImage) {
    setPreviewBackgroundLayer(refs.previewBackgroundCurrent, imageValue, hasImage);
    setPreviewBackgroundLayer(refs.previewBackgroundNext, 'none', false);
    refs.previewArea?.classList.remove('is-transitioning-background', 'is-clearing-background');
    refs.previewArea?.classList.toggle('has-selected-background', hasImage);
    previewBackgroundPendingImage = imageValue;
    previewBackgroundPendingHasImage = hasImage;
  }

  function flushPreviewBackgroundTransition() {
    if (
      !refs.previewArea?.classList.contains('is-transitioning-background')
      && !refs.previewArea?.classList.contains('is-clearing-background')
    ) return;

    window.clearTimeout(previewBackgroundTransitionTimer);
    previewBackgroundTransitionTimer = 0;
    commitPreviewBackground(previewBackgroundPendingImage, previewBackgroundPendingHasImage);
  }

  function computeExpandedPreviewHeight() {
    if (!refs.app || !refs.bottombar) return 280;

    const storedHeight = refs.panelWrapper?.dataset?.naturalPanelHeight;
    const panelHeight = storedHeight ? Number(storedHeight) : (refs.panelWrapper?.offsetHeight ?? 200);
    return Math.max(120, refs.app.clientHeight - refs.bottombar.offsetHeight - panelHeight);
  }

  function resetPanelWrapperInlineStyles() {
    if (!refs.panelWrapper) return;

    refs.panelWrapper.style.height = '';
    refs.panelWrapper.style.flex = '';
    refs.panelWrapper.style.minHeight = '';
    refs.panelWrapper.style.overflow = '';
    refs.panelWrapper.style.transition = '';
    if (refs.flipCard) {
      refs.flipCard.style.overflow = '';
    }
  }

  function getPreviewPlaceholderPanelState() {
    return previewPlaceholderPanelIntent || state.activePanel || 'controls';
  }

  function shouldSuppressPreviewPlaceholder() {
    return previewPlaceholderExplicitSuppression
      || getPreviewPlaceholderPanelState() !== 'controls'
      || refs.dialogueContainer?.classList.contains('active');
  }

  function shouldAnimatePreviewContentExit() {
    return refs.dialogueContainer?.classList.contains('active') === true;
  }

  function syncPreviewPlaceholderState() {
    const suppressed = shouldSuppressPreviewPlaceholder();
    refs.previewArea?.classList.toggle('preview-placeholder-suppressed', suppressed);
    refs.placeholder?.classList.toggle('fade-out', suppressed);

    if (suppressed) {
      stopPlaceholderAnim();
      return;
    }

    startPlaceholderAnim();
  }

  function applySelectedBackground(background, isUserAction = false) {
    if (!refs.previewArea) return;

    const hasPreviewImage = Boolean(background?.previewImagePath);
    const nextImageValue = hasPreviewImage ? `url("${fileToSrc(background.previewImagePath)}")` : 'none';

    if (!refs.previewBackgroundCurrent || !refs.previewBackgroundNext) {
      refs.previewArea.style.setProperty('--preview-scene-image', nextImageValue);
      refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
      return;
    }

    flushPreviewBackgroundTransition();

    const currentHasImage = refs.previewBackgroundCurrent.classList.contains('has-image');
    const currentImageValue = currentHasImage
      ? (refs.previewBackgroundCurrent.style.getPropertyValue('--preview-layer-image').trim() || 'none')
      : 'none';

    if (currentHasImage === hasPreviewImage && currentImageValue === nextImageValue) {
      refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
      return;
    }

    if (prefersReducedMotion()) {
      commitPreviewBackground(nextImageValue, hasPreviewImage);
      return;
    }

    previewBackgroundPendingImage = nextImageValue;
    previewBackgroundPendingHasImage = hasPreviewImage;
    setPreviewBackgroundLayer(refs.previewBackgroundCurrent, currentImageValue, currentHasImage);
    setPreviewBackgroundLayer(refs.previewBackgroundNext, nextImageValue, hasPreviewImage);
    refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
    const isClearingBackground = currentHasImage && !hasPreviewImage;
    refs.previewArea.classList.remove('is-transitioning-background', 'is-clearing-background');
    void refs.previewArea.offsetWidth;
    refs.previewArea.classList.add(isClearingBackground ? 'is-clearing-background' : 'is-transitioning-background');

    previewBackgroundTransitionTimer = window.setTimeout(() => {
      previewBackgroundTransitionTimer = 0;
      commitPreviewBackground(previewBackgroundPendingImage, previewBackgroundPendingHasImage);
    }, PREVIEW_BACKGROUND_TRANSITION_MS + 40);

    if (hasPreviewImage && isUserAction) {
      const renderStackedText = (el, str) => {
        const arr = Array.from(str || '');
        const len = arr.length;
        el.innerHTML = arr.map((char, i) => {
          const z = len - i;
          if (char === ' ') return `<span class="space" style="z-index: ${z};">&nbsp;</span>`;
          return `<span style="z-index: ${z};">${char}</span>`;
        }).join('');
      };
      
      renderStackedText(refs.bannerTitle, background?.displayName || '');
      renderStackedText(refs.bannerSubtitle, background?.packDisplayName ? `( ${background.packDisplayName} )` : '');
      refs.banner.classList.remove('active');
      void refs.banner.offsetWidth;
      refs.banner.classList.add('active');
    } else if (!isUserAction || !hasPreviewImage) {
      refs.banner.classList.remove('active');
    }
  }

  function setPreviewPlaceholderSuppressed(suppressed) {
    previewPlaceholderExplicitSuppression = suppressed === true;
    syncPreviewPlaceholderState();
  }

  function setPreviewPlaceholderPanelIntent(panel) {
    previewPlaceholderPanelIntent = panel || null;
    syncPreviewPlaceholderState();
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
    flushPreviewBackgroundTransition();
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
    const panelHeight = Math.round(refs.panelWrapper?.getBoundingClientRect().height ?? 0);
    const targetPanelHeight = refs.app && refs.bottombar
      ? Math.max(panelHeight, refs.app.clientHeight - refs.bottombar.offsetHeight - constants.PREVIEW_STRIP_HEIGHT)
      : panelHeight;

    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${height}px`;
    refs.previewArea.style.overflow = 'hidden';

    if (refs.panelWrapper) {
      refs.panelWrapper.style.flex = '0 0 auto';
      refs.panelWrapper.style.minHeight = '0';
      refs.panelWrapper.style.height = `${panelHeight}px`;
      refs.panelWrapper.style.overflow = 'visible';
    }

    if (refs.flipCard) {
      refs.flipCard.style.overflow = 'hidden';
    }

    refs.app?.classList.add('settings-panel-open');
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    if (refs.panelWrapper) {
      refs.panelWrapper.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    }
    refs.previewArea.classList.add('preview-strip-collapsed', 'preview-settings-muted', 'preview-content-hidden');
    refs.previewArea.classList.toggle('preview-content-exiting', shouldAnimatePreviewContentExit());
    setPreviewPlaceholderSuppressed(true);

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
      if (refs.panelWrapper) {
        refs.panelWrapper.style.height = `${targetPanelHeight}px`;
      }
    });

    await model.sleep(constants.PREVIEW_COLLAPSE_MS + 40);
    resetPanelWrapperInlineStyles();
  }

  async function expandPreviewAfterControls(options = {}) {
    const keepPlaceholderSuppressed = options.keepPlaceholderSuppressed === true;
    const targetHeight = computeExpandedPreviewHeight();
    const revealPlaceholderOnly = !keepPlaceholderSuppressed
      && !refs.dialogueContainer?.classList.contains('active')
      && !prefersReducedMotion();
    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
    refs.previewArea.style.overflow = 'hidden';
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    setPreviewPlaceholderSuppressed(true);

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${targetHeight}px`;
      refs.previewArea.classList.remove('preview-settings-muted', 'preview-content-exiting');
    });

    await model.sleep(constants.PREVIEW_COLLAPSE_MS + 50);

    if (revealPlaceholderOnly && refs.previewAreaContent) {
      refs.previewAreaContent.style.transition = 'none';
    }

    refs.previewArea.classList.remove('preview-strip-collapsed', 'preview-content-hidden');
    refs.previewArea.style.height = '';
    refs.previewArea.style.flex = '';
    refs.previewArea.style.minHeight = '';
    refs.previewArea.style.overflow = '';
    refs.previewArea.style.transition = '';
    refs.app?.classList.remove('settings-panel-open');
    if (refs.panelWrapper) delete refs.panelWrapper.dataset.naturalPanelHeight;
    resetPanelWrapperInlineStyles();

    if (revealPlaceholderOnly && refs.previewAreaContent) {
      void refs.previewAreaContent.offsetWidth;
      refs.previewAreaContent.style.transition = '';
    }

    if (!keepPlaceholderSuppressed) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    setPreviewPlaceholderSuppressed(keepPlaceholderSuppressed);
    syncPreviewPlaceholderState();
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

    flushPreviewBackgroundTransition();
    refs.flipCard?.classList.remove('panel-flipping');
    if (refs.flipCard) refs.flipCard.style.transform = '';
    setFlipCardPanel(null);
    setFrontPanel('controls');
    setActiveBackPanel(null);
    refs.sleeveBackgrounds.classList.remove('active');
    refs.sleeveSettings.classList.remove('active');
    state.frontPanel = 'controls';
    state.activePanel = 'controls';
    refs.previewArea.classList.remove('preview-settings-muted', 'preview-strip-collapsed', 'preview-content-hidden', 'preview-content-exiting');
    setPreviewPlaceholderPanelIntent(null);
    setPreviewPlaceholderSuppressed(false);
    refs.previewArea.style.height = '';
    refs.previewArea.style.flex = '';
    refs.previewArea.style.minHeight = '';
    refs.previewArea.style.overflow = '';
    refs.previewArea.style.transition = '';
    refs.app?.classList.remove('settings-panel-open');
    if (refs.panelWrapper) delete refs.panelWrapper.dataset.naturalPanelHeight;
    resetPanelWrapperInlineStyles();
    syncSettingsLayoutMode('controls');
    syncPreviewPlaceholderState();
  }

  refs.versionLabel.textContent = `v${env.appVersion}`;
  const packCount = Array.isArray(packs) && packs.length > 0
    ? packs.filter((pack) => Number(pack?.characterCount) > 0).length
    : new Set(characters.map((character) => character.packId)).size;
  refs.charCount.textContent = packCount > 0
    ? `${characters.length} chars / ${packCount} packs`
    : `${characters.length} chars`;
  setFrontPanel(state.frontPanel || 'controls');
  setActiveBackPanel(state.activePanel === 'settings' ? 'settings' : null);
  setFlipCardPanel(state.activePanel === 'settings' ? 'settings' : null);
  applySelectedBackground(state.selectedBackground);
  window.addEventListener('resize', syncDialogueInputHighlight);
  window.addEventListener('resize', syncBackgroundPackVerticalAlignment);
  syncDialogueInputHighlightMetrics();
  syncPreviewPlaceholderState();
  syncShortcutVisualizer();

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
    updateFormatToolbarVisibility,
    applyModifierToSelection,
    syncDialogueInputHighlight,
    syncDialogueInputHighlightMetrics,
    syncDialogueInputHighlightScroll,
    syncDialogueInputCounter,
    syncCharacterSearchClearButton,
    syncShortcutVisualizer,
    setButtonKeyboardPressed,
    updateFastForwardAvailability,
    applyCharacterFilters,
    applyBackgroundFilters,
    showFavoriteContextMenu,
    hideFavoriteContextMenu,
    isFavoriteContextMenuVisible,
    isFavoriteContextMenuTarget,
    stopCardAnim,
    startCardIdleAnim,
    startCardSpeakThenIdle,
    startPlaceholderAnim,
    stopPlaceholderAnim,
    runStartupSequence,
    buildCharacterGrid,
    buildBackgroundGrid,
    getActiveBackgroundPackId,
    getBackgroundPackScrollState,
    restoreBackgroundPackState,
    updateSelectedCharacterCard,
    updateSelectedBackgroundCard,
    applySelectedBackground,
    updateReelArrows,
    dialogueBoxExtraClasses,
    splitDialogueTextIntoRenderLines,
    syncN64ClassOnDialogueBox,
    redrawSpriteForN64Toggle,
    computeExpandedPreviewHeight,
    setPreviewPlaceholderSuppressed,
    shouldAnimatePreviewContentExit,
    setPreviewPlaceholderPanelIntent,
    syncPreviewPlaceholderState,
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
