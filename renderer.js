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

// ── Character Discovery ─────────────────────────────────────
function discoverCharacters() {
  const characters = [];
  if (!fs.existsSync(IMG_DIR)) return characters;

  const dirs = fs.readdirSync(IMG_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const name of dirs) {
    // Check for individual sprite files: s1.png-s6.png, i1.png-i4.png
    const speakFrames = [];
    const idleFrames = [];

    for (let i = 1; i <= SPEAK_FRAME_COUNT; i++) {
      const sp = path.join(IMG_DIR, name, `s${i}.png`);
      if (fs.existsSync(sp)) speakFrames.push(sp);
    }

    for (let i = 1; i <= IDLE_FRAME_COUNT; i++) {
      const ip = path.join(IMG_DIR, name, `i${i}.png`);
      if (fs.existsSync(ip)) idleFrames.push(ip);
    }

    // Need all required speaking and idle frames
    if (speakFrames.length !== SPEAK_FRAME_COUNT || idleFrames.length !== IDLE_FRAME_COUNT) continue;

    // Find sound files
    const sndDir = path.join(SND_DIR, name);
    const soundFiles = [];
    if (fs.existsSync(sndDir)) {
      const files = fs.readdirSync(sndDir).filter(f => /\.(wav|mp3|ogg)$/i.test(f));
      for (const f of files) soundFiles.push(path.join(sndDir, f));
    }

    characters.push({
      id: name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      speakFrames,
      idleFrames,
      sounds: soundFiles,
    });
  }

  return characters;
}

// Discover generic intro/outro sounds
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
let stopRequested = false;

// Audio context
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

// Play a sound file, return promise that resolves with duration
async function playSoundFile(filePath) {
  const buffer = await loadAudioBuffer(filePath);
  const { source, duration } = playAudioBuffer(buffer);
  return new Promise((resolve) => {
    source.onended = () => resolve(duration);
    // Fallback timeout in case onended doesn't fire
    setTimeout(() => resolve(duration), duration * 1000 + 100);
  });
}

