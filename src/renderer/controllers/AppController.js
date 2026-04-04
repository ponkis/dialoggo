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
    backgrounds,
    genericSounds,
    storageKeys
  } = model;
  const refs = view.refs;
  const spriteRenderer = view.spriteRenderer;
  const speechLoop = audioService.createSpeechLoop(spriteRenderer);
  const charactersById = new Map(characters.map((character) => [character.id, character]));
  const backgroundsById = new Map(backgrounds.map((background) => [background.id, background]));
  const pauseChars = new Set(['.', ',', '!', '?', ':', ';']);
  const heldShortcutKeys = new Set();
  const keyboardModifierState = {
    alt: false,
    meta: false,
  };
  const keyboardPressedButtons = new Set();
  let dialogueClosePromise = null;
  let lastExecutedShortcut = null;
  let transientVisualizerAlert = null;
  let transientVisualizerAlertTimer = 0;
  let transientVisualizerAlertFadeTimer = 0;
  const TRANSIENT_VISUALIZER_ALERT_MS = 1650;
  const TRANSIENT_VISUALIZER_ALERT_FADE_MS = 220;

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
      const character = charactersById.get(id);
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
    syncShortcutVisualizerOverlay();
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

  function closeDialoguePlaybackToIdle({
    stopLoop = false,
    scheduleIdle = false,
  } = {}) {
    if (stopLoop) speechLoop.stop();
    else speechLoop.pause();

    speechLoop._killCurrentAudio();
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

  function isTextEntryElement(element) {
    if (!(element instanceof HTMLElement)) return false;

    if (element instanceof HTMLTextAreaElement) {
      return !element.readOnly && !element.disabled;
    }

    if (element instanceof HTMLInputElement) {
      const type = String(element.type || 'text').toLowerCase();
      const textLikeTypes = new Set([
        'text',
        'search',
        'url',
        'tel',
        'email',
        'password',
        'number',
      ]);

      return textLikeTypes.has(type) && !element.readOnly && !element.disabled;
    }

    return element.isContentEditable;
  }

  function shouldIgnorePlaybackShortcut(target) {
    const activeTarget = target instanceof Element ? target : document.activeElement;
    if (!(activeTarget instanceof HTMLElement)) return false;
    const editable = activeTarget.closest('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    return isTextEntryElement(editable);
  }

  function playKeyboardCommandFeedback(allowed) {
    audioService.playMenuSound(allowed ? 'click' : 'forbidden');
  }

  function handleKeyboardPlaybackCommand(command) {
    if (command === 'stop') {
      const allowed = !view.isActionButtonBlocked(refs.btnStop);
      playKeyboardCommandFeedback(allowed);
      if (!allowed) return false;
      blurPlaybackButtonFocus();
      stopDialogue();
      return true;
    }

    if (command === 'fastForward') {
      const allowed = canFastForward() && !view.isActionButtonBlocked(refs.btnFastForward);
      playKeyboardCommandFeedback(allowed);
      if (!allowed) return false;
      blurPlaybackButtonFocus();
      state.fastForwardKeyHeld = true;
      syncFastForwardState();
      return true;
    }

    if (state.isPlaying && !state.isPaused) {
      const allowed = !view.isActionButtonBlocked(refs.btnPause);
      playKeyboardCommandFeedback(allowed);
      if (!allowed) return false;
      blurPlaybackButtonFocus();
      doPause();
      return true;
    }

    const allowed = !view.isActionButtonBlocked(refs.btnPlay);
    playKeyboardCommandFeedback(allowed);
    if (!allowed) return false;
    blurPlaybackButtonFocus();
    void playDialogue();
    return true;
  }

  function getCanonicalShortcutKey(code) {
    switch (code) {
      case 'ControlLeft':
      case 'ControlRight':
        return 'ctrl';
      case 'ShiftLeft':
      case 'ShiftRight':
        return 'shift';
      case 'Space':
        return 'space';
      case 'Escape':
        return 'escape';
      default:
        return null;
    }
  }

  function syncKeyboardModifierState(event) {
    keyboardModifierState.alt = event.altKey === true;
    keyboardModifierState.meta = event.metaKey === true;
  }

  function getPlaybackToggleActionLabel() {
    if (state.isPlaying && !state.isPaused) return 'Pause';
    if (state.isPaused) return 'Resume';
    return 'Play';
  }

  function areKeyboardShortcutsBlocked() {
    return state.activePanel === 'settings';
  }

  function canUsePlaybackKeyboardShortcut(target) {
    return !areKeyboardShortcutsBlocked() && !shouldIgnorePlaybackShortcut(target) && !keyboardModifierState.alt && !keyboardModifierState.meta;
  }

  function canDisplayPlaybackShortcut(target) {
    return !areKeyboardShortcutsBlocked() && !shouldIgnorePlaybackShortcut(target);
  }

  function isCharacterSearchShortcutTarget(target) {
    if (areKeyboardShortcutsBlocked()) return false;
    const activeTarget = target instanceof Element ? target : document.activeElement;
    return !!refs.characterSearchInput && activeTarget === refs.characterSearchInput;
  }

  function canClearCharacterSearchFromShortcut(target) {
    return isCharacterSearchShortcutTarget(target) && refs.characterSearchInput.value.length > 0;
  }

  function clearCharacterSearchFromShortcut() {
    if (!refs.characterSearchInput || refs.characterSearchInput.value.length === 0) return false;
    refs.characterSearchInput.value = '';
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true,
    });
    return true;
  }

  function getShortcutDefinitions(target = document.activeElement) {
    return [
      {
        id: 'playback-stop',
        keys: ['ctrl', 'space'],
        triggerKey: 'space',
        priority: 300,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => canUsePlaybackKeyboardShortcut(target) && !view.isActionButtonBlocked(refs.btnStop),
        getActionLabel: () => 'Stop',
        getButtonElement: () => refs.btnStop,
        execute: () => handleKeyboardPlaybackCommand('stop'),
      },
      {
        id: 'playback-fast-forward',
        keys: ['shift', 'space'],
        triggerKey: 'space',
        priority: 200,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => canUsePlaybackKeyboardShortcut(target) && canFastForward() && !view.isActionButtonBlocked(refs.btnFastForward),
        getActionLabel: () => 'Fast forward',
        getButtonElement: () => refs.btnFastForward,
        execute: () => handleKeyboardPlaybackCommand('fastForward'),
      },
      {
        id: 'playback-toggle',
        keys: ['space'],
        triggerKey: 'space',
        priority: 100,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => {
          if (!canUsePlaybackKeyboardShortcut(target)) return false;
          return state.isPlaying && !state.isPaused
            ? !view.isActionButtonBlocked(refs.btnPause)
            : !view.isActionButtonBlocked(refs.btnPlay);
        },
        getActionLabel: () => getPlaybackToggleActionLabel(),
        getButtonElement: () => (state.isPlaying && !state.isPaused ? refs.btnPause : refs.btnPlay),
        execute: () => handleKeyboardPlaybackCommand('togglePlayPause'),
      },
      {
        id: 'search-clear',
        keys: ['escape'],
        triggerKey: 'escape',
        priority: 50,
        isVisible: () => isCharacterSearchShortcutTarget(target),
        isAvailable: () => canClearCharacterSearchFromShortcut(target),
        getActionLabel: () => 'Clear search',
        getButtonElement: () => null,
        execute: () => clearCharacterSearchFromShortcut(),
      },
    ];
  }

  function getShortcutCandidate(target = document.activeElement, requireAvailability = true) {
    return getShortcutDefinitions(target)
      .map((shortcut) => {
        const matchedKeys = shortcut.keys.filter((key) => heldShortcutKeys.has(key));
        return {
          shortcut,
          matchedKeys,
          isComplete: shortcut.keys.every((key) => heldShortcutKeys.has(key)),
        };
      })
      .filter((entry) => {
        if (entry.matchedKeys.length === 0) return false;
        if (!entry.shortcut.isVisible()) return false;
        return requireAvailability ? entry.shortcut.isAvailable() : true;
      })
      .sort((left, right) => {
        if (left.isComplete !== right.isComplete) {
          return Number(right.isComplete) - Number(left.isComplete);
        }

        if (left.matchedKeys.length !== right.matchedKeys.length) {
          return right.matchedKeys.length - left.matchedKeys.length;
        }

        return right.shortcut.priority - left.shortcut.priority;
      })[0] || null;
  }

  function clearTransientVisualizerAlert({
    skipSync = false,
  } = {}) {
    if (transientVisualizerAlertTimer) {
      window.clearTimeout(transientVisualizerAlertTimer);
      transientVisualizerAlertTimer = 0;
    }
    if (transientVisualizerAlertFadeTimer) {
      window.clearTimeout(transientVisualizerAlertFadeTimer);
      transientVisualizerAlertFadeTimer = 0;
    }

    transientVisualizerAlert = null;
    refs.shortcutVisualizer?.classList.remove('shortcut-visualizer-favorite-alert-exit');

    if (!skipSync) {
      syncShortcutVisualizerOverlay();
    }
  }

  function showTransientVisualizerAlert({
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    if (!state.shortcutVisualizerEnabled) return;

    transientVisualizerAlert = {
      action,
      leadingText,
      trailingText,
      iconSrc,
      iconAlt,
      iconVariant,
    };

    if (transientVisualizerAlertTimer) {
      window.clearTimeout(transientVisualizerAlertTimer);
    }
    if (transientVisualizerAlertFadeTimer) {
      window.clearTimeout(transientVisualizerAlertFadeTimer);
      transientVisualizerAlertFadeTimer = 0;
    }

    refs.shortcutVisualizer?.classList.remove('shortcut-visualizer-favorite-alert-exit');

    syncShortcutVisualizerOverlay();

    transientVisualizerAlertTimer = window.setTimeout(() => {
      refs.shortcutVisualizer?.classList.add('shortcut-visualizer-favorite-alert-exit');
      transientVisualizerAlertTimer = 0;
      transientVisualizerAlertFadeTimer = window.setTimeout(() => {
        transientVisualizerAlert = null;
        transientVisualizerAlertFadeTimer = 0;
        refs.shortcutVisualizer?.classList.remove('shortcut-visualizer-favorite-alert-exit');
        syncShortcutVisualizerOverlay();
      }, TRANSIENT_VISUALIZER_ALERT_FADE_MS);
    }, TRANSIENT_VISUALIZER_ALERT_MS);
  }

  function syncShortcutVisualizerOverlay(target = document.activeElement) {
    if (!state.shortcutVisualizerEnabled) {
      view.syncShortcutVisualizer();
      return;
    }

    if (transientVisualizerAlert) {
      view.syncShortcutVisualizer({
        visible: true,
        keys: [],
        action: transientVisualizerAlert.action,
        leadingText: transientVisualizerAlert.leadingText,
        trailingText: transientVisualizerAlert.trailingText,
        iconSrc: transientVisualizerAlert.iconSrc,
        iconAlt: transientVisualizerAlert.iconAlt,
        iconVariant: transientVisualizerAlert.iconVariant,
      });
      return;
    }

    if (lastExecutedShortcut && !lastExecutedShortcut.keys.every((key) => heldShortcutKeys.has(key))) {
      lastExecutedShortcut = null;
    }

    if (lastExecutedShortcut) {
      view.syncShortcutVisualizer({
        visible: true,
        keys: lastExecutedShortcut.keys,
        action: lastExecutedShortcut.label,
      });
      return;
    }

    const candidate = getShortcutCandidate(target, false);
    if (!candidate) {
      view.syncShortcutVisualizer();
      return;
    }

    view.syncShortcutVisualizer({
      visible: true,
      keys: candidate.matchedKeys,
      action: '',
    });
  }

  function setKeyboardPressedButtons(buttons) {
    const nextButtons = new Set(
      Array.from(buttons || []).filter((button) => button instanceof HTMLElement),
    );

    keyboardPressedButtons.forEach((button) => {
      if (nextButtons.has(button)) return;
      view.setButtonKeyboardPressed(button, false);
    });

    nextButtons.forEach((button) => {
      if (keyboardPressedButtons.has(button)) return;
      view.setButtonKeyboardPressed(button, true);
    });

    keyboardPressedButtons.clear();
    nextButtons.forEach((button) => {
      keyboardPressedButtons.add(button);
    });
  }

  function syncKeyboardPressedButtonState(target = document.activeElement) {
    if (lastExecutedShortcut && !lastExecutedShortcut.keys.every((key) => heldShortcutKeys.has(key))) {
      lastExecutedShortcut = null;
    }

    if (lastExecutedShortcut?.buttonElement instanceof HTMLElement) {
      setKeyboardPressedButtons([lastExecutedShortcut.buttonElement]);
      return;
    }

    const candidate = getShortcutCandidate(target);
    if (!candidate?.isComplete) {
      setKeyboardPressedButtons([]);
      return;
    }

    const buttonElement = candidate.shortcut.getButtonElement?.();
    setKeyboardPressedButtons(buttonElement ? [buttonElement] : []);
  }

  function resetShortcutVisualizerState() {
    heldShortcutKeys.clear();
    keyboardModifierState.alt = false;
    keyboardModifierState.meta = false;
    lastExecutedShortcut = null;
    clearTransientVisualizerAlert({
      skipSync: true,
    });
    setKeyboardPressedButtons([]);
    view.syncShortcutVisualizer();
  }

  function handleShortcutKeydown(event) {
    syncKeyboardModifierState(event);

    const key = getCanonicalShortcutKey(event.code);
    if (key) heldShortcutKeys.add(key);

    if (key === 'escape' && view.isFavoriteContextMenuVisible()) {
      event.preventDefault();
      closeFavoriteContextMenu();
      setKeyboardPressedButtons([]);
      view.syncShortcutVisualizer();
      return;
    }

    const candidate = getShortcutCandidate(event.target);
    if (candidate?.isComplete && candidate.shortcut.triggerKey === key && !event.repeat) {
      event.preventDefault();
      const actionLabel = candidate.shortcut.getActionLabel();
      const buttonElement = candidate.shortcut.getButtonElement?.();
      const executed = candidate.shortcut.execute();

      if (executed) {
        lastExecutedShortcut = {
          id: candidate.shortcut.id,
          keys: [...candidate.shortcut.keys],
          label: actionLabel,
          buttonElement: buttonElement instanceof HTMLElement ? buttonElement : null,
        };
      }
    }

    syncKeyboardPressedButtonState(event.target);
    syncShortcutVisualizerOverlay(event.target);
  }

  function handleShortcutKeyup(event) {
    syncKeyboardModifierState(event);

    const key = getCanonicalShortcutKey(event.code);
    if (key) heldShortcutKeys.delete(key);

    if (event.code === 'Space') {
      state.fastForwardKeyHeld = false;
      syncFastForwardState();
    }

    syncKeyboardPressedButtonState(event.target);
    syncShortcutVisualizerOverlay(event.target);
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

  function persistIdList(storageKey, itemIds) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(itemIds));
    } catch { }
  }

  function sanitizeIdList(itemIds, {
    validIds = null,
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    const sanitized = [];
    const seen = new Set();

    (Array.isArray(itemIds) ? itemIds : []).forEach((itemId) => {
      const normalizedId = String(itemId || '').trim();
      if (!normalizedId || seen.has(normalizedId) || (validIds?.has && !validIds.has(normalizedId))) return;
      seen.add(normalizedId);
      sanitized.push(normalizedId);
    });

    return sanitized.slice(0, limit);
  }

  function loadIdListFromStorage(storageKey, {
    validIds = null,
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    let parsedItemIds = [];

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) parsedItemIds = parsed;
      }
    } catch { }

    const sanitizedItemIds = sanitizeIdList(parsedItemIds, {
      validIds,
      limit,
    });
    persistIdList(storageKey, sanitizedItemIds);
    return sanitizedItemIds;
  }

  function persistCharacterIdList(storageKey, characterIds) {
    persistIdList(storageKey, characterIds);
  }

  function sanitizeCharacterIdList(characterIds, {
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    return sanitizeIdList(characterIds, {
      validIds: charactersById,
      limit,
    });
  }

  function loadCharacterIdListFromStorage(storageKey, {
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    return loadIdListFromStorage(storageKey, {
      validIds: charactersById,
      limit,
    });
  }

  function persistBackgroundIdList(storageKey, backgroundIds) {
    persistIdList(storageKey, backgroundIds);
  }

  function sanitizeBackgroundIdList(backgroundIds, {
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    return sanitizeIdList(backgroundIds, {
      validIds: backgroundsById,
      limit,
    });
  }

  function loadBackgroundIdListFromStorage(storageKey, {
    limit = Number.POSITIVE_INFINITY,
  } = {}) {
    return loadIdListFromStorage(storageKey, {
      validIds: backgroundsById,
      limit,
    });
  }

  function closeFavoriteContextMenu() {
    view.hideFavoriteContextMenu();
  }

  function renderCharacterGrid({
    preserveScroll = true,
  } = {}) {
    const charGrid = refs.charGrid;
    const previousScrollLeft = charGrid?.scrollLeft || 0;
    const previousScrollWidth = charGrid?.scrollWidth || 0;

    closeFavoriteContextMenu();
    view.buildCharacterGrid({
      onCharacterSelected: (character, wasActive) => {
        selectCharacter(character);
        if (!wasActive) view.startCardSpeakThenIdle(character.id);
      },
      onCharacterContextMenu: (character, event) => {
        if (!character?.id) return;
        audioService.playMenuSound('click');
        view.showFavoriteContextMenu({
          targetId: character.id,
          targetType: 'character',
          isFavorite: state.favoriteCharacterIds.includes(character.id),
          x: event.clientX,
          y: event.clientY,
          onToggleFavorite: () => {
            toggleFavoriteCharacter(character);
          },
        });
      },
    });

    if (state.hideBrokenChars) {
      applyHideBrokenChars();
    } else {
      view.applyCharacterFilters();
    }

    view.updateSelectedCharacterCard(state.selectedCharacter);

    if (preserveScroll && charGrid) {
      const scrollDiff = charGrid.scrollWidth - previousScrollWidth;
      const targetScrollLeft = Math.max(0, previousScrollLeft + scrollDiff);

      const prevBehavior = charGrid.style.scrollBehavior;
      charGrid.style.scrollBehavior = 'auto'; // Disable smooth scroll briefly
      charGrid.scrollLeft = targetScrollLeft;
      void charGrid.offsetWidth; // Force layout refresh instantly
      charGrid.style.scrollBehavior = prevBehavior; // Restore behavior
    }

    syncPlaybackUiState();
  }

  function renderBackgroundGrid({
    preserveActivePack = true,
    preservePackScroll = true,
  } = {}) {
    const activePackId = preserveActivePack ? view.getActiveBackgroundPackId() : null;
    const scrollLeftByPackId = preservePackScroll ? view.getBackgroundPackScrollState() : {};

    closeFavoriteContextMenu();
    view.buildBackgroundGrid({
      activePackId,
      scrollLeftByPackId,
      onBackgroundSelected: (background) => {
        audioService.playMenuSound('click');
        selectBackground(background);
      },
      onBackgroundContextMenu: (background, event) => {
        if (!background?.id) return;
        audioService.playMenuSound('click');
        view.showFavoriteContextMenu({
          targetId: background.id,
          targetType: 'background',
          isFavorite: state.favoriteBackgroundIds.includes(background.id),
          x: event.clientX,
          y: event.clientY,
          onToggleFavorite: () => {
            toggleFavoriteBackground(background);
          },
        });
      },
    });

    view.updateSelectedBackgroundCard(state.selectedBackground);
  }

  function persistFavoriteCharacters() {
    persistCharacterIdList(storageKeys.favoriteCharacters, state.favoriteCharacterIds);
  }

  function persistRecentCharacters() {
    persistCharacterIdList(storageKeys.recentCharacters, state.recentCharacterIds);
  }

  function persistFavoriteBackgrounds() {
    persistBackgroundIdList(storageKeys.favoriteBackgrounds, state.favoriteBackgroundIds);
  }

  function persistRecentBackgrounds() {
    persistBackgroundIdList(storageKeys.recentBackgrounds, state.recentBackgroundIds);
  }

  function moveCharacterToRecent(characterId) {
    if (!characterId || !charactersById.has(characterId)) return;

    const previousTop = state.recentCharacterIds[0];
    state.recentCharacterIds = sanitizeCharacterIdList(
      [characterId, ...state.recentCharacterIds],
      {
        limit: constants.MAX_RECENT_CHARACTERS,
      },
    );

    if (previousTop === characterId) return;

    persistRecentCharacters();
    renderCharacterGrid();
  }

  function moveBackgroundToRecent(backgroundId) {
    if (!backgroundId || !backgroundsById.has(backgroundId)) return;

    const previousTop = state.recentBackgroundIds[0];
    state.recentBackgroundIds = sanitizeBackgroundIdList(
      [backgroundId, ...state.recentBackgroundIds],
      {
        limit: constants.MAX_RECENT_BACKGROUNDS,
      },
    );

    if (previousTop === backgroundId) return;

    persistRecentBackgrounds();
    renderBackgroundGrid();
  }

  function toggleFavoriteCharacter(character) {
    if (!character?.id || !charactersById.has(character.id)) return;

    const isFavorite = state.favoriteCharacterIds.includes(character.id);
    const nextAction = isFavorite ? 'Removed' : 'Added';
    const nextRelation = isFavorite ? 'from favorites' : 'to favorites';
    const nextFavoriteIds = isFavorite
      ? state.favoriteCharacterIds.filter((characterId) => characterId !== character.id)
      : [character.id, ...state.favoriteCharacterIds];

    state.favoriteCharacterIds = sanitizeCharacterIdList(nextFavoriteIds);
    persistFavoriteCharacters();
    renderCharacterGrid();
    audioService.playMenuSound(isFavorite ? 'favoriteRemove' : 'favoriteAdd');

    if (character.previewSpritePath) {
      showTransientVisualizerAlert({
        leadingText: nextAction,
        trailingText: nextRelation,
        iconSrc: view.fileToSrc(character.previewSpritePath),
        iconAlt: character.displayName,
      });
      return;
    }

    showTransientVisualizerAlert({
      action: `${nextAction} ${character.displayName} ${nextRelation}`,
    });
  }

  function toggleFavoriteBackground(background) {
    if (!background?.id || !backgroundsById.has(background.id)) return;

    const isFavorite = state.favoriteBackgroundIds.includes(background.id);
    const nextAction = isFavorite ? 'Removed' : 'Added';
    const nextRelation = isFavorite ? 'from favorites' : 'to favorites';
    const nextFavoriteIds = isFavorite
      ? state.favoriteBackgroundIds.filter((backgroundId) => backgroundId !== background.id)
      : [background.id, ...state.favoriteBackgroundIds];

    state.favoriteBackgroundIds = sanitizeBackgroundIdList(nextFavoriteIds);
    persistFavoriteBackgrounds();
    renderBackgroundGrid();
    audioService.playMenuSound(isFavorite ? 'favoriteRemove' : 'favoriteAdd');

    if (background.previewImagePath) {
      showTransientVisualizerAlert({
        leadingText: nextAction,
        trailingText: nextRelation,
        iconSrc: view.fileToSrc(background.previewImagePath),
        iconAlt: background.displayName,
        iconVariant: 'thumbnail',
      });
      return;
    }

    showTransientVisualizerAlert({
      action: `${nextAction} ${background.displayName} ${nextRelation}`,
    });
  }

  function selectCharacter(character) {
    if (state.isPlaying) return;
    if (!character?.isAvailable) return;
    if (state.selectedCharacter?.id === character.id) return;

    state.selectedCharacter = character;
    moveCharacterToRecent(character.id);
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

  function selectBackground(background) {
    if (!background?.isAvailable) return;

    if (state.selectedBackground?.id === background.id) {
      state.selectedBackground = null;
      view.updateSelectedBackgroundCard(null);
      view.applySelectedBackground(null, true);
      persistSelectedBackground();
      audioService.playMenuSound('select');
      return;
    }

    state.selectedBackground = background;
    moveBackgroundToRecent(background.id);
    view.updateSelectedBackgroundCard(background);
    view.applySelectedBackground(background, true);
    persistSelectedBackground();
    audioService.playMenuSound('select');
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
    dialogueClosePromise = null;
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
      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });
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
      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });
      await finishDialogue();
      return;
    }

    const lines = view.splitDialogueTextIntoRenderLines(text);
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

      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });

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
      await closeDialoguePlaybackToIdle({
        stopLoop: true,
      });
    }

    await finishDialogue();
  }

  async function finishDialogue() {
    await waitForDialoguePlaybackToIdle();
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
    dialogueClosePromise = null;
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

    closeDialoguePlaybackToIdle({
      stopLoop: true,
    });
    refs.statusDot.classList.remove('paused');
  }

  function doPause() {
    if (!state.isPlaying || state.isPaused || state.pauseTransitionLock) return;

    state.pauseTransitionLock = true;
    state.isPaused = true;
    resetFastForwardState();

    closeDialoguePlaybackToIdle({
      scheduleIdle: true,
    });
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

    closeFavoriteContextMenu();
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
          refs.previewArea.classList.add('preview-settings-muted', 'preview-content-hidden');
          refs.previewArea.classList.toggle('preview-content-exiting', view.shouldAnimatePreviewContentExit());
          view.setPreviewPlaceholderSuppressed(true);
        } else if (!hasCollapsedPreviewFlow) {
          await view.collapsePreviewThenSettings();
        }

        audioService.playMenuSound('settingsOpen');
        await view.flipPanel(previousPanel, 'settings');
        state.activePanel = 'settings';
        resetShortcutVisualizerState();
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

  function initShortcutVisualizerFromStorage() {
    if (!refs.inputShortcutVisualizer) return;

    let enabled = true;

    try {
      const saved = localStorage.getItem(storageKeys.shortcutVisualizerEnabled);
      if (saved !== null) {
        enabled = saved === 'true';
      }
    } catch { }

    state.shortcutVisualizerEnabled = enabled;
    refs.inputShortcutVisualizer.checked = enabled;
    syncShortcutVisualizerOverlay();
  }

  function persistSelectedBackground() {
    try {
      if (state.selectedBackground?.id) {
        localStorage.setItem(storageKeys.selectedBackground, state.selectedBackground.id);
      } else {
        localStorage.removeItem(storageKeys.selectedBackground);
      }
    } catch { }
  }

  function initFavoriteCharactersFromStorage() {
    state.favoriteCharacterIds = loadCharacterIdListFromStorage(storageKeys.favoriteCharacters);
  }

  function initRecentCharactersFromStorage() {
    state.recentCharacterIds = loadCharacterIdListFromStorage(storageKeys.recentCharacters, {
      limit: constants.MAX_RECENT_CHARACTERS,
    });
  }

  function initFavoriteBackgroundsFromStorage() {
    state.favoriteBackgroundIds = loadBackgroundIdListFromStorage(storageKeys.favoriteBackgrounds);
  }

  function initRecentBackgroundsFromStorage() {
    state.recentBackgroundIds = loadBackgroundIdListFromStorage(storageKeys.recentBackgrounds, {
      limit: constants.MAX_RECENT_BACKGROUNDS,
    });
  }

  function applyHideBrokenChars() {
    document.querySelectorAll('.char-btn.unavailable').forEach((button) => {
      button.classList.toggle('hidden-broken', state.hideBrokenChars);
    });
    view.applyCharacterFilters();
  }

  function applyHideBrokenBackgrounds() {
    view.applyBackgroundFilters();
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

  function initHideBrokenBackgroundsFromStorage() {
    if (!refs.inputHideBrokenBackgrounds) return;

    try {
      const saved = localStorage.getItem(storageKeys.hideBrokenBackgrounds);
      if (saved !== null) {
        state.hideBrokenBackgrounds = saved === 'true';
        refs.inputHideBrokenBackgrounds.checked = state.hideBrokenBackgrounds;
      } else {
        state.hideBrokenBackgrounds = refs.inputHideBrokenBackgrounds.checked;
      }
    } catch {
      state.hideBrokenBackgrounds = refs.inputHideBrokenBackgrounds.checked;
    }

    applyHideBrokenBackgrounds();
  }

  function initSelectedBackgroundFromStorage() {
    try {
      const saved = localStorage.getItem(storageKeys.selectedBackground);
      if (!saved) return;

      const background = backgrounds.find((item) => item.id === saved && item.isAvailable);
      if (!background) {
        localStorage.removeItem(storageKeys.selectedBackground);
        return;
      }

      state.selectedBackground = background;
      view.updateSelectedBackgroundCard(background);
      view.applySelectedBackground(background);
    } catch { }
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
    if (element.classList.contains('char-btn') || element.classList.contains('background-card') || element.closest('.reel-arrow')) return;
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

  document.addEventListener('mousedown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    
    const formatBtn = target.closest('.format-btn');
    if (formatBtn) {
      event.preventDefault();
      const modifier = formatBtn.dataset.modifier;
      if (modifier) {
        view.applyModifierToSelection(modifier);
      }
    }
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === refs.input) {
      view.updateFormatToolbarVisibility();
    }
  });

  refs.input.addEventListener('blur', () => {
    view.updateFormatToolbarVisibility();
  });

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

  window.addEventListener('keydown', handleShortcutKeydown, true);

  window.addEventListener('keyup', handleShortcutKeyup, true);

  window.addEventListener('blur', () => {
    resetFastForwardState();
    resetShortcutVisualizerState();
    closeFavoriteContextMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!view.isFavoriteContextMenuVisible()) return;
    if (view.isFavoriteContextMenuTarget(event.target)) return;
    closeFavoriteContextMenu();
  }, true);

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
    reelDragState = null;
    refs.charGrid.classList.remove('is-dragging');
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
  });

  window.addEventListener('pointermove', (event) => {
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

  window.addEventListener('pointerup', (event) => {
    if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
    stopCharacterGridDrag();
    if (suppressCharacterGridClick) {
      window.setTimeout(() => {
        suppressCharacterGridClick = false;
      }, 0);
    }
  });

  window.addEventListener('pointercancel', (event) => {
    if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
    stopCharacterGridDrag();
    suppressCharacterGridClick = false;
  });

  refs.charGrid?.addEventListener('click', (event) => {
    if (!suppressCharacterGridClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressCharacterGridClick = false;
  }, true);

  /* Background grid drag-scroll (mirrors character reel) */
  const BG_DRAG_THRESHOLD_PX = 6;
  let bgDragState = null;
  let suppressBackgroundGridClick = false;

  function stopBackgroundGridDrag() {
    if (!bgDragState) return;
    const grid = bgDragState.grid;
    bgDragState = null;
    grid?.classList.remove('is-dragging');
  }

  document.addEventListener('pointerdown', (event) => {
    const grid = event.target?.closest?.('.background-pack-grid');
    if (!grid || event.button !== 0) return;
    bgDragState = {
      grid,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: grid.scrollLeft,
      moved: false,
    };
    suppressBackgroundGridClick = false;
  });

  window.addEventListener('pointermove', (event) => {
    if (!bgDragState || event.pointerId !== bgDragState.pointerId) return;
    const deltaX = event.clientX - bgDragState.startX;
    if (!bgDragState.moved && Math.abs(deltaX) >= BG_DRAG_THRESHOLD_PX) {
      bgDragState.moved = true;
      suppressBackgroundGridClick = true;
      bgDragState.grid.classList.add('is-dragging');
    }
    if (!bgDragState.moved) return;
    event.preventDefault();
    bgDragState.grid.scrollLeft = bgDragState.startScrollLeft - deltaX;
  });

  window.addEventListener('pointerup', (event) => {
    if (!bgDragState || event.pointerId !== bgDragState.pointerId) return;
    stopBackgroundGridDrag();
    if (suppressBackgroundGridClick) {
      window.setTimeout(() => { suppressBackgroundGridClick = false; }, 0);
    }
  });

  window.addEventListener('pointercancel', (event) => {
    if (!bgDragState || event.pointerId !== bgDragState.pointerId) return;
    stopBackgroundGridDrag();
    suppressBackgroundGridClick = false;
  });

  document.addEventListener('click', (event) => {
    if (!suppressBackgroundGridClick) return;
    const card = event.target?.closest?.('.background-card');
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    suppressBackgroundGridClick = false;
  }, true);

  refs.charGrid.addEventListener('scroll', () => {
    closeFavoriteContextMenu();
    view.updateReelArrows();
  });
  refs.backgroundsSections?.addEventListener('scroll', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.background-pack-grid')) return;
    closeFavoriteContextMenu();
  }, true);
  refs.characterSearchInput?.addEventListener('input', () => {
    closeFavoriteContextMenu();
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true
    });
    syncShortcutVisualizerOverlay(refs.characterSearchInput);
  });

  refs.characterSearchClear?.addEventListener('click', () => {
    if (!refs.characterSearchInput) return;
    closeFavoriteContextMenu();
    refs.characterSearchInput.value = '';
    view.syncCharacterSearchClearButton();
    view.applyCharacterFilters({
      resetScroll: true
    });
    refs.characterSearchInput.focus();
    syncShortcutVisualizerOverlay(refs.characterSearchInput);
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

  refs.inputShortcutVisualizer?.addEventListener('change', () => {
    state.shortcutVisualizerEnabled = refs.inputShortcutVisualizer.checked;
    try {
      localStorage.setItem(storageKeys.shortcutVisualizerEnabled, String(state.shortcutVisualizerEnabled));
    } catch { }

    if (!state.shortcutVisualizerEnabled) {
      resetShortcutVisualizerState();
    } else {
      syncShortcutVisualizerOverlay();
    }

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

  refs.inputHideBrokenBackgrounds?.addEventListener('change', () => {
    state.hideBrokenBackgrounds = refs.inputHideBrokenBackgrounds.checked;
    try {
      localStorage.setItem(storageKeys.hideBrokenBackgrounds, String(state.hideBrokenBackgrounds));
    } catch { }
    applyHideBrokenBackgrounds();
    audioService.playMenuSound('click');
  });

  view.normalizeDialogueInput();
  view.syncCharacterSearchClearButton();
  initFavoriteCharactersFromStorage();
  initRecentCharactersFromStorage();
  initFavoriteBackgroundsFromStorage();
  initRecentBackgroundsFromStorage();
  renderCharacterGrid({
    preserveScroll: false,
  });
  renderBackgroundGrid({
    preserveActivePack: false,
    preservePackScroll: false,
  });
  requestAnimationFrame(view.updateReelArrows);
  initShortcutVisualizerFromStorage();
  syncPlaybackUiState();
  initN64ModeFromDom();
  initSelectedBackgroundFromStorage();

  try {
    const savedMirror = localStorage.getItem(storageKeys.mirrorMode);
    if (savedMirror !== null) {
      setMirrored(savedMirror === 'true');
    }
  } catch { }

  initHideBrokenFromStorage();
  initHideBrokenBackgroundsFromStorage();

  void view.runStartupSequence();

  bridge.log.info('Renderer started', {
    version: model.env.appVersion,
    characters: characters.length,
    backgrounds: backgrounds.length,
    genericSounds: genericSounds.length,
  });
  console.log(`[Dialoggo] v${model.env.appVersion} - ${characters.length} characters, ${backgrounds.length} backgrounds, ${genericSounds.length} generic sounds`);
}

module.exports = {
  startApp
};
