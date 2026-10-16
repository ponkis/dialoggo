const {
  APP_EVENTS,
} = require('../../core/EventBus');
const {
  nextPaint,
  pick,
  sleep,
} = require('../../core/timing');
const {
  isPlaybackInteractionLocked,
} = require('../../state/createAppState');

const PAUSE_CHARACTERS = new Set(['.', ',', '!', '?', ':', ';']);
const SENTENCE_END_CHARACTERS = new Set(['.', '!', '?']);
const PAUSE_TRANSITION_LOCK_MS = 140;

/**
 * Runs a dialogue line: the box open animation, typing characters while the
 * voice loop plays, line scrolling, pause/resume/stop, fast forward, and the
 * close animation. It also owns the enabled state of the playback controls.
 */
function createPlaybackController({
  refs,
  state,
  constants,
  events,
  controlsView,
  dialogueBox,
  dialogueLayout,
  inputView,
  n64Text,
  previewView,
  characterGrid,
  panelView,
  spriteRenderer,
  speechLoop,
  audio,
  genericSounds,
  log,
}) {
  let dialogueClosePromise = null;

  function canFastForward() {
    return state.isPlaying && !state.isPaused && !state.stopRequested;
  }

  function getTextSpeedMultiplier() {
    return state.isFastForwarding ? constants.FAST_FORWARD_TEXT_MULTIPLIER : 1;
  }

  function syncN64ModeFromCheckbox() {
    if (refs.inputN64) state.n64ModeEnabled = refs.inputN64.checked;
  }

  function updateFastForwardAvailability() {
    controlsView.updateFastForwardAvailability(canFastForward());
  }

  function syncUiState() {
    const interactionLocked = isPlaybackInteractionLocked(state);

    controlsView.sync({
      playBlocked: state.stopRequested || !inputView.hasText() || state.selectedCharacter === null || (state.isPlaying && !state.isPaused),
      pauseBlocked: state.stopRequested || !state.isPlaying || state.isPaused || state.pauseTransitionLock,
      stopBlocked: state.stopRequested || !state.isPlaying,
      uploadBlocked: interactionLocked,
    });
    inputView.setLocked(state.isPlaying || state.isPaused);
    characterGrid.syncButtonAvailability(interactionLocked);
    updateFastForwardAvailability();
    panelView.syncSleeveBlockedState(interactionLocked);
    events.emit(APP_EVENTS.playbackUiSynced);
  }

  function waitWhilePaused() {
    if (!state.isPaused) return Promise.resolve();

    return new Promise((resolve) => {
      state.pauseResolve = resolve;
    });
  }

  function releasePauseWaiter() {
    if (!state.pauseResolve) return;

    const resolve = state.pauseResolve;
    state.pauseResolve = null;
    resolve();
  }

  /** Sleeps for `ms` of dialogue time: frozen while paused, faster while fast forwarding. */
  async function sleepPlaybackPaced(ms) {
    let virtualElapsed = 0;

    while (virtualElapsed < ms && !state.stopRequested) {
      await waitWhilePaused();
      if (state.stopRequested) break;

      const realStep = Math.min(20, Math.max(6, ms - virtualElapsed));
      await sleep(realStep);
      virtualElapsed += realStep * getTextSpeedMultiplier();
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

  function setFastForwardKeyHeld(held) {
    state.fastForwardKeyHeld = held;
    syncFastForwardState();
  }

  function setFastForwardButtonHeld(held) {
    state.fastForwardButtonHeld = held;
    syncFastForwardState();
  }

  function closeDialoguePlaybackToIdle({
    stopLoop = false,
    scheduleIdle = false,
  } = {}) {
    if (stopLoop) speechLoop.stop();
    else speechLoop.pause();

    speechLoop.killCurrentAudio();
    spriteRenderer.stopIdleState();

    if (!dialogueClosePromise) {
      const closePromise = spriteRenderer.smoothCloseAndIdle()
        .catch(() => { })
        .finally(() => {
          if (dialogueClosePromise === closePromise) {
            dialogueClosePromise = null;
          }
        });
      dialogueClosePromise = closePromise;
    }

    if (scheduleIdle) {
      dialogueClosePromise.then(() => {
        if (state.isPlaying && state.isPaused && !state.stopRequested) {
          spriteRenderer.startIdleAfterDelay(2000);
        }
      }).catch(() => { });
    }

    return dialogueClosePromise;
  }

  async function waitForDialoguePlaybackToIdle() {
    if (!dialogueClosePromise) return;
    await dialogueClosePromise;
  }

  async function playBoxTransitionSound(durationMs) {
    await Promise.all([
      (async () => {
        if (genericSounds.length > 0) await audio.playSoundFile(pick(genericSounds));
      })(),
      sleep(durationMs),
    ]);
  }

  async function abortOpeningIfStopped() {
    if (!state.stopRequested) return false;

    await closeDialoguePlaybackToIdle({
      stopLoop: true,
    });
    await finish();
    return true;
  }

  async function typeLine(line, lineElement) {
    for (let i = 0; i < line.characters.length; i += 1) {
      if (state.stopRequested) break;

      await waitWhilePaused();
      if (state.stopRequested) break;

      dialogueBox.appendCharacter(lineElement, line.characters[i], i);
      if (state.n64ModeEnabled) n64Text.render();

      const currentChar = line.characters[i].value;
      if (PAUSE_CHARACTERS.has(currentChar)) {
        speechLoop.pause();
        spriteRenderer.resetToIdle();
        const pauseDuration = SENTENCE_END_CHARACTERS.has(currentChar) ? 400 : 200;
        await sleepPlaybackPaced(pauseDuration);
        if (i < line.characters.length - 1 && !PAUSE_CHARACTERS.has(line.characters[i + 1].value)) {
          speechLoop.resume();
        }
      } else if (currentChar === ' ') {
        await sleepPlaybackPaced(constants.DIALOGUE_MS_PER_CHARACTER * 0.6);
      } else {
        await sleepPlaybackPaced(constants.DIALOGUE_MS_PER_CHARACTER);
      }
    }
  }

  async function typeLines(lines, scrollWrapper) {
    const lineHeight = constants.DIALOGUE_LINE_HEIGHT;
    let totalLinesAdded = 0;

    for (let lineIndex = 0; lineIndex < lines.length && !state.stopRequested; lineIndex += 1) {
      speechLoop.pause();
      spriteRenderer.resetToIdle();

      if (totalLinesAdded >= 2) {
        dialogueBox.scrollLinesUp(scrollWrapper, (totalLinesAdded - 1) * lineHeight);
        if (state.n64ModeEnabled) {
          await Promise.all([
            n64Text.repaintDuringScrollTransition(350),
            sleepPlaybackPaced(350),
          ]);
        } else {
          await sleepPlaybackPaced(350);
        }
      }

      const lineElement = dialogueBox.appendLine(scrollWrapper);
      totalLinesAdded += 1;

      if (lineIndex > 0) await sleepPlaybackPaced(200);

      speechLoop.resume();
      await typeLine(lines[lineIndex], lineElement);
    }
  }

  async function play() {
    if (state.isPaused) {
      resume();
      return;
    }

    if (state.isPlaying || !state.selectedCharacter) return;

    state.isPlaying = true;
    state.isPaused = false;
    state.stopRequested = false;
    state.pauseTransitionLock = false;
    dialogueClosePromise = null;
    resetFastForwardState();
    syncUiState();

    inputView.normalize();
    const text = inputView.getText();
    if (!text) {
      state.isPlaying = false;
      syncUiState();
      return;
    }

    const character = state.selectedCharacter;

    controlsView.blurFocusedButton();
    dialogueBox.setStatus('playing');
    dialogueBox.open();
    previewView.syncPlaceholderState();

    syncN64ModeFromCheckbox();
    dialogueBox.resetForPlayback();
    spriteRenderer.showSpeakingStart();
    dialogueBox.slideIn();

    await playBoxTransitionSound(400);
    if (await abortOpeningIfStopped()) return;

    syncN64ModeFromCheckbox();
    dialogueBox.expand();

    await playBoxTransitionSound(450);
    if (await abortOpeningIfStopped()) return;

    const lines = dialogueLayout.splitIntoRenderLines(text);
    const scrollWrapper = dialogueBox.createScrollWrapper({
      centered: lines.length <= 1,
    });

    if (state.n64ModeEnabled) {
      await nextPaint();
      n64Text.render();
    }

    speechLoop.start(character.sounds, character);

    if (state.isPaused) {
      speechLoop.pause();
      speechLoop.killCurrentAudio();
      await waitWhilePaused();
      if (!state.stopRequested) speechLoop.resume();
    }

    try {
      await typeLines(lines, scrollWrapper);

      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });

      if (!state.stopRequested) {
        await sleepPlaybackPaced(500);
      }
    } catch (error) {
      console.error('[Dialoggo] playDialogue playback error', error);
      log.error('Dialogue playback error', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      });
      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });
    }

    await finish();
  }

  async function finish() {
    await waitForDialoguePlaybackToIdle();
    speechLoop.stop();
    spriteRenderer.stop();

    dialogueBox.shrink();
    await playBoxTransitionSound(400);

    dialogueBox.slideOut();
    await playBoxTransitionSound(350);

    dialogueBox.close();

    state.isPlaying = false;
    state.isPaused = false;
    state.stopRequested = false;
    state.pauseTransitionLock = false;
    dialogueClosePromise = null;
    resetFastForwardState();
    dialogueBox.setStatus('idle');
    previewView.syncPlaceholderState();
    syncUiState();
  }

  function stop() {
    state.stopRequested = true;
    state.isPaused = false;
    state.pauseTransitionLock = false;
    resetFastForwardState();
    syncUiState();
    releasePauseWaiter();

    closeDialoguePlaybackToIdle({
      stopLoop: true,
    });
    dialogueBox.clearPausedStatus();
  }

  function releasePauseTransitionLockSoon() {
    setTimeout(() => {
      state.pauseTransitionLock = false;
      syncUiState();
    }, PAUSE_TRANSITION_LOCK_MS);
  }

  function pause() {
    if (!state.isPlaying || state.isPaused || state.pauseTransitionLock) return;

    state.pauseTransitionLock = true;
    state.isPaused = true;
    resetFastForwardState();

    closeDialoguePlaybackToIdle({
      scheduleIdle: true,
    });
    dialogueBox.setStatus('paused');
    syncUiState();
    releasePauseTransitionLockSoon();
  }

  function resume() {
    if (!state.isPlaying || !state.isPaused || state.pauseTransitionLock) return;

    state.pauseTransitionLock = true;
    resetFastForwardState();

    spriteRenderer.showSpeakingStart();
    speechLoop.resume();
    state.isPaused = false;
    releasePauseWaiter();
    dialogueBox.setStatus('playing');
    syncUiState();
    releasePauseTransitionLockSoon();
  }

  function isButtonBlocked(buttonName) {
    const buttonsByName = {
      play: refs.btnPlay,
      pause: refs.btnPause,
      stop: refs.btnStop,
      fastForward: refs.btnFastForward,
    };
    return controlsView.isBlocked(buttonsByName[buttonName]);
  }

  /**
   * Runs a keyboard playback command with click/forbidden feedback. Returns
   * true when the command ran, so the shortcut overlay can echo it.
   */
  function executeKeyboardCommand(command) {
    const feedback = (allowed) => {
      audio.playMenuSound(allowed ? 'click' : 'forbidden');
      if (allowed) controlsView.blurFocusedButton();
      return allowed;
    };

    if (command === 'stop') {
      if (!feedback(!isButtonBlocked('stop'))) return false;
      stop();
      return true;
    }

    if (command === 'fastForward') {
      if (!feedback(canFastForward() && !isButtonBlocked('fastForward'))) return false;
      setFastForwardKeyHeld(true);
      return true;
    }

    if (state.isPlaying && !state.isPaused) {
      if (!feedback(!isButtonBlocked('pause'))) return false;
      pause();
      return true;
    }

    if (!feedback(!isButtonBlocked('play'))) return false;
    void play();
    return true;
  }

  function bindEvents() {
    refs.btnPlay.addEventListener('click', (event) => {
      if (controlsView.isBlocked(refs.btnPlay)) {
        event.preventDefault();
        return;
      }
      void play();
    });

    refs.btnPause.addEventListener('click', (event) => {
      if (controlsView.isBlocked(refs.btnPause)) {
        event.preventDefault();
        return;
      }
      pause();
    });

    refs.btnStop.addEventListener('click', (event) => {
      if (controlsView.isBlocked(refs.btnStop)) {
        event.preventDefault();
        return;
      }
      stop();
    });

    refs.btnFastForward?.addEventListener('pointerdown', (event) => {
      if (controlsView.isBlocked(refs.btnFastForward) || !canFastForward()) return;
      event.preventDefault();
      setFastForwardButtonHeld(true);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
      refs.btnFastForward?.addEventListener(eventName, () => {
        setFastForwardButtonHeld(false);
      });
    });
  }

  return {
    bindEvents,
    canFastForward,
    executeKeyboardCommand,
    isButtonBlocked,
    resetFastForwardState,
    setFastForwardKeyHeld,
    syncUiState,
  };
}

module.exports = {
  createPlaybackController,
};
