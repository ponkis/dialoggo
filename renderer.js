/* ═══════════════════════════════════════════════════════════════
   DIALOGGO — Renderer
   Sound engine, sprite animation, dialogue box, text scroller
   ═══════════════════════════════════════════════════════════════ */

const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Titlebar controls (via IPC to main process) ─────────────
document.getElementById('btn-minimize')?.addEventListener('click', () => {
  ipcRenderer.send('window-minimize');
});

document.getElementById('btn-maximize')?.addEventListener('click', () => {
  ipcRenderer.send('window-maximize');
});

document.getElementById('btn-close')?.addEventListener('click', () => {
  ipcRenderer.send('window-close');
});

// ── Constants ───────────────────────────────────────────────
const APP_DIR = __dirname;
const SND_DIR = path.join(APP_DIR, 'snd');
const IMG_DIR = path.join(APP_DIR, 'img');
const SPEAK_FRAME_COUNT = 6;
const IDLE_FRAME_COUNT = 4;

// ── Version from package.json ───────────────────────────────
const pkgPath = path.join(APP_DIR, 'package.json');
const appVersion = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

// ── Character Discovery ─────────────────────────────────────
function discoverCharacters() {
  const characters = [];
  if (!fs.existsSync(IMG_DIR)) return characters;

  const dirs = fs.readdirSync(IMG_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const name of dirs) {
    const imgDir = path.join(IMG_DIR, name);
    const sndDir = path.join(SND_DIR, name);

    if (!fs.existsSync(imgDir) || !fs.existsSync(sndDir)) continue;

    const speakFrames = [];
    const idleFrames = [];

    for (let i = 1; i <= SPEAK_FRAME_COUNT; i++) {
      const sp = path.join(imgDir, `s${i}.png`);
      if (fs.existsSync(sp)) speakFrames.push(sp);
    }

    for (let i = 1; i <= IDLE_FRAME_COUNT; i++) {
      const ip = path.join(imgDir, `i${i}.png`);
      if (fs.existsSync(ip)) idleFrames.push(ip);
    }

    const soundFiles = [];
    const hasSoundDir = fs.existsSync(sndDir);
    if (hasSoundDir) {
      const files = fs.readdirSync(sndDir).filter(f => /\.(wav|mp3|ogg)$/i.test(f));
      for (const f of files) soundFiles.push(path.join(sndDir, f));
    }

    const hasAllSprites = speakFrames.length === SPEAK_FRAME_COUNT && idleFrames.length === IDLE_FRAME_COUNT;
    const hasAnySound = soundFiles.length > 0;
    const isAvailable = hasAllSprites && hasAnySound;

    characters.push({
      id: name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      speakFrames,
      idleFrames,
      sounds: soundFiles,
      isAvailable,
      hasAllSprites,
      hasAnySound,
    });
  }

  return characters;
}

function discoverGenericSounds() {
  const genericDir = path.join(SND_DIR, 'generic');
  if (!fs.existsSync(genericDir)) return [];
  return fs.readdirSync(genericDir)
    .filter(f => /\.(wav|mp3|ogg)$/i.test(f))
    .map(f => path.join(genericDir, f));
}

// ── State ───────────────────────────────────────────────────
const characters = discoverCharacters();
const genericSounds = discoverGenericSounds();
let selectedCharacter = null;
let isPlaying = false;
let isPaused = false;
let stopRequested = false;
let pauseTransitionLock = false;
let dialogueMirrored = false;
/** Low-res “N64” look: canvas downsample + chunky dialogue UI */
let n64ModeEnabled = false;

/** Canvas 2D downsample block size — larger = chunkier (was 4; too fine once scaled into 72px sprite) */
/** ~24×24 blocks on 144 canvas — visible but not extreme */
const N64_CANVAS_PIXEL_BLOCK = 6;

/**
 * Dialogue text pixelation — same technique as pixelation_techniques_demo.html.
 * Helpers are defined after DOM refs (see below).
 */
/** 2 = subtle chunky edges (readable); 3–4 = more retro; 6+ gets hard to read */
const N64_TEXT_PIXEL_BLOCK = 2;
const N64_TEXT_LINE_HEIGHT = 33;
const N64_TEXT_FONT = 'bold 30px "Andy Bold", "Comic Sans MS", cursive';

const N64_MODE_STORAGE_KEY = 'dialoggo-n64-mode';

let _n64PixelScratch = null;

function getN64PixelScratchCanvas(sw, sh) {
  if (!_n64PixelScratch) _n64PixelScratch = document.createElement('canvas');
  if (_n64PixelScratch.width !== sw || _n64PixelScratch.height !== sh) {
    _n64PixelScratch.width = sw;
    _n64PixelScratch.height = sh;
  }
  return _n64PixelScratch;
}

function dialogueBoxExtraClasses() {
  return (dialogueMirrored ? ' mirrored' : '') + (n64ModeEnabled ? ' n64-mode' : '');
}

function syncN64ClassOnDialogueBox() {
  if (!elDialogueBox) return;
  elDialogueBox.classList.toggle('n64-mode', n64ModeEnabled);
}

/** Keep JS flag aligned with the real checkbox (fixes broken label↔input when input was display:none). */
function syncN64ModeFromCheckbox() {
  const el = document.getElementById('input-n64-mode');
  if (el) n64ModeEnabled = el.checked;
}