// ── Speech Sound Loop (Banjo-Kazooie style) ────────────────
// Plays random character audio clips back-to-back in a loop,
// independent of text speed. Can be started/paused/stopped.
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

  // Start the loop with the given sound file list
  start(soundFiles) {
    this.stop(); // ensure clean state
    this.sounds = soundFiles;
    this.running = true;
    this.paused = false;
    this._abortController = new AbortController();
    this._loopPromise = this._loop();
  }

  // Pause: stop playing new clips, let current one finish, go idle
  pause() {
    this.paused = true;
  }

  // Resume playing clips
  resume() {
    this.paused = false;
  }

  // Fully stop the loop and any playing sound
  stop() {
    this.running = false;
    this.paused = false;
    if (this.currentSource) {
      if (this.currentGainNode && audioCtx) {
        // Smoothly fade out the last clip over 50ms
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
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.spriteRenderer.resetToIdle();
  }

  async _loop() {
    while (this.running) {
      // If paused, wait in idle until resumed or stopped
      if (this.paused) {
        this.spriteRenderer.resetToIdle();
        await sleep(50);
        continue;
      }

      if (this.sounds.length === 0) {
        await sleep(50);
        continue;
      }

      // Pick a random sound
      const soundFile = pick(this.sounds);

      try {
        const buffer = await loadAudioBuffer(soundFile);
        if (!this.running) break;

        // Check pause again right before playing
        if (this.paused) continue;

        const { source, gainNode, duration } = playAudioBuffer(buffer);
        this.currentSource = source;
        this.currentGainNode = gainNode;
        const durationMs = duration * 1000;

        // Animate sprite mouth based on clip duration
        this.spriteRenderer.startSpeaking(durationMs);

        // Wait for the clip to finish
        await new Promise((resolve) => {
          source.onended = resolve;
          setTimeout(resolve, durationMs + 50);
        });

        this.currentSource = null;
        this.currentGainNode = null;
      } catch (err) {
        // If aborted or error, just continue
        this.currentSource = null;
        this.currentGainNode = null;
        if (!this.running) break;
      }
    }

    // Cleanup when loop exits
    this.spriteRenderer.resetToIdle();
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
    this.mode = 'idle'; // 'idle' | 'speaking'
    this.idleFrames = [];  // array of file paths
    this.speakFrames = []; // array of file paths
    // Preloaded Image objects keyed by path
    this.frameImages = new Map();

    // Idle animation
    this.idleTimer = null;
    this.idleDirection = 1;
    this.idleFrameDelay = 120; // ms per frame in idle

    // Speaking animation
    this.speakTimer = null;
  }

  async loadCharacter(character) {
    this.stop();
    this.idleFrames = character.idleFrames;
    this.speakFrames = character.speakFrames;

    // Preload all frames into Image objects
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

    // Clear completely — prevents ghosting
    ctx.clearRect(0, 0, cw, ch);

    // Scale to fit canvas while keeping aspect ratio
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

  // Speaking: open mouth proportional to audio duration
  startSpeaking(audioDurationMs) {
    this.stopSpeaking();
    
    // If we were already speaking, keep the mouth position instead of snapping to 0
    let currentFrame = this.mode === 'speaking' ? this.frameIndex : 0;
    this.mode = 'speaking';

    // Determine how many frames to reach based on duration
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
      maxFrame = 5; // full open (index 5 = 6th frame)
    }

    const totalFrames = maxFrame + 1;
    const openTime = Math.min(audioDurationMs * 0.6, audioDurationMs);
    // Smooth out short clips by enforcing a minimum frame transition time
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

  // Smoothly close the mouth instead of snapping to 0 instantly
  resetToIdle() {
    this.stopSpeaking();
    this.mode = 'idle';

    if (this.frameIndex > 0) {
      // Fast animate closing
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
      }, 30); // 30ms per frame down to 0
    } else {
      this.frameIndex = 0;
      this.showFrame(this.speakFrames.length ? this.speakFrames : this.idleFrames, 0);
    }
  }

  stopSpeaking() {
    if (this.speakTimer) {
      clearInterval(this.speakTimer);
      this.speakTimer = null;
    }
  }

  stop() {
    this.stopSpeaking();
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
const elBtnStop = document.getElementById('btn-stop');
const elPreviewArea = document.getElementById('preview-area');
const elPlaceholder = document.getElementById('preview-placeholder');
const elDialogueContainer = document.getElementById('dialogue-container');
const elDialogueBox = document.getElementById('dialogue-box');
const elDialogueText = document.getElementById('dialogue-text');
const elSpriteCanvas = document.getElementById('sprite-canvas');
const elStatusDot = document.getElementById('status-dot');
const elStatusText = document.getElementById('status-text');

const spriteRenderer = new SpriteRenderer(elSpriteCanvas);

// ── Build Character Grid ────────────────────────────────────
function buildCharacterGrid() {
  elCharGrid.innerHTML = '';

  for (const char of characters) {
    const btn = document.createElement('button');
    btn.className = 'char-btn';
    btn.dataset.id = char.id;

    // Mini sprite preview using i1 img
    const spriteWrap = document.createElement('div');
    spriteWrap.className = 'char-btn-sprite';
    const miniImg = document.createElement('img');
    miniImg.src = fileToSrc(char.idleFrames[0]);
    miniImg.alt = char.displayName;
    spriteWrap.appendChild(miniImg);

    const label = document.createElement('span');
    label.textContent = char.displayName;

    btn.appendChild(spriteWrap);
    btn.appendChild(label);

    btn.addEventListener('click', () => selectCharacter(char));

    elCharGrid.appendChild(btn);
  }
}

// ── Select Character ────────────────────────────────────────
function selectCharacter(char) {
  selectedCharacter = char;

  // Update button states
  document.querySelectorAll('.char-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === char.id);
  });

  // Load sprite into main canvas
  spriteRenderer.loadCharacter(char);

  updatePlayButton();
}

// ── Update Play Button State ────────────────────────────────
function updatePlayButton() {
  const hasText = elInput.value.trim().length > 0;
  const hasChar = selectedCharacter !== null;
  elBtnPlay.disabled = !hasText || !hasChar || isPlaying;
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
// Splits text into lines that fit the dialogue box width
// Handles manual newlines (\n) and auto-breaks overly long words.
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

      // Handle words that are longer than the entire line width naturally
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

// Characters that trigger a pause in the sound loop
const PAUSE_CHARS = new Set(['.', ',', '!', '?', ':', ';']);

// ── Main Dialogue Playback ─────────────────────────────────
async function playDialogue() {
  if (isPlaying || !selectedCharacter) return;
  isPlaying = true;
  stopRequested = false;

  const text = elInput.value.trim();
  if (!text) return;

  const charMsPerChar = 40; // Fixed speed since UI slider was removed
  const char = selectedCharacter;

  // Update UI
  elBtnPlay.disabled = true;
  elBtnStop.disabled = false;
  elStatusDot.classList.add('playing');
  elStatusText.textContent = 'Playing';
  elPlaceholder.style.display = 'none';
  elDialogueContainer.classList.add('active');

  // Reset dialogue text
  elDialogueText.innerHTML = '';

  // Reset all animation classes
  elDialogueBox.className = 'dialogue-box';

  // ── Phase 1a: Show container + slide in as circle ────
  elDialogueContainer.classList.add('active');

  // Force a reflow so the initial state (off-screen) is applied
  void elDialogueBox.offsetWidth;

  // Slide circle in from left
  elDialogueBox.classList.add('slide-in');

  // Play first intro sound during slide-in
  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(400),
  ]);

  if (stopRequested) { speechLoop.stop(); await finishDialogue(); return; }

  // ── Phase 1b: Expand circle to full rectangle ────────
  elDialogueBox.classList.remove('slide-in');
  elDialogueBox.classList.add('expand');

  // Play second intro sound during expand
  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(450),
  ]);

  if (stopRequested) { speechLoop.stop(); await finishDialogue(); return; }

  // ── Phase 2: Text scrolling with speech ──────────────
  const lines = splitTextIntoLines(text);
  const isMultiLine = lines.length > 1;
  let lineIndex = 0;

  // Set up vertical alignment: centered if single line, top if multi-line
  if (!isMultiLine) {
    elDialogueText.classList.add('centered');
  } else {
    elDialogueText.classList.remove('centered');
  }

  // Create scroll wrapper inside dialogue text
  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'dialogue-scroll';
  elDialogueText.appendChild(scrollWrapper);

  const LINE_HEIGHT = 33; // px, must match CSS .line height
  let totalLinesAdded = 0;

  // Start the independent sound loop
  speechLoop.start(char.sounds);

  while (lineIndex < lines.length && !stopRequested) {
    const line = lines[lineIndex];

    // Pause sound loop between lines (line change pause)
    speechLoop.pause();
    spriteRenderer.resetToIdle();

    // If we have more than 2 lines, scroll the wrapper up
    if (totalLinesAdded >= 2) {
      const scrollY = (totalLinesAdded - 1) * LINE_HEIGHT;
      scrollWrapper.style.transform = `translateY(-${scrollY}px)`;
      await sleep(350); // wait for scroll animation
    }

    // Create new line element
    const lineEl = document.createElement('span');
    lineEl.className = 'line';
    lineEl.textContent = '';
    scrollWrapper.appendChild(lineEl);
    totalLinesAdded++;

    // Brief pause before starting new line
    if (lineIndex > 0) await sleep(200);

    // Resume sound loop for this line
    speechLoop.resume();

    // Type out characters
    for (let i = 0; i < line.length; i++) {
      if (stopRequested) break;

      lineEl.textContent = line.substring(0, i + 1);
      const ch = line[i];

      // Check if this is a punctuation pause character
      if (PAUSE_CHARS.has(ch)) {
        // Pause the sound loop on full stops / punctuation
        speechLoop.pause();
        spriteRenderer.resetToIdle();
        // Longer pause for periods/exclamation/question, shorter for commas
        const pauseDuration = (ch === '.' || ch === '!' || ch === '?') ? 400 : 200;
        await sleep(pauseDuration);
        // Resume after pause (unless next char is also punctuation)
        if (i < line.length - 1 && !PAUSE_CHARS.has(line[i + 1])) {
          speechLoop.resume();
        }
      } else if (ch === ' ') {
        // Spaces: slightly shorter delay, sound keeps playing
        await sleep(charMsPerChar * 0.6);
      } else {
        // Normal character: standard typing delay
        await sleep(charMsPerChar);
      }
    }

    lineIndex++;
  }

  // ── Phase 3: Stop sound, hold final text, then outro ──
  speechLoop.stop();
  spriteRenderer.resetToIdle();

  if (!stopRequested) {
    spriteRenderer.startIdle();
    await sleep(1200); // Hold final text
  }

  await finishDialogue();
}

