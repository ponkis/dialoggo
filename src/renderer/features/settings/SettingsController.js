/**
 * The settings panel toggles (mirrored box, N64 mode, shortcut visualizer,
 * hide broken characters/backgrounds) and restoring them from preferences.
 */
function createSettingsController({
  refs,
  state,
  preferences,
  dialogueBox,
  n64Text,
  spriteRenderer,
  shortcuts,
  characters,
  backgrounds,
  audio,
}) {
  const {
    keys,
  } = preferences;

  function setMirrored(mirrored) {
    state.dialogueMirrored = mirrored;
    if (refs.inputMirrored) refs.inputMirrored.checked = mirrored;
    dialogueBox.setMirrored(mirrored);
  }

  function restoreN64Mode() {
    if (!refs.inputN64) return;

    state.n64ModeEnabled = preferences.readFlag(keys.n64Mode, refs.inputN64.checked);
    refs.inputN64.checked = state.n64ModeEnabled;
    dialogueBox.syncN64Class();
  }

  function restoreShortcutVisualizer() {
    if (!refs.inputShortcutVisualizer) return;

    const enabled = preferences.readFlag(keys.shortcutVisualizerEnabled, true);
    state.shortcutVisualizerEnabled = enabled;
    refs.inputShortcutVisualizer.checked = enabled;
    shortcuts.syncOverlay();
  }

  function restoreMirrored() {
    if (preferences.readString(keys.mirrorMode) !== null) {
      setMirrored(preferences.readFlag(keys.mirrorMode, false));
    }
  }

  function restoreHideBrokenCharacters() {
    if (!refs.inputHideBroken) return;

    const hideBroken = preferences.readFlag(keys.hideBrokenChars, refs.inputHideBroken.checked);
    refs.inputHideBroken.checked = hideBroken;
    characters.setHideBroken(hideBroken);
  }

  function restoreHideBrokenBackgrounds() {
    if (!refs.inputHideBrokenBackgrounds) return;

    const hideBroken = preferences.readFlag(keys.hideBrokenBackgrounds, refs.inputHideBrokenBackgrounds.checked);
    refs.inputHideBrokenBackgrounds.checked = hideBroken;
    backgrounds.setHideBroken(hideBroken);
  }

  function restoreHiddenCharactersCollapsed() {
    const saved = preferences.readString(keys.hiddenCharactersCollapsed);
    if (saved !== null) state.hiddenCharactersCollapsed = saved !== 'false';
  }

  function bindEvents() {
    refs.inputMirrored?.addEventListener('change', () => {
      setMirrored(refs.inputMirrored.checked);
      preferences.writeString(keys.mirrorMode, refs.inputMirrored.checked);
      audio.playMenuSound('click');
    });

    refs.inputN64?.addEventListener('change', () => {
      state.n64ModeEnabled = refs.inputN64.checked;
      preferences.writeString(keys.n64Mode, state.n64ModeEnabled);
      dialogueBox.syncN64Class();
      spriteRenderer.redraw();
      if (state.n64ModeEnabled) n64Text.render();
      else n64Text.clear();
      audio.playMenuSound('click');
    });

    refs.inputShortcutVisualizer?.addEventListener('change', () => {
      const enabled = refs.inputShortcutVisualizer.checked;
      preferences.writeString(keys.shortcutVisualizerEnabled, enabled);
      shortcuts.setVisualizerEnabled(enabled);
      audio.playMenuSound('click');
    });

    refs.inputHideBroken?.addEventListener('change', () => {
      preferences.writeString(keys.hideBrokenChars, refs.inputHideBroken.checked);
      characters.setHideBroken(refs.inputHideBroken.checked);
      audio.playMenuSound('click');
    });

    refs.inputHideBrokenBackgrounds?.addEventListener('change', () => {
      preferences.writeString(keys.hideBrokenBackgrounds, refs.inputHideBrokenBackgrounds.checked);
      backgrounds.setHideBroken(refs.inputHideBrokenBackgrounds.checked);
      audio.playMenuSound('click');
    });
  }

  return {
    bindEvents,
    restoreHiddenCharactersCollapsed,
    restoreHideBrokenBackgrounds,
    restoreHideBrokenCharacters,
    restoreMirrored,
    restoreN64Mode,
    restoreShortcutVisualizer,
  };
}

module.exports = {
  createSettingsController,
};