function redrawSpriteForN64Toggle() {
  const r = spriteRenderer;
  if (!r.idleFrames?.length && !r.speakFrames?.length) return;
  if (r.mode === 'speaking') {
    r.showFrame(r.speakFrames, r.frameIndex);
  } else if (r.mode === 'idle') {
    r.showFrame(r.idleFrames, r.frameIndex);
  }
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// ── Audio Cache ─────────────────────────────────────────────
const audioBufferCache = new Map();

async function loadAudioBuffer(filePath) {
  if (audioBufferCache.has(filePath)) return audioBufferCache.get(filePath);
  const ctx = getAudioContext();
  const data = fs.readFileSync(filePath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  audioBufferCache.set(filePath, audioBuffer);
  return audioBuffer;
}

function playAudioBuffer(audioBuffer) {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 1;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.start(0);
  return { source, gainNode, duration: audioBuffer.duration };
}

async function playSoundFile(filePath) {
  const buffer = await loadAudioBuffer(filePath);
  const { source, duration } = playAudioBuffer(buffer);
  return new Promise((resolve) => {
    source.onended = () => resolve(duration);
    setTimeout(() => resolve(duration), duration * 1000 + 100);
  });
}

// ── Menu Sound Effects ──────────────────────────────────────
const MENU_SND_DIR = path.join(SND_DIR, 'menu');
const menuSoundPaths = {
  click: path.join(MENU_SND_DIR, '1.wav'),
  select: path.join(MENU_SND_DIR, '2.wav'),
  arrowRight: path.join(MENU_SND_DIR, '3.wav'),
  arrowLeft: path.join(MENU_SND_DIR, '4.wav'),
  forbidden: path.join(MENU_SND_DIR, '5.wav'),
  /** Settings sleeve: open / close (same files as arrow L/R — dedicated keys for clarity) */
  settingsOpen: path.join(MENU_SND_DIR, '3.wav'),
  settingsClose: path.join(MENU_SND_DIR, '4.wav'),
};

function playMenuSound(key) {
  const p = menuSoundPaths[key];
  if (p && fs.existsSync(p)) {
    loadAudioBuffer(p).then(buf => playAudioBuffer(buf)).catch(() => {});
  }
}

// Click sound on any clickable element (replaces old hover sound)
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, .reel-arrow, a, .powered-link');
  if (!el) return;
  // Skip if disabled — the forbidden handler covers that
  if (el.disabled) return;
  // Character buttons and arrows have their own dedicated sounds
  if (el.classList.contains('char-btn') || el.closest('.reel-arrow')) return;
  if (el.classList.contains('sleeve-tab') || el.closest('.uiverse-rocker-switch')) return;
  playMenuSound('click');
}, true);

// Forbidden sound on disabled / not-allowed elements.
// Use pointerdown because disabled controls often don't emit click events.
document.addEventListener('pointerdown', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;

  const el = target.closest('button:disabled, .char-btn.unavailable, [disabled], [aria-disabled="true"]');
  if (el) {
    playMenuSound('forbidden');
    return;
  }

  const computed = window.getComputedStyle(target);
  if (computed.cursor === 'not-allowed') {
    playMenuSound('forbidden');
  }
}, true);

// Fallback for regular clickables that resolve to forbidden style late.
document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const el = target.closest('button:disabled, .char-btn.unavailable');
  if (!el) return;
  playMenuSound('forbidden');
}, true);

// ── Speech Sound Loop (Banjo-Kazooie style) ────────────────
class SpeechSoundLoop {
  constructor(spriteRenderer) {
    this.spriteRenderer = spriteRenderer;
    this.sounds = [];
    this.running = false;
    this.paused = false;
    this.currentSource = null;
    this.currentGainNode = null;
    this._loopPromise = null;
    this._abortController = null;
  }

  start(soundFiles) {
    this.stop();
    this.sounds = soundFiles;
    this.running = true;
    this.paused = false;
    this._abortController = new AbortController();
    this._loopPromise = this._loop();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  stop() {
    this.running = false;
    this.paused = false;
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
    this._killCurrentAudio();
    this._resolveWait();
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    await this.spriteRenderer.smoothCloseAndIdle();
  }

  _killCurrentAudio() {
    if (this.currentSource) {
      if (this.currentGainNode && audioCtx) {
        try {
          const gn = this.currentGainNode;
          gn.gain.setValueAtTime(gn.gain.value, audioCtx.currentTime);
          gn.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
          const src = this.currentSource;
          setTimeout(() => { try { src.stop(); } catch {} }, 60);
        } catch {}
      } else {
        try { this.currentSource.stop(); } catch { }
      }
      this.currentSource = null;
      this.currentGainNode = null;
    }
  }

  // Force-resolve the current clip wait so the loop exits immediately
  _resolveWait() {
    if (this._clipResolve) {
      this._clipResolve();
      this._clipResolve = null;
    }
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

      const soundFile = pick(this.sounds);

      try {
        const buffer = await loadAudioBuffer(soundFile);
        if (!this.running) break;
        if (this.paused) continue;

        const { source, gainNode, duration } = playAudioBuffer(buffer);
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
      } catch (err) {
        this._clipResolve = null;
        this.currentSource = null;
        this.currentGainNode = null;
        if (!this.running) break;
      }
    }
  }
}

// ── Random helper ───────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Sprite Loader ───────────────────────────────────────────
const spriteImageCache = new Map();

