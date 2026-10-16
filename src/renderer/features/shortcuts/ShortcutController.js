const {
  isTallPanel,
} = require('../panels/panelRules');

const TRANSIENT_ALERT_MS = 1650;
const TRANSIENT_ALERT_FADE_MS = 220;
const TEXT_ENTRY_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

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

function isTextEntryElement(element) {
  if (!(element instanceof HTMLElement)) return false;

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  if (element instanceof HTMLInputElement) {
    const type = String(element.type || 'text').toLowerCase();
    return TEXT_ENTRY_INPUT_TYPES.has(type) && !element.readOnly && !element.disabled;
  }

  return element.isContentEditable;
}

/**
 * Keyboard shortcuts (Space, Shift+Space, Ctrl+Space, Esc) and the on-screen
 * visualizer that echoes held keys, executed shortcuts, and transient alerts
 * such as "Added to favorites".
 */
function createShortcutController({
  refs,
  state,
  visualizerView,
  playback,
  characterGrid,
  contextMenu,
}) {
  const heldKeys = new Set();
  const modifierState = {
    alt: false,
    meta: false,
  };
  const keyboardPressedButtons = new Set();
  let lastExecutedShortcut = null;
  let transientAlert = null;
  let transientAlertTimer = 0;
  let transientAlertFadeTimer = 0;

  function shouldIgnorePlaybackShortcut(target) {
    const activeTarget = target instanceof Element ? target : document.activeElement;
    if (!(activeTarget instanceof HTMLElement)) return false;
    const editable = activeTarget.closest('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    return isTextEntryElement(editable);
  }

  function areShortcutsBlocked() {
    return isTallPanel(state.activePanel);
  }

  function canUsePlaybackShortcut(target) {
    return !areShortcutsBlocked() && !shouldIgnorePlaybackShortcut(target) && !modifierState.alt && !modifierState.meta;
  }

  function canDisplayPlaybackShortcut(target) {
    return !areShortcutsBlocked() && !shouldIgnorePlaybackShortcut(target);
  }

  function isCharacterSearchTarget(target) {
    if (areShortcutsBlocked()) return false;
    const activeTarget = target instanceof Element ? target : document.activeElement;
    return !!refs.characterSearchInput && activeTarget === refs.characterSearchInput;
  }

  function clearCharacterSearch() {
    if (!characterGrid.clearSearchQuery()) return false;
    characterGrid.syncSearchClearButton();
    characterGrid.applyFilters({
      resetScroll: true,
    });
    return true;
  }

  function getPlaybackToggleLabel() {
    if (state.isPlaying && !state.isPaused) return 'Pause';
    if (state.isPaused) return 'Resume';
    return 'Play';
  }

  function isPlaying() {
    return state.isPlaying && !state.isPaused;
  }

  function getShortcutDefinitions(target = document.activeElement) {
    return [
      {
        id: 'playback-stop',
        keys: ['ctrl', 'space'],
        triggerKey: 'space',
        priority: 300,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => canUsePlaybackShortcut(target) && !playback.isButtonBlocked('stop'),
        getActionLabel: () => 'Stop',
        getButtonElement: () => refs.btnStop,
        execute: () => playback.executeKeyboardCommand('stop'),
      },
      {
        id: 'playback-fast-forward',
        keys: ['shift', 'space'],
        triggerKey: 'space',
        priority: 200,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => canUsePlaybackShortcut(target) && playback.canFastForward() && !playback.isButtonBlocked('fastForward'),
        getActionLabel: () => 'Fast forward',
        getButtonElement: () => refs.btnFastForward,
        execute: () => playback.executeKeyboardCommand('fastForward'),
      },
      {
        id: 'playback-toggle',
        keys: ['space'],
        triggerKey: 'space',
        priority: 100,
        isVisible: () => canDisplayPlaybackShortcut(target),
        isAvailable: () => {
          if (!canUsePlaybackShortcut(target)) return false;
          return isPlaying() ?
            !playback.isButtonBlocked('pause') :
            !playback.isButtonBlocked('play');
        },
        getActionLabel: () => getPlaybackToggleLabel(),
        getButtonElement: () => (isPlaying() ? refs.btnPause : refs.btnPlay),
        execute: () => playback.executeKeyboardCommand('togglePlayPause'),
      },
      {
        id: 'search-clear',
        keys: ['escape'],
        triggerKey: 'escape',
        priority: 50,
        isVisible: () => isCharacterSearchTarget(target),
        isAvailable: () => isCharacterSearchTarget(target) && characterGrid.hasSearchQuery(),
        getActionLabel: () => 'Clear search',
        getButtonElement: () => null,
        execute: () => clearCharacterSearch(),
      },
    ];
  }

  /** Picks the shortcut that best matches the held keys: complete first, then most keys, then priority. */
  function getShortcutCandidate(target = document.activeElement, requireAvailability = true) {
    return getShortcutDefinitions(target)
      .map((shortcut) => {
        const matchedKeys = shortcut.keys.filter((key) => heldKeys.has(key));
        return {
          shortcut,
          matchedKeys,
          isComplete: shortcut.keys.every((key) => heldKeys.has(key)),
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

  function dropReleasedExecutedShortcut() {
    if (lastExecutedShortcut && !lastExecutedShortcut.keys.every((key) => heldKeys.has(key))) {
      lastExecutedShortcut = null;
    }
  }

  function syncOverlay(target = document.activeElement) {
    if (!state.shortcutVisualizerEnabled) {
      visualizerView.sync();
      return;
    }

    if (transientAlert) {
      visualizerView.sync({
        visible: true,
        keys: [],
        ...transientAlert,
      });
      return;
    }

    dropReleasedExecutedShortcut();

    if (lastExecutedShortcut) {
      visualizerView.sync({
        visible: true,
        keys: lastExecutedShortcut.keys,
        action: lastExecutedShortcut.label,
      });
      return;
    }

    const candidate = getShortcutCandidate(target, false);
    if (!candidate) {
      visualizerView.sync();
      return;
    }

    visualizerView.sync({
      visible: true,
      keys: candidate.matchedKeys,
      action: '',
    });
  }

  function clearTransientAlertTimers() {
    if (transientAlertTimer) {
      window.clearTimeout(transientAlertTimer);
      transientAlertTimer = 0;
    }
    if (transientAlertFadeTimer) {
      window.clearTimeout(transientAlertFadeTimer);
      transientAlertFadeTimer = 0;
    }
  }

  /** Shows a short-lived message (optionally with an icon) in the visualizer. */
  function showTransientAlert({
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    if (!state.shortcutVisualizerEnabled) return;

    transientAlert = {
      action,
      leadingText,
      trailingText,
      iconSrc,
      iconAlt,
      iconVariant,
    };

    clearTransientAlertTimers();
    visualizerView.setAlertExiting(false);
    syncOverlay();

    transientAlertTimer = window.setTimeout(() => {
      visualizerView.setAlertExiting(true);
      transientAlertTimer = 0;
      transientAlertFadeTimer = window.setTimeout(() => {
        transientAlert = null;
        transientAlertFadeTimer = 0;
        visualizerView.setAlertExiting(false);
        syncOverlay();
      }, TRANSIENT_ALERT_FADE_MS);
    }, TRANSIENT_ALERT_MS);
  }

  function setKeyboardPressedButtons(buttons) {
    const nextButtons = new Set(
      Array.from(buttons || []).filter((button) => button instanceof HTMLElement),
    );

    keyboardPressedButtons.forEach((button) => {
      if (nextButtons.has(button)) return;
      visualizerView.setButtonKeyboardPressed(button, false);
    });

    nextButtons.forEach((button) => {
      if (keyboardPressedButtons.has(button)) return;
      visualizerView.setButtonKeyboardPressed(button, true);
    });

    keyboardPressedButtons.clear();
    nextButtons.forEach((button) => {
      keyboardPressedButtons.add(button);
    });
  }

  function syncKeyboardPressedButtons(target = document.activeElement) {
    dropReleasedExecutedShortcut();

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

  function resetVisualizerState() {
    heldKeys.clear();
    modifierState.alt = false;
    modifierState.meta = false;
    lastExecutedShortcut = null;
    clearTransientAlertTimers();
    transientAlert = null;
    visualizerView.setAlertExiting(false);
    setKeyboardPressedButtons([]);
    visualizerView.sync();
  }

  function syncModifierState(event) {
    modifierState.alt = event.altKey === true;
    modifierState.meta = event.metaKey === true;
  }

  function handleKeydown(event) {
    syncModifierState(event);

    const key = getCanonicalShortcutKey(event.code);
    if (key) heldKeys.add(key);

    if (key === 'escape' && contextMenu.isVisible()) {
      event.preventDefault();
      contextMenu.hide();
      setKeyboardPressedButtons([]);
      visualizerView.sync();
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

    syncKeyboardPressedButtons(event.target);
    syncOverlay(event.target);
  }

  function handleKeyup(event) {
    syncModifierState(event);

    const key = getCanonicalShortcutKey(event.code);
    if (key) heldKeys.delete(key);

    if (event.code === 'Space') {
      playback.setFastForwardKeyHeld(false);
    }

    syncKeyboardPressedButtons(event.target);
    syncOverlay(event.target);
  }

  function setVisualizerEnabled(enabled) {
    state.shortcutVisualizerEnabled = enabled;
    if (!enabled) {
      resetVisualizerState();
    } else {
      syncOverlay();
    }
  }

  function bindEvents() {
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('keyup', handleKeyup, true);
  }

  return {
    bindEvents,
    resetVisualizerState,
    setVisualizerEnabled,
    showTransientAlert,
    syncOverlay,
  };
}

module.exports = {
  createShortcutController,
};
