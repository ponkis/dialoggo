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
  playMenuSound('click');
}, true);

// Forbidden sound on disabled / not-allowed elements
document.addEventListener('click', (e) => {
  const el = e.target.closest('button:disabled, .char-btn.unavailable');
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

    this.speakTimer = null;
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

    ctx.clearRect(0, 0, cw, ch);

    const scale = Math.min(cw / img.width, ch / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  startIdle() {
    this.stop();
    this.mode = 'idle';
    this.frameIndex = 0;
    this.idleDirection = 1;
    this.showFrame(this.idleFrames, 0);

    this.idleTimer = setInterval(() => {
      this.frameIndex += this.idleDirection;
      if (this.frameIndex >= IDLE_FRAME_COUNT - 1) {
        this.idleDirection = -1;
      } else if (this.frameIndex <= 0) {
        this.idleDirection = 1;
      }
      this.showFrame(this.idleFrames, this.frameIndex);
    }, this.idleFrameDelay);
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
      clearInterval(this.idleTimer);
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
const elPreviewArea = document.getElementById('preview-area');
const elPlaceholder = document.getElementById('preview-placeholder');
const elPlaceholderAnim = document.getElementById('placeholder-anim');
const elDialogueContainer = document.getElementById('dialogue-container');
const elDialogueBox = document.getElementById('dialogue-box');
const elDialogueText = document.getElementById('dialogue-text');
const elSpriteCanvas = document.getElementById('sprite-canvas');
const elStatusDot = document.getElementById('status-dot');
const elCharCount = document.getElementById('char-count');
const elVersionLabel = document.getElementById('version-label');

const spriteRenderer = new SpriteRenderer(elSpriteCanvas);

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

    btn.addEventListener('click', () => selectCharacter(char));

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
function splitTextIntoLines(text, maxCharsPerLine = 34) {
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

  const text = elInput.value.trim();
  if (!text) return;

  const charMsPerChar = 40;
  const char = selectedCharacter;

  elBtnPlay.disabled = true;
  elBtnPause.disabled = false;
  elBtnStop.disabled = false;
  document.querySelectorAll('.char-btn').forEach(btn => (btn.disabled = true));
  elStatusDot.classList.add('playing');

  elPlaceholder.classList.add('fade-out');
  elDialogueContainer.classList.add('active');

  elDialogueText.innerHTML = '';
  elDialogueBox.className = 'dialogue-box';

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

  speechLoop.start(char.sounds);

  while (lineIndex < lines.length && !stopRequested) {
    const line = lines[lineIndex];

    speechLoop.pause();
    spriteRenderer.resetToIdle();

    if (totalLinesAdded >= 2) {
      const scrollY = (totalLinesAdded - 1) * LINE_HEIGHT;
      scrollWrapper.style.transform = `translateY(-${scrollY}px)`;
      await sleep(350);
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

  await finishDialogue();
}

async function finishDialogue() {
  speechLoop.stop();
  spriteRenderer.stop();

  elDialogueText.innerHTML = '';
  elDialogueText.classList.remove('centered');

  elDialogueBox.className = 'dialogue-box shrink';

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
  elDialogueBox.className = 'dialogue-box';
  elDialogueText.innerHTML = '';
  elPlaceholder.classList.remove('fade-out');

  isPlaying = false;
  isPaused = false;
  stopRequested = false;
  elBtnStop.disabled = true;
  elBtnPause.disabled = true;
  elBtnPlay.title = 'Play';
  elStatusDot.classList.remove('playing');

  document.querySelectorAll('.char-btn').forEach(btn => {
    const id = btn.dataset.id;
    const c = characters.find(ch => ch.id === id);
    btn.disabled = !(c && c.isAvailable);
  });
  updatePlayButton();
}

function stopDialogue() {
  stopRequested = true;
  isPaused = false;
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
}

function doPause() {
  if (!isPlaying || isPaused) return;
  isPaused = true;
  // Fully stop the speech loop (kills audio + exits async loop)
  speechLoop.stop();
  // Stop all sprite timers, then smoothly close mouth
  spriteRenderer.stop();
  spriteRenderer.smoothCloseAndIdle();
  spriteRenderer.startIdleAfterDelay(2000);
  elBtnPlay.disabled = false;
  elBtnPlay.title = 'Resume';
  elBtnPause.disabled = true;
  elStatusDot.classList.remove('playing');
}

function doResume() {
  if (!isPlaying || !isPaused) return;
  // Stop idle timers, show neutral s1
  spriteRenderer.stop();
  spriteRenderer.frameIndex = 0;
  spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);
  // Restart the speech loop fresh with same character sounds
  if (selectedCharacter) {
    speechLoop.start(selectedCharacter.sounds);
  }
  resumeFromPause();
  elBtnPlay.disabled = true;
  elBtnPlay.title = 'Play';
  elBtnPause.disabled = false;
  elStatusDot.classList.add('playing');
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

console.log(`[Dialoggo] v${appVersion} — ${characters.length} characters, ${genericSounds.length} generic sounds`);