function loadSpriteImage(filePath) {
  return new Promise((resolve, reject) => {
    if (spriteImageCache.has(filePath)) {
      resolve(spriteImageCache.get(filePath));
      return;
    }
    const img = new Image();
    img.onload = () => {
      spriteImageCache.set(filePath, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = `file://${filePath.replace(/\\/g, '/')}`;
  });
}

function fileToSrc(filePath) {
  return `file://${filePath.replace(/\\/g, '/')}`;
}

// ── Sprite Renderer (individual files, canvas-based) ──────
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
    this.idleDirection = 1;
    this.idleFrameDelay = 120;
    this.idleBlinkHoldMin = 1800;
    this.idleBlinkHoldMax = 4200;
    this.idleBlinkFrameDelay = 75;

    this.speakTimer = null;
    this._sourceCanvas = null;
  }

  async loadCharacter(character) {
    this.stop();
    this.idleFrames = character.idleFrames;
    this.speakFrames = character.speakFrames;

    const allFrames = [...this.idleFrames, ...this.speakFrames];
    const loaded = await Promise.all(allFrames.map(f => loadSpriteImage(f)));
    this.frameImages.clear();
    allFrames.forEach((f, i) => this.frameImages.set(f, loaded[i]));

    this.frameIndex = 0;
    this.mode = 'idle';
    this.showFrame(this.idleFrames, 0);
  }

  showFrame(framesArray, frameIdx) {
    if (!framesArray || !framesArray[frameIdx]) return;
    const img = this.frameImages.get(framesArray[frameIdx]);
    if (!img) return;

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    if (!this._sourceCanvas) {
      this._sourceCanvas = document.createElement('canvas');
      this._sourceCanvas.width = cw;
      this._sourceCanvas.height = ch;
    }
    const sctx = this._sourceCanvas.getContext('2d');
    sctx.clearRect(0, 0, cw, ch);

    const scale = Math.min(cw / img.width, ch / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(img, dx, dy, dw, dh);

    if (n64ModeEnabled) {
      const px = N64_CANVAS_PIXEL_BLOCK;
      const sw = Math.max(1, Math.floor(cw / px));
      const sh = Math.max(1, Math.floor(ch / px));
      const tmp = getN64PixelScratchCanvas(sw, sh);
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.clearRect(0, 0, sw, sh);
      tctx.drawImage(this._sourceCanvas, 0, 0, sw, sh);
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, cw, ch);
    } else {
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._sourceCanvas, 0, 0);
    }
  }

  startIdle() {
    this.stop();
    this.mode = 'idle';
    this.frameIndex = 0;
    this.idleDirection = 1;
    this.showFrame(this.idleFrames, 0);
    if (!this.idleFrames.length) return;
    const last = Math.max(0, this.idleFrames.length - 1);

    const playBlinkCycle = () => {
      let idx = 1;
      let dir = 1;
      const step = () => {
        if (!this.mode || this.mode !== 'idle') return;
        this.frameIndex = idx;
        this.showFrame(this.idleFrames, idx);
        if (idx >= last) dir = -1;
        idx += dir;
        if (idx <= 0) {
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
    if (this.idleStartTimeout) {
      clearTimeout(this.idleStartTimeout);
      this.idleStartTimeout = null;
    }
  }

  startSpeaking(audioDurationMs) {
    this.stopSpeaking();
    
    let currentFrame = this.mode === 'speaking' ? this.frameIndex : 0;
    this.mode = 'speaking';

    let maxFrame;
    if (audioDurationMs < 80) {
      maxFrame = 1;
    } else if (audioDurationMs < 150) {
      maxFrame = 2;
    } else if (audioDurationMs < 250) {
      maxFrame = 3;
    } else if (audioDurationMs < 400) {
      maxFrame = 4;
    } else {
      maxFrame = 5;
    }

    const totalFrames = maxFrame + 1;
    const openTime = Math.min(audioDurationMs * 0.6, audioDurationMs);
    const frameTime = Math.max(openTime / totalFrames, 35);

    let opening = currentFrame < maxFrame;

    this.showFrame(this.speakFrames, currentFrame);

    this.speakTimer = setInterval(() => {
      if (opening) {
        currentFrame++;
        if (currentFrame >= maxFrame) {
          currentFrame = maxFrame;
          opening = false;
        }
      } else {
        currentFrame--;
        if (currentFrame <= 0) {
          currentFrame = 0;
          clearInterval(this.speakTimer);
          this.speakTimer = null;
        }
      }
      this.frameIndex = currentFrame;
      this.showFrame(this.speakFrames, currentFrame);
    }, frameTime);
  }

  resetToIdle() {
    this.stopSpeaking();
    this.mode = 'idle';

    if (this.frameIndex > 0) {
      let currentFrame = this.frameIndex;
      this.speakTimer = setInterval(() => {
        currentFrame--;
        if (currentFrame <= 0) {
          currentFrame = 0;
          clearInterval(this.speakTimer);
          this.speakTimer = null;
        }
        this.frameIndex = currentFrame;
        this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, currentFrame);
      }, 30);
    } else {
      this.frameIndex = 0;
      this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
    }
  }

  smoothCloseAndIdle() {
    this.stopSpeaking();
    this.mode = 'idle';

    return new Promise((resolve) => {
      if (this.frameIndex > 0) {
        let currentFrame = this.frameIndex;
        this.speakTimer = setInterval(() => {
          currentFrame--;
          if (currentFrame <= 0) {
            currentFrame = 0;
            clearInterval(this.speakTimer);
            this.speakTimer = null;
            this.frameIndex = 0;
            this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
            resolve();
          } else {
            this.frameIndex = currentFrame;
            this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, currentFrame);
          }
        }, 30);
      } else {
        this.frameIndex = 0;
        this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
        resolve();
      }
    });
  }

  stopSpeaking() {
    if (this.speakTimer) {
      clearInterval(this.speakTimer);
      this.speakTimer = null;
    }
  }

  stop() {
    this.stopSpeaking();
    this.clearIdleStartTimeout();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

// ── DOM References ──────────────────────────────────────────
const elCharGrid = document.getElementById('character-grid');
const elInput = document.getElementById('dialogue-input');
const elBtnPlay = document.getElementById('btn-play');
const elBtnPause = document.getElementById('btn-pause');
const elBtnStop = document.getElementById('btn-stop');
const elApp = document.querySelector('.app');
const elPreviewArea = document.getElementById('preview-area');
const elPanelWrapper = document.querySelector('.panel-wrapper');
const elBottombar = document.querySelector('.bottombar');
const elPlaceholder = document.getElementById('preview-placeholder');
const elPlaceholderAnim = document.getElementById('placeholder-anim');
const elDialogueContainer = document.getElementById('dialogue-container');
const elDialogueBox = document.getElementById('dialogue-box');
const elDialogueTextArea = document.getElementById('dialogue-text-area');
const elDialogueText = document.getElementById('dialogue-text');
const elDialogueTextN64Canvas = document.getElementById('dialogue-text-n64-canvas');

let _n64DialogueTextHi = null;
let _n64DialogueTextSmall = null;

function getN64DialogueTextHiCanvas(w, h) {
  if (!_n64DialogueTextHi || _n64DialogueTextHi.width !== w || _n64DialogueTextHi.height !== h) {
    _n64DialogueTextHi = document.createElement('canvas');
    _n64DialogueTextHi.width = w;
    _n64DialogueTextHi.height = h;
  }
  return _n64DialogueTextHi;
}

function getN64DialogueTextSmallCanvas(sw, sh) {
  if (!_n64DialogueTextSmall || _n64DialogueTextSmall.width !== sw || _n64DialogueTextSmall.height !== sh) {
    _n64DialogueTextSmall = document.createElement('canvas');
    _n64DialogueTextSmall.width = sw;
    _n64DialogueTextSmall.height = sh;
  }
  return _n64DialogueTextSmall;
}

function parseTranslateYpx(transformStr) {
  if (!transformStr || transformStr === 'none') return 0;
  const m = transformStr.match(/translateY\((-?[0-9.]+)px\)/);
  return m ? parseFloat(m[1], 10) : 0;
}

/**
 * Live translateY while .dialogue-scroll CSS transition runs (style.transform is only the end value).
 * matrix(a,b,c,d,tx,ty) → ty at index 5; matrix3d → ty at index 13.
 */
function getScrollWrapperTranslateYpx(scrollWrapper) {
  if (!scrollWrapper) return 0;
  const t = getComputedStyle(scrollWrapper).transform;
  if (!t || t === 'none') {
    return parseTranslateYpx(scrollWrapper.style.transform);
  }
  const mat = t.match(/^matrix\(([^)]+)\)$/);
  if (mat) {
    const v = mat[1].split(',').map((s) => parseFloat(s.trim()));
    if (v.length >= 6 && Number.isFinite(v[5])) return v[5];
  }
  const mat3d = t.match(/^matrix3d\(([^)]+)\)$/);
  if (mat3d) {
    const v = mat3d[1].split(',').map((s) => parseFloat(s.trim()));
    if (v.length >= 16 && Number.isFinite(v[13])) return v[13];
  }
  return parseTranslateYpx(scrollWrapper.style.transform);
}