async function finishDialogue() {
  // Stop speech loop + sprite animation
  speechLoop.stop();
  spriteRenderer.stop();

  // Clear text and reset alignment
  elDialogueText.innerHTML = '';
  elDialogueText.classList.remove('centered');

  // ── Outro Phase 1: Shrink to circle ──────────────────
  elDialogueBox.className = 'dialogue-box shrink';

  // Play first outro sound during shrink
  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(400),
  ]);

  // ── Outro Phase 2: Slide out to left ─────────────────
  elDialogueBox.classList.remove('shrink');
  elDialogueBox.classList.add('slide-out');

  // Play second outro sound during slide-out
  await Promise.all([
    (async () => {
      if (genericSounds.length > 0) await playSoundFile(pick(genericSounds));
    })(),
    sleep(350),
  ]);

  // Reset everything
  elDialogueContainer.classList.remove('active');
  elDialogueBox.className = 'dialogue-box';
  elDialogueText.innerHTML = '';
  elPlaceholder.style.display = '';

  isPlaying = false;
  stopRequested = false;
  elBtnStop.disabled = true;
  elStatusDot.classList.remove('playing');
  elStatusText.textContent = 'Ready';
  updatePlayButton();
}

function stopDialogue() {
  stopRequested = true;
  speechLoop.stop();
}

// ── Event Listeners ─────────────────────────────────────────
elBtnPlay.addEventListener('click', playDialogue);
elBtnStop.addEventListener('click', stopDialogue);

// ── Init ────────────────────────────────────────────────────
buildCharacterGrid();

// Auto-select first character if available
if (characters.length > 0) {
  selectCharacter(characters[0]);
}

console.log(`[Dialoggo] Loaded ${characters.length} characters, ${genericSounds.length} generic sounds`);
