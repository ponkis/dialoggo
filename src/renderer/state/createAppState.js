/**
 * The renderer's mutable session state. Features read and update it directly;
 * anything that must survive a restart is persisted through PreferencesStore.
 */
function createAppState() {
  return {
    selectedCharacter: null,
    selectedBackground: null,
    isPlaying: false,
    isPaused: false,
    stopRequested: false,
    pauseTransitionLock: false,
    isFastForwarding: false,
    fastForwardKeyHeld: false,
    fastForwardButtonHeld: false,
    dialogueMirrored: false,
    n64ModeEnabled: false,
    shortcutVisualizerEnabled: true,
    hideBrokenChars: false,
    hideBrokenBackgrounds: false,
    favoriteCharacterIds: [],
    recentCharacterIds: [],
    favoriteBackgroundIds: [],
    recentBackgroundIds: [],
    hiddenCharacterIds: [],
    hiddenBackgroundIds: [],
    hiddenCharactersCollapsed: true,
    favoriteContextMenu: {
      visible: false,
      targetId: null,
      targetType: null,
      x: 0,
      y: 0,
    },
    frontPanel: 'controls',
    activePanel: 'controls',
    panelTransitionLock: false,
    pauseResolve: null,
  };
}

function isPlaybackInteractionLocked(state) {
  return state.isPlaying || state.isPaused || state.stopRequested;
}

module.exports = {
  createAppState,
  isPlaybackInteractionLocked,
};