/** Repaint N64 text canvas each frame so scroll matches the eased CSS transition on .dialogue-scroll */
async function n64RepaintDuringScrollTransition(scrollWrapper, durationMs = 350) {
  const t0 = performance.now();
  while (performance.now() - t0 < durationMs) {
    renderN64DialogueTextCanvas();
    await new Promise((r) => requestAnimationFrame(r));
  }
  renderN64DialogueTextCanvas();
}

function clearN64DialogueTextCanvas() {
  const c = elDialogueTextN64Canvas;
  if (!c || !c.getContext) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  if (c.width > 0 && c.height > 0) ctx.clearRect(0, 0, c.width, c.height);
}

/** Rasterize current #dialogue-text lines to the N64 overlay canvas. */
function renderN64DialogueTextCanvas() {
  try {
    const canvas = elDialogueTextN64Canvas;
    const area = elDialogueTextArea;
    if (!n64ModeEnabled || !canvas || !area || !elDialogueText) return;

    const scrollWrapper = elDialogueText.querySelector('.dialogue-scroll');
    if (!scrollWrapper) {
      clearN64DialogueTextCanvas();
      return;
    }

    /* Layout box from geometry — clientWidth can lie during flex; getBoundingClientRect matches paint. */
    const rect = area.getBoundingClientRect();
    let W = Math.round(rect.width);
    let H = Math.round(rect.height);
    if (W < 12) W = Math.max(48, Math.floor(area.clientWidth), Math.floor(elDialogueText.offsetWidth || 0));
    if (H < 12) H = Math.max(33, Math.floor(area.clientHeight), Math.floor(elDialogueText.offsetHeight || 0));
    W = Math.min(2048, Math.max(48, W));
    H = Math.min(512, Math.max(33, H));
    const hi = getN64DialogueTextHiCanvas(W, H);
    const ctxHi = hi.getContext('2d');
    if (!ctxHi) return;

    const padT = 6;
    const padL = dialogueMirrored ? 32 : 14;

    ctxHi.clearRect(0, 0, W, H);
    ctxHi.save();
    ctxHi.beginPath();
    // Use a tighter clip to avoid drawing bits of lines scrolled into padding areas.
    // Pixelation downsampling often samples the padding, making fragments visible at top/bottom.
    ctxHi.rect(0, padT, W, 2 * N64_TEXT_LINE_HEIGHT);
    ctxHi.clip();

    ctxHi.font = N64_TEXT_FONT;
    /* Avoid throws on older Electron: property may not exist or may reject value */
    if ('letterSpacing' in ctxHi) {
      try {
        ctxHi.letterSpacing = '0.5px';
      } catch {
        /* ignore */
      }
    }
    ctxHi.textBaseline = 'top';
    ctxHi.fillStyle = '#ffffff';
    ctxHi.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctxHi.shadowOffsetX = 1;
    ctxHi.shadowOffsetY = 1;
    ctxHi.shadowBlur = 0;

    const lineEls = scrollWrapper.querySelectorAll('.line');
    const scrollY = getScrollWrapperTranslateYpx(scrollWrapper);
    const centered = elDialogueText.classList.contains('centered');

    for (let i = 0; i < lineEls.length; i++) {
      const text = lineEls[i].textContent || '';
      let y;
      if (centered && lineEls.length === 1) {
        y = (H - N64_TEXT_LINE_HEIGHT) / 2;
      } else {
        y = padT + i * N64_TEXT_LINE_HEIGHT + scrollY;
      }
      ctxHi.textAlign = 'left';
      ctxHi.fillText(text, padL, y);
    }

    ctxHi.restore();

    const sw = Math.max(1, Math.floor(W / N64_TEXT_PIXEL_BLOCK));
    const sh = Math.max(1, Math.floor(H / N64_TEXT_PIXEL_BLOCK));
    const small = getN64DialogueTextSmallCanvas(sw, sh);
    const sctx = small.getContext('2d');
    if (!sctx) return;
    sctx.imageSmoothingEnabled = false;
    try {
      sctx.mozImageSmoothingEnabled = false;
    } catch {
      /* ignore */
    }
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(hi, 0, 0, sw, sh);

    canvas.width = W;
    canvas.height = H;
    const out = canvas.getContext('2d');
    if (!out) return;
    out.imageSmoothingEnabled = false;
    try {
      out.mozImageSmoothingEnabled = false;
    } catch {
      /* ignore */
    }
    out.clearRect(0, 0, W, H);
    out.drawImage(small, 0, 0, W, H);
  } catch (err) {
    console.warn('[Dialoggo] N64 dialogue text canvas:', err);
  }
}

/** Debounced resize redraw — avoids observer ↔ layout feedback */
let _n64TextRoRaf = 0;
function scheduleN64DialogueTextCanvasResize() {
  if (!n64ModeEnabled || !elDialogueText?.querySelector('.dialogue-scroll')) return;
  if (_n64TextRoRaf) cancelAnimationFrame(_n64TextRoRaf);
  _n64TextRoRaf = requestAnimationFrame(() => {
    _n64TextRoRaf = 0;
    renderN64DialogueTextCanvas();
  });
}

if (typeof ResizeObserver !== 'undefined' && elDialogueTextArea) {
  new ResizeObserver(() => {
    scheduleN64DialogueTextCanvasResize();
  }).observe(elDialogueTextArea);
}
const elSpriteCanvas = document.getElementById('sprite-canvas');
const elStatusDot = document.getElementById('status-dot');
const elCharCount = document.getElementById('char-count');
const elVersionLabel = document.getElementById('version-label');

const spriteRenderer = new SpriteRenderer(elSpriteCanvas);
const cardAnimState = new Map(); // charId -> { timer, frameIndex, direction, mode, img, char }

function setInputLocked(locked) {
  elInput.readOnly = locked;
  elInput.classList.toggle('is-locked', locked);
}

