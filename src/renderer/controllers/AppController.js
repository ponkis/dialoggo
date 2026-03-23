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

  function updatePlayButton() {
    const hasText = refs.input.value.trim().length > 0;
    const hasCharacter = state.selectedCharacter !== null;
    view.setActionButtonBlocked(refs.btnPlay, !hasText || !hasCharacter || (state.isPlaying && !state.isPaused));
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

    view.normalizeDialogueInput();
    const text = model.clampDialogueInputValue(refs.input.value).trim();
    if (!text) {
      state.isPlaying = false;
      updateSettingsSleeveBlockedState();
      return;
    }

    const charMsPerChar = 40;
    const character = state.selectedCharacter;

    view.setActionButtonBlocked(refs.btnPlay, true);
    view.setActionButtonBlocked(refs.btnPause, false);
    view.setActionButtonBlocked(refs.btnStop, false);
    view.setInputLocked(true);
    blurPlaybackButtonFocus();
    document.querySelectorAll('.char-btn').forEach((button) => {
      button.disabled = true;
    });

    refs.statusDot.classList.add('playing');
    refs.statusDot.classList.remove('paused');
    updateSettingsSleeveBlockedState();

    refs.placeholder.classList.add('fade-out');
    refs.dialogueContainer.classList.add('active');

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
    refs.placeholder.classList.remove('fade-out');

    state.isPlaying = false;
    state.isPaused = false;
    state.stopRequested = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();

    view.setActionButtonBlocked(refs.btnStop, true);
    view.setActionButtonBlocked(refs.btnPause, true);
    refs.btnPlay.title = 'Play';
    view.setInputLocked(false);
    refs.statusDot.classList.remove('playing');
    refs.statusDot.classList.remove('paused');

    document.querySelectorAll('.char-btn').forEach((button) => {
      const id = button.dataset.id;
      const character = characters.find((item) => item.id === id);
      button.disabled = !(character && character.isAvailable);
    });

    updatePlayButton();
    updateSettingsSleeveBlockedState();
  }

  function stopDialogue() {
    state.stopRequested = true;
    state.isPaused = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();

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
    view.setInputLocked(false);
    refs.statusDot.classList.remove('paused');
    updateSettingsSleeveBlockedState();
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

    view.setActionButtonBlocked(refs.btnPlay, false);
    refs.btnPlay.title = 'Resume';
    view.setActionButtonBlocked(refs.btnPause, true);
    refs.statusDot.classList.remove('playing');
    refs.statusDot.classList.add('paused');
    view.setInputLocked(true);

    setTimeout(() => {
      state.pauseTransitionLock = false;
    }, 140);

    updateSettingsSleeveBlockedState();
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

    view.setActionButtonBlocked(refs.btnPlay, true);
    refs.btnPlay.title = 'Play';
    view.setActionButtonBlocked(refs.btnPause, false);
    refs.statusDot.classList.add('playing');
    refs.statusDot.classList.remove('paused');
    view.setInputLocked(true);

    setTimeout(() => {
      state.pauseTransitionLock = false;
    }, 140);

    updateSettingsSleeveBlockedState();
  }

  async function showPanel(panel) {
    if (state.panelTransitionLock || panel === state.activePanel) return;
    if (panel === 'settings' && (state.isPlaying || state.isPaused)) return;

    state.panelTransitionLock = true;
    const large = view.isLargeScreen();

    try {
      if (panel === 'settings') {
        view.syncSettingsLayoutMode('settings');
        refs.sleeveSettings.classList.add('active');

        if (!large && refs.panelWrapper) {
          refs.panelWrapper.dataset.naturalPanelHeight = String(
            Math.round(refs.panelWrapper.getBoundingClientRect().height),
          );
        }

        if (large) {
          refs.previewArea.classList.add('preview-settings-muted');
          view.setPreviewPlaceholderSuppressed(true);
          view.stopPlaceholderAnim();
        } else {
          refs.app?.classList.add('settings-panel-open');
          await view.collapsePreviewThenSettings();
        }

        audioService.playMenuSound('settingsOpen');
        refs.flipCard.classList.add('flipped');
        state.activePanel = 'settings';
      } else {
        const hasCollapsedPreviewFlow = refs.app?.classList.contains('settings-panel-open');

        if (large && !hasCollapsedPreviewFlow) {
          requestAnimationFrame(() => {
            refs.previewArea.classList.remove('preview-settings-muted');
            view.setPreviewPlaceholderSuppressed(false);
            if (!refs.dialogueContainer.classList.contains('active')) {
              view.startPlaceholderAnim();
            }
          });
        }

        audioService.playMenuSound('settingsClose');
        refs.flipCard.classList.remove('flipped');
        refs.sleeveSettings.classList.remove('active');
        state.activePanel = 'controls';

        await model.sleep(constants.FLIP_CARD_MS);
        view.syncSettingsLayoutMode('controls');

        if (hasCollapsedPreviewFlow) {
          await view.expandPreviewAfterControls();
        } else {
          if (!large) {
            refs.previewArea.classList.remove('preview-settings-muted', 'preview-strip-collapsed', 'preview-content-hidden');
            view.setPreviewPlaceholderSuppressed(false);
          }

          refs.previewArea.style.height = '';
          refs.previewArea.style.flex = '';
          refs.previewArea.style.minHeight = '';
          refs.previewArea.style.overflow = '';
          refs.previewArea.style.transition = '';

          if (!refs.dialogueContainer.classList.contains('active')) {
            view.startPlaceholderAnim();
          }
        }
      }
    } finally {
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

    const blocked = state.isPlaying || state.isPaused;
    setBlockedState(refs.sleeveSettings, blocked, 'Settings', 'Settings (available when dialogue is idle)');
    setBlockedState(refs.sleeveCamera, blocked, 'Export', 'Export (available when dialogue is idle)');
    updateFastForwardAvailability();
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

  document.getElementById('btn-maximize')?.addEventListener('click', () => {
    bridge.windowControls.maximize();
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

  refs.reelLeft.addEventListener('click', () => {
    audioService.playMenuSound('arrowLeft');
    refs.charGrid.scrollBy({
      left: -160,
      behavior: 'smooth'
    });
  });

  refs.reelRight.addEventListener('click', () => {
    audioService.playMenuSound('arrowRight');
    refs.charGrid.scrollBy({
      left: 160,
      behavior: 'smooth'
    });
  });

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
    if (state.isPlaying || state.isPaused) return;
    audioService.playMenuSound('click');
    void showPanel(state.activePanel === 'settings' ? 'controls' : 'settings');
  });

  refs.sleeveCamera.addEventListener('click', () => {
    if (state.isPlaying || state.isPaused) return;
    audioService.playMenuSound('forbidden');
  });

  refs.sleeveBackgrounds?.addEventListener('click', () => {
    audioService.playMenuSound('forbidden');
  });

  refs.sleeveGuide?.addEventListener('click', () => {
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

  document.querySelectorAll('.menu-volume-knob-hit').forEach((label) => {
    label.addEventListener('click', (event) => {
      const level = Number(label.dataset.level || 0);
      if (!Number.isFinite(level) || level < 1) return;
      event.preventDefault();
      setMenuSoundsVolumeLevel(level, {
        persist: true,
        playFeedback: true
      });
    });
  });

  document.querySelector('.menu-volume-knob-core-hit')?.addEventListener('click', (event) => {
    event.preventDefault();
    const nextLevel = state.menuSoundsVolumeLevel >= 6 ? 1 : state.menuSoundsVolumeLevel + 1;
    setMenuSoundsVolumeLevel(nextLevel, {
      persist: true,
      playFeedback: true
    });
  });

  bridge.windowControls.onMaximized(() => {
    document.body.classList.add('maximized');
    if (state.activePanel === 'settings' && !state.panelTransitionLock) {
      void showPanel('controls');
    }
  });

  bridge.windowControls.onUnmaximized(() => {
    document.body.classList.remove('maximized');
    if (state.activePanel === 'settings' && !state.panelTransitionLock) {
      void showPanel('controls');
    }
  });

  view.normalizeDialogueInput();
  view.syncCharacterSearchClearButton();
  view.buildCharacterGrid((character, wasActive) => {
    selectCharacter(character);
    if (!wasActive) view.startCardSpeakThenIdle(character.id);
  });
  requestAnimationFrame(view.updateReelArrows);
  updatePlayButton();

  updateSettingsSleeveBlockedState();
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
