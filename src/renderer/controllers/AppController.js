const {
  createAppModel
} = require('../models/AppModel');
const {
  createAudioService
} = require('../services/AudioService');
const {
  createAppView
} = require('../views/AppView');
const {
  getDialoggoBridge,
} = require('../runtime/getBridge');

function startApp() {
  const bridge = getDialoggoBridge();
  const model = createAppModel();
  const audioService = createAudioService(model);
  const view = createAppView(model, audioService);

  const {
    state,
    constants,
    characters,
    genericSounds,
    storageKeys
  } = model;
  const refs = view.refs;
  const spriteRenderer = view.spriteRenderer;
  const speechLoop = audioService.createSpeechLoop(spriteRenderer);
  const pauseChars = new Set(['.', ',', '!', '?', ':', ';']);

  function canFastForward() {
    return state.isPlaying && !state.isPaused && !state.stopRequested;
  }

  function getFastForwardTextMultiplier() {
    return state.isFastForwarding ? constants.FAST_FORWARD_TEXT_MULTIPLIER : 1;
  }

  function syncN64ModeFromCheckbox() {
    if (refs.inputN64) state.n64ModeEnabled = refs.inputN64.checked;
  }

  function blurPlaybackButtonFocus() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (!activeElement.matches('#btn-play, #btn-pause, #btn-stop, #btn-fastforward')) return;
    activeElement.blur();
  }

  function syncCharacterButtonAvailability() {
    const interactionLocked = state.isPlaying || state.isPaused || state.stopRequested;
    document.querySelectorAll('.char-btn').forEach((button) => {
      const id = button.dataset.id;
      const character = characters.find((item) => item.id === id);
      button.disabled = interactionLocked || !(character && character.isAvailable);
    });
  }

  function syncPlaybackUiState() {
    const hasText = refs.input.value.trim().length > 0;
    const hasCharacter = state.selectedCharacter !== null;
    const interactionLocked = state.isPlaying || state.isPaused || state.stopRequested;

    view.setActionButtonBlocked(
      refs.btnPlay,
      state.stopRequested || !hasText || !hasCharacter || (state.isPlaying && !state.isPaused),
    );
    refs.btnPlay.title = state.isPaused ? 'Resume' : 'Play';
    view.setActionButtonBlocked(
      refs.btnPause,
      state.stopRequested || !state.isPlaying || state.isPaused || state.pauseTransitionLock,
    );
    view.setActionButtonBlocked(refs.btnStop, state.stopRequested || !state.isPlaying);
    view.setActionButtonBlocked(refs.btnUpload, interactionLocked);
    view.setInputLocked(state.isPlaying || state.isPaused);
    syncCharacterButtonAvailability();
    updateFastForwardAvailability();
    updateSettingsSleeveBlockedState();
  }

  function updatePlayButton() {
    syncPlaybackUiState();
  }

  function updateFastForwardAvailability() {
    view.updateFastForwardAvailability(canFastForward());
  }

  async function sleepPlaybackPaced(ms) {
    let virtualElapsed = 0;

    while (virtualElapsed < ms && !state.stopRequested) {
      await waitWhilePaused();
      if (state.stopRequested) break;

      const realStep = Math.min(20, Math.max(6, ms - virtualElapsed));
      await model.sleep(realStep);
      virtualElapsed += realStep * getFastForwardTextMultiplier();
    }
  }

  function syncFastForwardState() {
    const next = canFastForward() && (state.fastForwardKeyHeld || state.fastForwardButtonHeld);
    if (next === state.isFastForwarding) {
      updateFastForwardAvailability();
      return;
    }

    state.isFastForwarding = next;
    speechLoop.setFastForward(next);
    updateFastForwardAvailability();
  }

  function resetFastForwardState() {
    state.fastForwardKeyHeld = false;
    state.fastForwardButtonHeld = false;
    syncFastForwardState();
  }

  function waitWhilePaused() {
    if (!state.isPaused) return Promise.resolve();

    return new Promise((resolve) => {
      state.pauseResolve = resolve;
    });
  }

  function resumeFromPause() {
    state.isPaused = false;
    if (!state.pauseResolve) return;

    const resolve = state.pauseResolve;
    state.pauseResolve = null;
    resolve();
  }

  function setMirrored(value) {
    state.dialogueMirrored = value;
    if (refs.inputMirrored) refs.inputMirrored.checked = value;
    refs.dialogueBox.classList.toggle('mirrored', value);
    refs.dialogueBox.classList.toggle('n64-mode', state.n64ModeEnabled);
    if (state.n64ModeEnabled && refs.dialogueText?.querySelector('.dialogue-scroll')) {
      view.renderN64DialogueTextCanvas();
    }
  }

  function selectCharacter(character) {
    if (state.isPlaying) return;
    if (!character?.isAvailable) return;
    if (state.selectedCharacter?.id === character.id) return;

    state.selectedCharacter = character;
    view.updateSelectedCharacterCard(character);

    spriteRenderer.loadCharacter(character);
    audioService.playMenuSound('select');

    if (character.sounds.length > 0) {
      const randomClip = model.pick(character.sounds);
      const semitoneOffset = model.getCharacterPitchSemitoneOffset(character);
      const playbackRate = model.semitoneOffsetToRate(semitoneOffset);

      audioService.loadAudioBuffer(randomClip)
        .then((buffer) => audioService.playAudioBuffer(buffer, {
          playbackRate
        }))
        .catch(() => { });
    }

    updatePlayButton();
  }

  function handleDialogueInputChange() {
    view.normalizeDialogueInput();
    updatePlayButton();
  }

  async function playDialogue() {
    if (state.isPaused) {
      doResume();
      return;
    }

    if (state.isPlaying || !state.selectedCharacter) return;

    state.isPlaying = true;
    state.isPaused = false;
    state.stopRequested = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();
    syncPlaybackUiState();

    view.normalizeDialogueInput();
    const text = model.clampDialogueInputValue(refs.input.value).trim();
    if (!text) {
      state.isPlaying = false;
      syncPlaybackUiState();
      return;
    }

    const charMsPerChar = 40;
    const character = state.selectedCharacter;

    blurPlaybackButtonFocus();

    refs.statusDot.classList.add('playing');
    refs.statusDot.classList.remove('paused');

    refs.dialogueContainer.classList.add('active');
    view.syncPreviewPlaceholderState();

    syncN64ModeFromCheckbox();
    refs.dialogueText.innerHTML = '';
    view.clearN64DialogueTextCanvas();
    refs.dialogueBox.className = `dialogue-box${view.dialogueBoxExtraClasses()}`;
    refs.dialogueBox.classList.toggle('n64-mode', state.n64ModeEnabled);
    refs.dialogueBox.classList.toggle('mirrored', state.dialogueMirrored);

    spriteRenderer.stop();
    spriteRenderer.frameIndex = 0;
    spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);

    void refs.dialogueBox.offsetWidth;
    refs.dialogueBox.classList.add('slide-in');

    await Promise.all([
      (async () => {
        if (genericSounds.length > 0) await audioService.playSoundFile(model.pick(genericSounds));
      })(),
      model.sleep(400),
    ]);

    if (state.stopRequested) {
      speechLoop.stop();
      spriteRenderer.startIdleAfterDelay(2000);
      await finishDialogue();
      return;
    }

    refs.dialogueBox.classList.remove('slide-in');
    refs.dialogueBox.classList.add('expand');
    syncN64ModeFromCheckbox();
    refs.dialogueBox.classList.toggle('n64-mode', state.n64ModeEnabled);
    refs.dialogueBox.classList.toggle('mirrored', state.dialogueMirrored);

    await Promise.all([
      (async () => {
        if (genericSounds.length > 0) await audioService.playSoundFile(model.pick(genericSounds));
      })(),
      model.sleep(450),
    ]);

    if (state.stopRequested) {
      speechLoop.stop();
      spriteRenderer.startIdleAfterDelay(2000);
      await finishDialogue();
      return;
    }

    const lines = model.splitStyledTextIntoLines(text);
    const isMultiLine = lines.length > 1;
    let lineIndex = 0;

    refs.dialogueText.classList.toggle('centered', !isMultiLine);

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'dialogue-scroll';
    refs.dialogueText.appendChild(scrollWrapper);

    const lineHeight = 33;
    let totalLinesAdded = 0;

    if (state.n64ModeEnabled) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      view.renderN64DialogueTextCanvas();
    }

    speechLoop.start(character.sounds, character);

    if (state.isPaused) {
      speechLoop.pause();
      speechLoop._killCurrentAudio();
      await waitWhilePaused();
      if (!state.stopRequested) speechLoop.resume();
    }

    try {
      while (lineIndex < lines.length && !state.stopRequested) {
        const line = lines[lineIndex];

        speechLoop.pause();
        spriteRenderer.resetToIdle();

        if (totalLinesAdded >= 2) {
          const scrollY = (totalLinesAdded - 1) * lineHeight;
          scrollWrapper.style.transform = `translateY(-${scrollY}px)`;
          if (state.n64ModeEnabled) {
            await Promise.all([
              view.n64RepaintDuringScrollTransition(scrollWrapper, 350),
              sleepPlaybackPaced(350),
            ]);
          } else {
            await sleepPlaybackPaced(350);
          }
        }

        const lineElement = document.createElement('span');
        lineElement.className = 'line';
        lineElement.textContent = '';
        scrollWrapper.appendChild(lineElement);
        totalLinesAdded += 1;

        if (lineIndex > 0) await sleepPlaybackPaced(200);

        speechLoop.resume();

        for (let i = 0; i < line.characters.length; i += 1) {
          if (state.stopRequested) break;

          await waitWhilePaused();
          if (state.stopRequested) break;

          view.appendDialogueCharacter(lineElement, line.characters[i], i);
          if (state.n64ModeEnabled) view.renderN64DialogueTextCanvas();

          const currentChar = line.characters[i].value;
          if (pauseChars.has(currentChar)) {
            speechLoop.pause();
            spriteRenderer.resetToIdle();
            const pauseDuration = (currentChar === '.' || currentChar === '!' || currentChar === '?') ? 400 : 200;
            await sleepPlaybackPaced(pauseDuration);
            if (i < line.characters.length - 1 && !pauseChars.has(line.characters[i + 1].value)) {
              speechLoop.resume();
            }
          } else if (currentChar === ' ') {
            await sleepPlaybackPaced(charMsPerChar * 0.6);
          } else {
            await sleepPlaybackPaced(charMsPerChar);
          }
        }

        lineIndex += 1;
      }

      await speechLoop.gracefulStop();
      spriteRenderer.startIdleAfterDelay(2000);

      if (!state.stopRequested) {
        await sleepPlaybackPaced(500);
      }
    } catch (error) {
      console.error('[Dialoggo] playDialogue playback error', error);
      bridge.log.error('Dialogue playback error', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      });
      speechLoop.stop();
      spriteRenderer.stop();
      spriteRenderer.startIdleAfterDelay(2000);
    }

    await finishDialogue();
  }

  async function finishDialogue() {
    speechLoop.stop();
    spriteRenderer.stop();

    refs.dialogueText.innerHTML = '';
    refs.dialogueText.classList.remove('centered');
    view.clearN64DialogueTextCanvas();
    refs.dialogueBox.className = `dialogue-box shrink${view.dialogueBoxExtraClasses()}`;

    await Promise.all([
      (async () => {
        if (genericSounds.length > 0) await audioService.playSoundFile(model.pick(genericSounds));
      })(),
      model.sleep(400),
    ]);

    refs.dialogueBox.classList.remove('shrink');
    refs.dialogueBox.classList.add('slide-out');

    await Promise.all([
      (async () => {
        if (genericSounds.length > 0) await audioService.playSoundFile(model.pick(genericSounds));
      })(),
      model.sleep(350),
    ]);

    refs.dialogueContainer.classList.remove('active');
    refs.dialogueBox.className = `dialogue-box${view.dialogueBoxExtraClasses()}`;
    refs.dialogueText.innerHTML = '';
    view.clearN64DialogueTextCanvas();

    state.isPlaying = false;
    state.isPaused = false;
    state.stopRequested = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();
    refs.statusDot.classList.remove('playing');
    refs.statusDot.classList.remove('paused');
    view.syncPreviewPlaceholderState();
    syncPlaybackUiState();
  }

  function stopDialogue() {
    state.stopRequested = true;
    state.isPaused = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();
    syncPlaybackUiState();

    if (state.pauseResolve) {
      const resolve = state.pauseResolve;
      state.pauseResolve = null;
      resolve();
    }

    speechLoop.stop();
    spriteRenderer.stop();
    spriteRenderer.frameIndex = 0;
    spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);
    spriteRenderer.startIdleAfterDelay(2000);
    refs.statusDot.classList.remove('paused');
  }

  function doPause() {
    if (!state.isPlaying || state.isPaused || state.pauseTransitionLock) return;

    state.pauseTransitionLock = true;
    state.isPaused = true;
    resetFastForwardState();

    speechLoop.pause();
    speechLoop._killCurrentAudio();
    spriteRenderer.stop();
    spriteRenderer.smoothCloseAndIdle();
    spriteRenderer.startIdleAfterDelay(2000);
    refs.statusDot.classList.remove('playing');
    refs.statusDot.classList.add('paused');
    syncPlaybackUiState();

    setTimeout(() => {
      state.pauseTransitionLock = false;
      syncPlaybackUiState();
    }, 140);
  }

  function doResume() {
    if (!state.isPlaying || !state.isPaused || state.pauseTransitionLock) return;

    state.pauseTransitionLock = true;
    resetFastForwardState();

    spriteRenderer.stop();
    spriteRenderer.frameIndex = 0;
    spriteRenderer.showFrame(spriteRenderer.speakFrames, 0);
    speechLoop.resume();
    resumeFromPause();
    refs.statusDot.classList.add('playing');
    refs.statusDot.classList.remove('paused');
    syncPlaybackUiState();

    setTimeout(() => {
      state.pauseTransitionLock = false;
      syncPlaybackUiState();
    }, 140);
  }

  function resetPreviewAreaInlineStyles() {
    refs.previewArea.style.height = '';
    refs.previewArea.style.flex = '';
    refs.previewArea.style.minHeight = '';
    refs.previewArea.style.overflow = '';
    refs.previewArea.style.transition = '';
  }

  function clearExpandedPanelFlow() {
    refs.app?.classList.remove('settings-panel-open');
    if (refs.panelWrapper) delete refs.panelWrapper.dataset.naturalPanelHeight;
  }

  function syncFrontPanelLayout(options = {}) {
    const suppressPlaceholder = options.suppressPlaceholder === true;

    refs.previewArea.classList.remove('preview-settings-muted', 'preview-strip-collapsed', 'preview-content-hidden', 'preview-content-exiting');
    view.setPreviewPlaceholderSuppressed(suppressPlaceholder);

    resetPreviewAreaInlineStyles();
    clearExpandedPanelFlow();
    view.syncPreviewPlaceholderState();
  }

  async function showPanel(panel) {
    if (state.panelTransitionLock || panel === state.activePanel) return;
    if (panel === 'settings' && (state.isPlaying || state.isPaused)) return;

    state.panelTransitionLock = true;
    const large = view.isLargeScreen();
    const previousPanel = state.activePanel;
    const hasCollapsedPreviewFlow = refs.app?.classList.contains('settings-panel-open');
    const leavingSettings = previousPanel === 'settings';
    view.setPreviewPlaceholderPanelIntent(panel);
    view.setPreviewPlaceholderSuppressed(panel !== 'controls');

    try {
      if (panel === 'settings') {
        view.syncSettingsLayoutMode('settings');
        refs.sleeveBackgrounds.classList.remove('active');
        refs.sleeveSettings.classList.add('active');

        if (!large && !hasCollapsedPreviewFlow && refs.panelWrapper) {
          refs.panelWrapper.dataset.naturalPanelHeight = String(
            Math.round(refs.panelWrapper.getBoundingClientRect().height),
          );
        }

        if (large) {
          refs.previewArea.classList.add('preview-settings-muted', 'preview-content-hidden', 'preview-content-exiting');
          view.setPreviewPlaceholderSuppressed(true);
        } else if (!hasCollapsedPreviewFlow) {
          refs.app?.classList.add('settings-panel-open');
          await view.collapsePreviewThenSettings();
        }

        audioService.playMenuSound('settingsOpen');
        await view.flipPanel(previousPanel, 'settings');
        state.activePanel = 'settings';
      } else if (panel === 'backgrounds') {
        refs.sleeveSettings.classList.remove('active');
        refs.sleeveBackgrounds.classList.add('active');
        audioService.playMenuSound('settingsOpen');
        await view.flipPanel(previousPanel, 'backgrounds');
        state.frontPanel = 'backgrounds';
        state.activePanel = 'backgrounds';
        view.syncSettingsLayoutMode('controls');

        if (leavingSettings && hasCollapsedPreviewFlow) {
          await view.expandPreviewAfterControls({
            keepPlaceholderSuppressed: true,
          });
        } else {
          syncFrontPanelLayout({
            suppressPlaceholder: true,
          });
        }
      } else {
        refs.sleeveSettings.classList.remove('active');
        refs.sleeveBackgrounds.classList.remove('active');
        audioService.playMenuSound('settingsClose');
        await view.flipPanel(previousPanel, 'controls');
        state.frontPanel = 'controls';
        state.activePanel = 'controls';
        view.syncSettingsLayoutMode('controls');

        if (leavingSettings && hasCollapsedPreviewFlow) {
          await view.expandPreviewAfterControls();
        } else {
          syncFrontPanelLayout();
        }
      }
    } finally {
      view.setPreviewPlaceholderPanelIntent(null);
      state.panelTransitionLock = false;
    }
  }

  function updateSettingsSleeveBlockedState() {
    const setBlockedState = (element, blocked, idleTitle, blockedTitle) => {
      if (!element) return;
      element.classList.toggle('sleeve-tab-blocked', blocked);
      element.setAttribute('aria-disabled', blocked ? 'true' : 'false');
      element.title = blocked ? blockedTitle : idleTitle;
    };

    const blocked = state.isPlaying || state.isPaused || state.stopRequested;
    setBlockedState(refs.sleeveSettings, blocked, 'Settings', 'Settings');
    setBlockedState(refs.sleeveBackgrounds, false, 'Backgrounds', 'Backgrounds');
    setBlockedState(refs.sleeveCharacter, blocked, 'Character', 'Character');
    setBlockedState(refs.sleeveCamera, blocked, 'Export', 'Export');
  }

  function initN64ModeFromDom() {
    if (!refs.inputN64) return;

    try {
      const saved = localStorage.getItem(storageKeys.n64Mode);
      if (saved !== null) {
        state.n64ModeEnabled = saved === 'true';
        refs.inputN64.checked = state.n64ModeEnabled;
      } else {
        state.n64ModeEnabled = refs.inputN64.checked;
      }
    } catch {
      state.n64ModeEnabled = refs.inputN64.checked;
    }

    view.syncN64ClassOnDialogueBox();
  }

  function applyHideBrokenChars() {
    document.querySelectorAll('.char-btn.unavailable').forEach((button) => {
      button.classList.toggle('hidden-broken', state.hideBrokenChars);
    });
    view.applyCharacterFilters();
  }

  function initHideBrokenFromStorage() {
    if (!refs.inputHideBroken) return;

    try {
      const saved = localStorage.getItem(storageKeys.hideBrokenChars);
      if (saved !== null) {
        state.hideBrokenChars = saved === 'true';
        refs.inputHideBroken.checked = state.hideBrokenChars;
      } else {
        state.hideBrokenChars = refs.inputHideBroken.checked;
      }
    } catch {
      state.hideBrokenChars = refs.inputHideBroken.checked;
    }

    applyHideBrokenChars();
  }

  function syncMenuSoundsVolumeInputs() {
    const level = model.clampMenuSoundsVolumeLevel(state.menuSoundsVolumeLevel);
    refs.menuSoundsVolumeInputs.forEach((input) => {
      input.checked = Number(input.value) === level;
    });

    if (refs.menuSoundsVolumeKnobButton) {
      const nextLevel = level >= 6 ? 1 : level + 1;
      const label = `Menu sounds volume ${level} of 6. Click to cycle clockwise to ${nextLevel}.`;
      refs.menuSoundsVolumeKnobButton.title = label;
      refs.menuSoundsVolumeKnobButton.setAttribute('aria-label', label);
    }
  }

  function setMenuSoundsVolumeLevel(value, {
    persist = false,
    playFeedback = false
  } = {}) {
    state.menuSoundsVolumeLevel = model.clampMenuSoundsVolumeLevel(value);
    syncMenuSoundsVolumeInputs();

    if (persist) {
      try {
        localStorage.setItem(storageKeys.menuSoundsVolume, String(state.menuSoundsVolumeLevel));
      } catch { }
    }

    if (playFeedback) {
      audioService.playMenuSound('click');
    }
  }

  function initMenuSoundsVolumeFromStorage() {
    if (!refs.menuSoundsVolumeInputs.length) return;

    let nextLevel = 6;
    try {
      const saved = localStorage.getItem(storageKeys.menuSoundsVolume);
      if (saved !== null) {
        nextLevel = model.clampMenuSoundsVolumeLevel(saved);
      }
    } catch { }

    setMenuSoundsVolumeLevel(nextLevel);
  }

  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    bridge.windowControls.minimize();
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    bridge.windowControls.close();
  });

  document.addEventListener('click', (event) => {
    const element = event.target.closest('button, .reel-arrow, a, .powered-link');
    if (!element) return;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') return;
    if (element.classList.contains('char-btn') || element.closest('.reel-arrow')) return;
    if (element.classList.contains('sleeve-tab') || element.closest('.uiverse-rocker-switch')) return;
    if (element.classList.contains('menu-volume-knob-core-hit')) return;
    audioService.playMenuSound('click');
  }, true);

  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const element = target.closest('button:disabled, .char-btn.unavailable, [disabled], [aria-disabled="true"]');
    if (element) {
      audioService.playMenuSound('forbidden');
      return;
    }

    const computed = window.getComputedStyle(target);
    if (computed.cursor === 'not-allowed') {
      audioService.playMenuSound('forbidden');
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const element = target.closest('button:disabled, .char-btn.unavailable');
    if (!element) return;
    audioService.playMenuSound('forbidden');
  }, true);

  refs.input.addEventListener('input', handleDialogueInputChange);
  refs.input.addEventListener('scroll', view.syncDialogueInputHighlightScroll);

  refs.btnPlay.addEventListener('click', (event) => {
    if (view.isActionButtonBlocked(refs.btnPlay)) {
      event.preventDefault();
      return;
    }
    void playDialogue();
  });

  refs.btnPause.addEventListener('click', (event) => {
    if (view.isActionButtonBlocked(refs.btnPause)) {
      event.preventDefault();
      return;
    }
    doPause();
  });

  refs.btnStop.addEventListener('click', (event) => {
    if (view.isActionButtonBlocked(refs.btnStop)) {
      event.preventDefault();
      return;
    }
    stopDialogue();
  });

  refs.btnFastForward?.addEventListener('pointerdown', (event) => {
    if (view.isActionButtonBlocked(refs.btnFastForward) || !canFastForward()) return;
    event.preventDefault();
    state.fastForwardButtonHeld = true;
    syncFastForwardState();
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
    refs.btnFastForward?.addEventListener(eventName, () => {
      state.fastForwardButtonHeld = false;
      syncFastForwardState();
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || !canFastForward()) return;
    event.preventDefault();
    blurPlaybackButtonFocus();
    state.fastForwardKeyHeld = true;
    syncFastForwardState();
  }, true);

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return;
    state.fastForwardKeyHeld = false;
    syncFastForwardState();
  }, true);

  window.addEventListener('blur', () => {
    resetFastForwardState();
  });

  const REEL_TAP_STEP = 160;
  const REEL_DRAG_THRESHOLD_PX = 6;
  let reelDragState = null;
  let suppressCharacterGridClick = false;

  refs.reelLeft?.addEventListener('click', () => {
    if (refs.reelLeft.classList.contains('hidden')) return;
    audioService.playMenuSound('arrowLeft');
    refs.charGrid.scrollBy({
      left: -REEL_TAP_STEP,
      behavior: 'smooth',
    });
  });

  refs.reelRight?.addEventListener('click', () => {
    if (refs.reelRight.classList.contains('hidden')) return;
    audioService.playMenuSound('arrowRight');
    refs.charGrid.scrollBy({
      left: REEL_TAP_STEP,
      behavior: 'smooth',
    });
  });

  function stopCharacterGridDrag() {
    if (!reelDragState) return;
    const { pointerId } = reelDragState;
    reelDragState = null;
    refs.charGrid.classList.remove('is-dragging');

    if (pointerId !== null) {
      try {
        refs.charGrid.releasePointerCapture(pointerId);
      } catch { }
    }
  }

  refs.charGrid?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    reelDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: refs.charGrid.scrollLeft,
      moved: false,
    };

    suppressCharacterGridClick = false;

    try {
      refs.charGrid.setPointerCapture(event.pointerId);
    } catch { }
  });

  refs.charGrid?.addEventListener('pointermove', (event) => {
    if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;

    const deltaX = event.clientX - reelDragState.startX;
    if (!reelDragState.moved && Math.abs(deltaX) >= REEL_DRAG_THRESHOLD_PX) {
      reelDragState.moved = true;
      suppressCharacterGridClick = true;
      refs.charGrid.classList.add('is-dragging');
    }

    if (!reelDragState.moved) return;

    event.preventDefault();
    refs.charGrid.scrollLeft = reelDragState.startScrollLeft - deltaX;
  });

  refs.charGrid?.addEventListener('pointerup', (event) => {
    if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
    stopCharacterGridDrag();
    if (suppressCharacterGridClick) {
      window.setTimeout(() => {
        suppressCharacterGridClick = false;
      }, 0);
    }
  });

  refs.charGrid?.addEventListener('pointercancel', (event) => {
    if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
    stopCharacterGridDrag();
    suppressCharacterGridClick = false;
  });

  window.addEventListener('pointerup', () => {
    stopCharacterGridDrag();
  });

  window.addEventListener('pointercancel', () => {
    stopCharacterGridDrag();
    suppressCharacterGridClick = false;
  });

  refs.charGrid?.addEventListener('click', (event) => {
    if (!suppressCharacterGridClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressCharacterGridClick = false;
  }, true);

  refs.charGrid.addEventListener('scroll', view.updateReelArrows);
  refs.characterSearchInput?.addEventListener('input', () => {
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true
    });
  });

  refs.characterSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !refs.characterSearchInput.value) return;
    event.preventDefault();
    refs.characterSearchInput.value = '';
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true
    });
  });

  refs.characterSearchClear?.addEventListener('click', () => {
    if (!refs.characterSearchInput) return;
    refs.characterSearchInput.value = '';
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true
    });
    refs.characterSearchInput.focus();
  });

  refs.sleeveSettings.addEventListener('click', () => {
    if (refs.sleeveSettings.getAttribute('aria-disabled') === 'true') return;
    audioService.playMenuSound('click');
    void showPanel(state.activePanel === 'settings' ? 'controls' : 'settings');
  });

  refs.sleeveCamera.addEventListener('click', () => {
    if (state.isPlaying || state.isPaused) return;
    audioService.playMenuSound('forbidden');
  });

  refs.sleeveBackgrounds?.addEventListener('click', () => {
    if (refs.sleeveBackgrounds.getAttribute('aria-disabled') === 'true') return;
    audioService.playMenuSound('click');
    void showPanel(state.activePanel === 'backgrounds' ? 'controls' : 'backgrounds');
  });

  refs.sleeveGuide?.addEventListener('click', () => {
    audioService.playMenuSound('forbidden');
  });

  refs.sleeveCharacter?.addEventListener('click', () => {
    if (refs.sleeveCharacter.getAttribute('aria-disabled') === 'true') return;
    audioService.playMenuSound('forbidden');
  });

  refs.inputMirrored?.addEventListener('change', () => {
    setMirrored(refs.inputMirrored.checked);
    try {
      localStorage.setItem(storageKeys.mirrorMode, String(refs.inputMirrored.checked));
    } catch { }
    audioService.playMenuSound('click');
  });

  refs.inputN64?.addEventListener('change', () => {
    state.n64ModeEnabled = refs.inputN64.checked;
    try {
      localStorage.setItem(storageKeys.n64Mode, String(state.n64ModeEnabled));
    } catch { }
    view.syncN64ClassOnDialogueBox();
    view.redrawSpriteForN64Toggle();
    if (state.n64ModeEnabled) view.renderN64DialogueTextCanvas();
    else view.clearN64DialogueTextCanvas();
    audioService.playMenuSound('click');
  });

  refs.inputHideBroken?.addEventListener('change', () => {
    state.hideBrokenChars = refs.inputHideBroken.checked;
    try {
      localStorage.setItem(storageKeys.hideBrokenChars, String(state.hideBrokenChars));
    } catch { }
    applyHideBrokenChars();
    audioService.playMenuSound('click');
  });

  refs.menuSoundsVolumeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      setMenuSoundsVolumeLevel(input.value, {
        persist: true,
        playFeedback: true
      });
    });
  });

  refs.menuSoundsVolumeKnobButton?.addEventListener('click', (event) => {
    event.preventDefault();
    const nextLevel = state.menuSoundsVolumeLevel >= 6 ? 1 : state.menuSoundsVolumeLevel + 1;
    setMenuSoundsVolumeLevel(nextLevel, {
      persist: true,
      playFeedback: true
    });
  });

  view.normalizeDialogueInput();
  view.syncCharacterSearchClearButton();
  view.buildCharacterGrid((character, wasActive) => {
    selectCharacter(character);
    if (!wasActive) view.startCardSpeakThenIdle(character.id);
  });
  requestAnimationFrame(view.updateReelArrows);
  syncPlaybackUiState();
  initN64ModeFromDom();

  try {
    const savedMirror = localStorage.getItem(storageKeys.mirrorMode);
    if (savedMirror !== null) {
      setMirrored(savedMirror === 'true');
    }
  } catch { }

  initHideBrokenFromStorage();
  initMenuSoundsVolumeFromStorage();

  void view.runStartupSequence();

  bridge.log.info('Renderer started', {
    version: model.env.appVersion,
    characters: characters.length,
    genericSounds: genericSounds.length,
  });
  console.log(`[Dialoggo] v${model.env.appVersion} - ${characters.length} characters, ${genericSounds.length} generic sounds`);
}

module.exports = {
  startApp
};