function stopCardAnim(charId) {
  const state = cardAnimState.get(charId);
  if (!state) return;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function setCardFrame(state, frames, index) {
  const framePath = frames[index];
  if (!framePath) return;
  state.img.src = fileToSrc(framePath);
}

function startCardIdleAnim(charId) {
  const state = cardAnimState.get(charId);
  if (!state) return;
  const frames = state.char.idleFrames;
  if (!frames?.length) return;
  stopCardAnim(charId);
  state.mode = 'idle';
  state.frameIndex = 0;
  state.direction = 1;
  setCardFrame(state, frames, state.frameIndex);
  const last = Math.max(0, frames.length - 1);
  const schedule = () => {
    const hold = 1500 + Math.floor(Math.random() * 2200);
    state.timer = setTimeout(playCycle, hold);
  };
  const playCycle = () => {
    if (state.mode !== 'idle') return;
    let idx = 1;
    let dir = 1;
    const step = () => {
      if (state.mode !== 'idle') return;
      state.frameIndex = idx;
      setCardFrame(state, frames, state.frameIndex);
      if (idx >= last) dir = -1;
      idx += dir;
      if (idx <= 0) {
        state.frameIndex = 0;
        setCardFrame(state, frames, 0);
        schedule();
        return;
      }
      state.timer = setTimeout(step, 80);
    };
    state.timer = setTimeout(step, 80);
  };
  schedule();
}

function startCardSpeakThenIdle(charId) {
  const state = cardAnimState.get(charId);
  if (!state) return;
  const speak = state.char.speakFrames;
  if (!speak?.length) {
    startCardIdleAnim(charId);
    return;
  }
  stopCardAnim(charId);
  state.mode = 'speak';
  state.frameIndex = 0;
  state.direction = 1;
  setCardFrame(state, speak, state.frameIndex);
  state.timer = setInterval(() => {
    if (state.mode !== 'speak') return;
    state.frameIndex += state.direction;
    if (state.frameIndex >= speak.length - 1) state.direction = -1;
    else if (state.frameIndex <= 0) {
      // finish one smooth talk cycle, then transition to idle loop
      startCardIdleAnim(charId);
      return;
    }
    setCardFrame(state, speak, state.frameIndex);
  }, 70);
}

// ── Bottom Bar Info ─────────────────────────────────────────
elVersionLabel.textContent = `v${appVersion}`;
elCharCount.textContent = `${characters.length} chars`;

// ── Animated Placeholder ────────────────────────────────────
const PLACEHOLDER_FRAMES = [];
for (let i = 1; i <= 22; i++) {
  PLACEHOLDER_FRAMES.push(path.join(APP_DIR, 'img', 'menu', 'misc', `01 (${i}).png`));
}
let placeholderFrameIdx = 0;
let placeholderTimer = null;

function startPlaceholderAnim() {
  if (placeholderTimer) return;
  placeholderFrameIdx = 0;
  showPlaceholderFrame();
  placeholderTimer = setInterval(() => {
    placeholderFrameIdx = (placeholderFrameIdx + 1) % PLACEHOLDER_FRAMES.length;
    showPlaceholderFrame();
  }, 90);
}

function showPlaceholderFrame() {
  const fp = PLACEHOLDER_FRAMES[placeholderFrameIdx];
  if (fp && fs.existsSync(fp)) {
    elPlaceholderAnim.src = fileToSrc(fp);
  }
}

function stopPlaceholderAnim() {
  if (placeholderTimer) {
    clearInterval(placeholderTimer);
    placeholderTimer = null;
  }
}

startPlaceholderAnim();

// ── Build Character Grid ────────────────────────────────────
function buildCharacterGrid() {
  elCharGrid.innerHTML = '';
  cardAnimState.clear();

  for (const char of characters) {
    const btn = document.createElement('button');
    btn.className = 'char-btn';
    btn.dataset.id = char.id;
    btn.disabled = !char.isAvailable;
    if (!char.isAvailable) btn.classList.add('unavailable');

    const spriteWrap = document.createElement('div');
    spriteWrap.className = 'char-btn-sprite';
    const miniImg = document.createElement('img');

    const previewPath = char.idleFrames[0] || char.speakFrames[0] || null;
    if (previewPath) miniImg.src = fileToSrc(previewPath);
    else miniImg.style.display = 'none';
    miniImg.alt = char.displayName;
    spriteWrap.appendChild(miniImg);

    const label = document.createElement('span');
    label.textContent = char.displayName;

    btn.appendChild(spriteWrap);
    btn.appendChild(label);

    if (!char.isAvailable) {
      const badge = document.createElement('img');
      badge.className = 'warning-badge';
      badge.src = fileToSrc(path.join(APP_DIR, 'img', 'menu', '00000826.png'));
      badge.alt = 'Unavailable';
      badge.title = (!char.hasAllSprites && !char.hasAnySound)
        ? 'Missing sprite frames and no sounds'
        : (!char.hasAllSprites ? 'Missing sprite frames' : 'No sounds found');
      btn.appendChild(badge);
    }

    cardAnimState.set(char.id, {
      timer: null,
      frameIndex: 0,
      direction: 1,
      mode: 'idle',
      img: miniImg,
      char,
    });

    btn.addEventListener('mouseenter', () => {
      if (btn.disabled) return;
      startCardIdleAnim(char.id);
    });

    btn.addEventListener('mouseleave', () => {
      if (btn.disabled) return;
      if (selectedCharacter?.id === char.id) {
        startCardIdleAnim(char.id);
      } else {
        stopCardAnim(char.id);
        if (previewPath) miniImg.src = fileToSrc(previewPath);
      }
    });

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const wasActive = selectedCharacter?.id === char.id;
      selectCharacter(char);
      // Trigger speaking pose immediately on first selection click.
      if (!wasActive) startCardSpeakThenIdle(char.id);
    });

    elCharGrid.appendChild(btn);
  }
}

// ── Select Character ────────────────────────────────────────
function selectCharacter(char) {
  if (isPlaying) return;
  if (!char?.isAvailable) return;

  const alreadyActive = selectedCharacter && selectedCharacter.id === char.id;
  if (alreadyActive) return;

  selectedCharacter = char;

  document.querySelectorAll('.char-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === char.id);
    const btnCharId = btn.dataset.id;
    if (!btnCharId) return;
    const st = cardAnimState.get(btnCharId);
    if (!st) return;
    if (btnCharId === char.id) {
      startCardIdleAnim(btnCharId);
    } else {
      stopCardAnim(btnCharId);
      const preview = st.char.idleFrames[0] || st.char.speakFrames[0];
      if (preview) st.img.src = fileToSrc(preview);
    }
  });

  spriteRenderer.loadCharacter(char);

  playMenuSound('select');
  if (char.sounds.length > 0) {
    const randomClip = pick(char.sounds);
    loadAudioBuffer(randomClip).then(buf => playAudioBuffer(buf)).catch(() => {});
  }

  updatePlayButton();
}

// ── Update Play Button State ────────────────────────────────
function updatePlayButton() {
  const hasText = elInput.value.trim().length > 0;
  const hasChar = selectedCharacter !== null;
  elBtnPlay.disabled = !hasText || !hasChar || (isPlaying && !isPaused);
}

elInput.addEventListener('input', updatePlayButton);


// ── Utility: Sleep ──────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Intro / Outro Sound Sequences ───────────────────────────
async function playIntroSounds() {
  if (genericSounds.length === 0) return;
  const s1 = pick(genericSounds);
  const s2 = pick(genericSounds);
  await playSoundFile(s1);
  await playSoundFile(s2);
}

async function playOutroSounds() {
  if (genericSounds.length === 0) return;
  const s1 = pick(genericSounds);
  const s2 = pick(genericSounds);
  await playSoundFile(s1);
  await playSoundFile(s2);
}

// ── Text Line Splitter ──────────────────────────────────────
function splitTextIntoLines(text, maxCharsPerLine = 32) {
  const lines = [];
  const manualLines = text.toUpperCase().split('\n');

  for (const manualLine of manualLines) {
    if (manualLine.trim() === '') {
      lines.push('');
      continue;
    }

    const words = manualLine.split(/\s+/);
    let currentLine = '';

    for (let word of words) {
      if (!word) continue;

      while (word.length > maxCharsPerLine) {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = '';
        }
        lines.push(word.substring(0, maxCharsPerLine));
        word = word.substring(maxCharsPerLine);
      }

      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ── Speech Sound Loop Instance ──────────────────────────────
const speechLoop = new SpeechSoundLoop(spriteRenderer);

const PAUSE_CHARS = new Set(['.', ',', '!', '?', ':', ';']);

// ── Pause / Resume helpers ──────────────────────────────────
let pauseResolve = null;

function waitWhilePaused() {
  if (!isPaused) return Promise.resolve();
  return new Promise(resolve => { pauseResolve = resolve; });
}

function resumeFromPause() {
  isPaused = false;
  if (pauseResolve) {
    const r = pauseResolve;
    pauseResolve = null;
    r();
  }
}

// ── Main Dialogue Playback ─────────────────────────────────
async function playDialogue() {
  if (isPaused) {
    doResume();
    return;
  }
  if (isPlaying) return;
  if (!selectedCharacter) return;

  isPlaying = true;
  isPaused = false;
  stopRequested = false;
  pauseTransitionLock = false;

  const text = elInput.value.trim();
  if (!text) {
    isPlaying = false;
    updateSettingsSleeveBlockedState();
    return;
  }

  const charMsPerChar = 40;
  const char = selectedCharacter;

  elBtnPlay.disabled = true;
  elBtnPause.disabled = false;
  elBtnStop.disabled = false;
  setInputLocked(true);
  document.querySelectorAll('.char-btn').forEach(btn => (btn.disabled = true));
  elStatusDot.classList.add('playing');
  elStatusDot.classList.remove('paused');
  updateSettingsSleeveBlockedState();

  elPlaceholder.classList.add('fade-out');
  elDialogueContainer.classList.add('active');

  syncN64ModeFromCheckbox();

  elDialogueText.innerHTML = '';
  clearN64DialogueTextCanvas();
  elDialogueBox.className = 'dialogue-box' + dialogueBoxExtraClasses();
  elDialogueBox.classList.toggle('n64-mode', n64ModeEnabled);
  elDialogueBox.classList.toggle('mirrored', dialogueMirrored);

  elDialogueContainer.classList.add('active');

  spriteRenderer.stop();
  spriteRenderer.frameIndex = 0;
  spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);

  void elDialogueBox.offsetWidth;
  elDialogueBox.classList.add('slide-in');

  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(400),
  ]);

  if (stopRequested) {
    speechLoop.stop();
    spriteRenderer.startIdleAfterDelay(2000);
    await finishDialogue();
    return;
  }

  elDialogueBox.classList.remove('slide-in');
  elDialogueBox.classList.add('expand');
  syncN64ModeFromCheckbox();
  elDialogueBox.classList.toggle('n64-mode', n64ModeEnabled);
  elDialogueBox.classList.toggle('mirrored', dialogueMirrored);

  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(450),
  ]);

  if (stopRequested) {
    speechLoop.stop();
    spriteRenderer.startIdleAfterDelay(2000);
    await finishDialogue();
    return;
  }

  // ── Phase 2: Text scrolling with speech ──────────────
  const lines = splitTextIntoLines(text);
  const isMultiLine = lines.length > 1;
  let lineIndex = 0;

  if (!isMultiLine) {
    elDialogueText.classList.add('centered');
  } else {
    elDialogueText.classList.remove('centered');
  }

  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'dialogue-scroll';
  elDialogueText.appendChild(scrollWrapper);

  const LINE_HEIGHT = 33;
  let totalLinesAdded = 0;

  /* Let flex/layout settle so N64 canvas gets a real width (avoids 1px-wide bitmap). */
  if (n64ModeEnabled) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    renderN64DialogueTextCanvas();
  }

  speechLoop.start(char.sounds);
  if (isPaused) {
    speechLoop.pause();
    speechLoop._killCurrentAudio();
    await waitWhilePaused();
    if (!stopRequested) speechLoop.resume();
  }

  try {
    while (lineIndex < lines.length && !stopRequested) {
      const line = lines[lineIndex];

      speechLoop.pause();
      spriteRenderer.resetToIdle();

      if (totalLinesAdded >= 2) {
        const scrollY = (totalLinesAdded - 1) * LINE_HEIGHT;
        scrollWrapper.style.transform = `translateY(-${scrollY}px)`;
        if (n64ModeEnabled) {
          await Promise.all([
            n64RepaintDuringScrollTransition(scrollWrapper, 350),
            sleep(350),
          ]);
        } else {
          await sleep(350);
        }
      }

      const lineEl = document.createElement('span');
      lineEl.className = 'line';
      lineEl.textContent = '';
      scrollWrapper.appendChild(lineEl);
      totalLinesAdded++;

      if (lineIndex > 0) await sleep(200);

      speechLoop.resume();

      for (let i = 0; i < line.length; i++) {
        if (stopRequested) break;

        await waitWhilePaused();
        if (stopRequested) break;

        lineEl.textContent = line.substring(0, i + 1);
        if (n64ModeEnabled) renderN64DialogueTextCanvas();
        const ch = line[i];

        if (PAUSE_CHARS.has(ch)) {
          speechLoop.pause();
          spriteRenderer.resetToIdle();
          const pauseDuration = (ch === '.' || ch === '!' || ch === '?') ? 400 : 200;
          await sleep(pauseDuration);
          if (i < line.length - 1 && !PAUSE_CHARS.has(line[i + 1])) {
            speechLoop.resume();
          }
        } else if (ch === ' ') {
          await sleep(charMsPerChar * 0.6);
        } else {
          await sleep(charMsPerChar);
        }
      }

      lineIndex++;
    }

    // ── Phase 3: Stop sound, hold final text, then outro ──
    await speechLoop.gracefulStop();
    spriteRenderer.startIdleAfterDelay(2000);

    if (!stopRequested) await sleep(500);
  } catch (err) {
    /* Any throw here used to skip gracefulStop → speechLoop ran forever */
    console.error('[Dialoggo] playDialogue playback error', err);
    speechLoop.stop();
    spriteRenderer.stop();
    spriteRenderer.startIdleAfterDelay(2000);
  }

  await finishDialogue();
}

async function finishDialogue() {
  speechLoop.stop();
  spriteRenderer.stop();

  elDialogueText.innerHTML = '';
  elDialogueText.classList.remove('centered');
  clearN64DialogueTextCanvas();

  elDialogueBox.className = 'dialogue-box shrink' + dialogueBoxExtraClasses();

  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(400),
  ]);

  elDialogueBox.classList.remove('shrink');
  elDialogueBox.classList.add('slide-out');

  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(350),
  ]);

  elDialogueContainer.classList.remove('active');
  elDialogueBox.className = 'dialogue-box' + dialogueBoxExtraClasses();
  elDialogueText.innerHTML = '';
  clearN64DialogueTextCanvas();
  elPlaceholder.classList.remove('fade-out');

  isPlaying = false;
  isPaused = false;
  stopRequested = false;
  pauseTransitionLock = false;
  elBtnStop.disabled = true;
  elBtnPause.disabled = true;
  elBtnPlay.title = 'Play';
  setInputLocked(false);
  elStatusDot.classList.remove('playing');
  elStatusDot.classList.remove('paused');

  document.querySelectorAll('.char-btn').forEach(btn => {
    const id = btn.dataset.id;
    const c = characters.find(ch => ch.id === id);
    btn.disabled = !(c && c.isAvailable);
  });
  updatePlayButton();
  updateSettingsSleeveBlockedState();
}

function stopDialogue() {
  stopRequested = true;
  isPaused = false;
  pauseTransitionLock = false;
  if (pauseResolve) {
    const r = pauseResolve;
    pauseResolve = null;
    r();
  }
  // Kill the speech loop first (stops audio + forces async loop exit)
  speechLoop.stop();
  // Stop ALL sprite timers (speaking, idle, delayed idle) to prevent fights
  spriteRenderer.stop();
  // Show s1 (neutral) immediately — clean static state
  spriteRenderer.frameIndex = 0;
  spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);
  // Schedule idle after delay like normal end
  spriteRenderer.startIdleAfterDelay(2000);
  setInputLocked(false);
  elStatusDot.classList.remove('paused');
  updateSettingsSleeveBlockedState();
}

function doPause() {
  if (!isPlaying || isPaused || pauseTransitionLock) return;
  pauseTransitionLock = true;
  isPaused = true;
  // Pause speech loop and kill any currently playing clip.
  // Keeping loop instance alive avoids start/stop race conditions on rapid taps.
  speechLoop.pause();
  speechLoop._killCurrentAudio();
  spriteRenderer.stop();
  spriteRenderer.smoothCloseAndIdle();
  spriteRenderer.startIdleAfterDelay(2000);
  elBtnPlay.disabled = false;
  elBtnPlay.title = 'Resume';
  elBtnPause.disabled = true;
  elStatusDot.classList.remove('playing');
  elStatusDot.classList.add('paused');
  setInputLocked(true);
  setTimeout(() => { pauseTransitionLock = false; }, 140);
  updateSettingsSleeveBlockedState();
}

function doResume() {
  if (!isPlaying || !isPaused || pauseTransitionLock) return;
  pauseTransitionLock = true;
  // Stop idle timers, show neutral s1
  spriteRenderer.stop();
  spriteRenderer.frameIndex = 0;
  spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);
  speechLoop.resume();
  resumeFromPause();
  elBtnPlay.disabled = true;
  elBtnPlay.title = 'Play';
  elBtnPause.disabled = false;
  elStatusDot.classList.add('playing');
  elStatusDot.classList.remove('paused');
  setInputLocked(true);
  setTimeout(() => { pauseTransitionLock = false; }, 140);
  updateSettingsSleeveBlockedState();
}

// ── Event Listeners ─────────────────────────────────────────
elBtnPlay.addEventListener('click', playDialogue);
elBtnPause.addEventListener('click', doPause);
elBtnStop.addEventListener('click', stopDialogue);

// ── Reel Scroll Arrows ──────────────────────────────────────
const elReelLeft = document.getElementById('reel-arrow-left');
const elReelRight = document.getElementById('reel-arrow-right');

function updateReelArrows() {
  const grid = elCharGrid;
  const atStart = grid.scrollLeft <= 2;
  const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2;
  elReelLeft.classList.toggle('hidden', atStart);
  elReelRight.classList.toggle('hidden', atEnd);
}

elReelLeft.addEventListener('click', () => {
  playMenuSound('arrowLeft');
  elCharGrid.scrollBy({ left: -160, behavior: 'smooth' });
});
elReelRight.addEventListener('click', () => {
  playMenuSound('arrowRight');
  elCharGrid.scrollBy({ left: 160, behavior: 'smooth' });
});
elCharGrid.addEventListener('scroll', updateReelArrows);

// ── Init ────────────────────────────────────────────────────
buildCharacterGrid();
requestAnimationFrame(updateReelArrows);

if (characters.length > 0) {
  const firstAvailable = characters.find(c => c.isAvailable);
  if (firstAvailable) selectCharacter(firstAvailable);
}

// ── Sleeve Tabs & Settings Panel ─────────────────────────────
const elControlsPanel = document.getElementById('controls-panel');
const elSettingsPanel = document.getElementById('settings-panel');
const elFlipCard = document.getElementById('flip-card');
const elSleeveCamera = document.getElementById('sleeve-tab-camera');
const elSleeveSettings = document.getElementById('sleeve-tab-settings');
const elInputMirrored = document.getElementById('input-mirrored-dialogue');

let activePanel = 'controls'; // 'controls' | 'settings'
let panelTransitionLock = false;

/** Height of preview strip (px) — sleeve tabs peek above the panel into this gap */
const PREVIEW_STRIP_HEIGHT = 58;
const PREVIEW_COLLAPSE_MS = 420;
const FLIP_CARD_MS = 600;
const PREVIEW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function computeExpandedPreviewHeight() {
  if (!elApp || !elBottombar) return 280;
  /* While settings are open the panel is flex-grown tall; use the height
     captured before that so the expand animation matches the final layout. */
  const stored = elPanelWrapper?.dataset?.naturalPanelHeight;
  const panelH = stored
    ? Number(stored)
    : (elPanelWrapper?.offsetHeight ?? 200);
  return Math.max(120, elApp.clientHeight - elBottombar.offsetHeight - panelH);
}

async function collapsePreviewThenSettings() {
  const h = Math.round(elPreviewArea.getBoundingClientRect().height);
  elPreviewArea.style.flex = '0 0 auto';
  elPreviewArea.style.minHeight = '0';
  elPreviewArea.style.height = `${h}px`;
  elPreviewArea.style.overflow = 'hidden';
  void elPreviewArea.offsetHeight;

  elPreviewArea.style.transition =
    `height ${PREVIEW_COLLAPSE_MS}ms ${PREVIEW_EASE}, filter ${PREVIEW_COLLAPSE_MS}ms ${PREVIEW_EASE}`;

  elPreviewArea.classList.add('preview-strip-collapsed', 'preview-settings-muted', 'preview-content-hidden');
  stopPlaceholderAnim();

  requestAnimationFrame(() => {
    elPreviewArea.style.height = `${PREVIEW_STRIP_HEIGHT}px`;
  });

  await sleep(PREVIEW_COLLAPSE_MS + 40);
}

async function expandPreviewAfterControls() {
  elPreviewArea.classList.remove('preview-settings-muted');

  const target = computeExpandedPreviewHeight();
  elPreviewArea.style.flex = '0 0 auto';
  elPreviewArea.style.minHeight = '0';
  elPreviewArea.style.height = `${PREVIEW_STRIP_HEIGHT}px`;
  elPreviewArea.style.overflow = 'hidden';
  void elPreviewArea.offsetHeight;

  elPreviewArea.style.transition = `height ${PREVIEW_COLLAPSE_MS}ms ${PREVIEW_EASE}`;

  requestAnimationFrame(() => {
    elPreviewArea.style.height = `${target}px`;
  });

  await sleep(PREVIEW_COLLAPSE_MS + 50);

  elPreviewArea.classList.remove('preview-strip-collapsed', 'preview-content-hidden');
  elPreviewArea.style.height = '';
  elPreviewArea.style.flex = '';
  elPreviewArea.style.minHeight = '';
  elPreviewArea.style.overflow = '';
  elPreviewArea.style.transition = '';

  elApp?.classList.remove('settings-panel-open');
  if (elPanelWrapper) delete elPanelWrapper.dataset.naturalPanelHeight;

  if (!elDialogueContainer.classList.contains('active')) {
    startPlaceholderAnim();
  }
}

async function showPanel(panel) {
  if (panelTransitionLock || panel === activePanel) return;
  if (panel === 'settings' && (isPlaying || isPaused)) return;

  panelTransitionLock = true;
  if (panel === 'settings') {
    playMenuSound('settingsOpen');
  } else {
    playMenuSound('settingsClose');
  }

  try {
    if (panel === 'settings') {
      elSleeveSettings.classList.add('active');
      if (elPanelWrapper) {
        elPanelWrapper.dataset.naturalPanelHeight = String(
          Math.round(elPanelWrapper.getBoundingClientRect().height)
        );
      }
      elApp?.classList.add('settings-panel-open');
      await collapsePreviewThenSettings();
      elFlipCard.classList.add('flipped');
      activePanel = 'settings';
    } else {
      elFlipCard.classList.remove('flipped');
      elSleeveSettings.classList.remove('active');
      activePanel = 'controls';
      await sleep(FLIP_CARD_MS);
      await expandPreviewAfterControls();
    }
  } finally {
    panelTransitionLock = false;
  }
}

function updateSettingsSleeveBlockedState() {
  if (!elSleeveSettings) return;
  const blocked = isPlaying || isPaused;
  elSleeveSettings.classList.toggle('sleeve-tab-blocked', blocked);
  elSleeveSettings.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  elSleeveSettings.title = blocked
    ? 'Settings (available when dialogue is idle)'
    : 'Settings';
}

elSleeveSettings.addEventListener('click', () => {
  if (isPlaying || isPaused) return; /* forbidden sound: global pointerdown + aria-disabled */
  void showPanel(activePanel === 'settings' ? 'controls' : 'settings');
});

elSleeveCamera.addEventListener('click', () => {
  playMenuSound('forbidden');
});

// ── Mirrored Dialogue Toggle (Uiverse 3D switch) ────────────
function setMirrored(value) {
  dialogueMirrored = value;
  if (elInputMirrored) elInputMirrored.checked = value;
  elDialogueBox.classList.toggle('mirrored', value);
  elDialogueBox.classList.toggle('n64-mode', n64ModeEnabled);
  if (n64ModeEnabled && elDialogueText?.querySelector('.dialogue-scroll')) {
    renderN64DialogueTextCanvas();
  }
}

elInputMirrored?.addEventListener('change', () => {
  setMirrored(elInputMirrored.checked);
  playMenuSound('click');
});

const elInputN64 = document.getElementById('input-n64-mode');
function initN64ModeFromDom() {
  if (!elInputN64) return;
  try {
    const saved = localStorage.getItem(N64_MODE_STORAGE_KEY);
    if (saved !== null) {
      n64ModeEnabled = saved === 'true';
      elInputN64.checked = n64ModeEnabled;
    } else {
      n64ModeEnabled = elInputN64.checked;
    }
  } catch {
    n64ModeEnabled = elInputN64.checked;
  }
  syncN64ClassOnDialogueBox();
}
elInputN64?.addEventListener('change', () => {
  n64ModeEnabled = elInputN64.checked;
  try {
    localStorage.setItem(N64_MODE_STORAGE_KEY, String(n64ModeEnabled));
  } catch { /* ignore */ }
  syncN64ClassOnDialogueBox();
  redrawSpriteForN64Toggle();
  if (n64ModeEnabled) renderN64DialogueTextCanvas();
  else clearN64DialogueTextCanvas();
  playMenuSound('click');
});

updateSettingsSleeveBlockedState();
initN64ModeFromDom();

console.log(`[Dialoggo] v${appVersion} — ${characters.length} characters, ${genericSounds.length} generic sounds`);
