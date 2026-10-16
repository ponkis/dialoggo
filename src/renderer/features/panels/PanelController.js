const {
  PANELS,
  isTallPanel,
} = require('./panelRules');

/**
 * Switches between the controls, backgrounds, guide, and settings panels from
 * the sleeve tabs, coordinating the flip animation with the preview layout.
 */
function createPanelController({
  refs,
  state,
  panelView,
  previewView,
  contextMenu,
  audio,
  shortcuts,
}) {
  async function showPanel(panel) {
    if (state.panelTransitionLock || panel === state.activePanel) return;
    if (isTallPanel(panel) && (state.isPlaying || state.isPaused)) return;

    contextMenu.hide();
    state.panelTransitionLock = true;
    const large = panelView.isLargeScreen();
    const previousPanel = state.activePanel;
    const hasCollapsedPreviewFlow = panelView.isPreviewCollapsed();
    const leavingTallPanel = isTallPanel(previousPanel);
    previewView.setPlaceholderPanelIntent(panel);
    previewView.setPlaceholderSuppressed(panel !== PANELS.controls);

    try {
      panelView.setActiveSleeve(panel);

      if (isTallPanel(panel)) {
        if (!large && !hasCollapsedPreviewFlow) {
          panelView.rememberNaturalPanelHeight();
        }

        if (large) {
          panelView.mutePreview();
        } else if (!hasCollapsedPreviewFlow) {
          await panelView.collapsePreviewThenSettings();
        }

        audio.playMenuSound('settingsOpen');
        await panelView.flipPanel(previousPanel, panel);
        if (panel === PANELS.guide) state.frontPanel = PANELS.guide;
        state.activePanel = panel;
        shortcuts.resetVisualizerState();
      } else {
        const toControls = panel === PANELS.controls;
        audio.playMenuSound(toControls ? 'settingsClose' : 'settingsOpen');
        await panelView.flipPanel(previousPanel, panel);
        state.frontPanel = panel;
        state.activePanel = panel;

        if (leavingTallPanel && hasCollapsedPreviewFlow) {
          await panelView.expandPreviewAfterControls({
            keepPlaceholderSuppressed: !toControls,
          });
        } else {
          panelView.syncFrontPanelLayout({
            suppressPlaceholder: !toControls,
          });
        }
      }
    } finally {
      previewView.setPlaceholderPanelIntent(null);
      state.panelTransitionLock = false;
    }
  }

  function togglePanel(panel) {
    void showPanel(state.activePanel === panel ? PANELS.controls : panel);
  }

  function bindEvents() {
    refs.sleeveSettings.addEventListener('click', () => {
      if (panelView.isSleeveBlocked(refs.sleeveSettings)) return;
      audio.playMenuSound('click');
      togglePanel(PANELS.settings);
    });

    refs.sleeveCamera.addEventListener('click', () => {
      if (state.isPlaying || state.isPaused) return;
      audio.playMenuSound('forbidden');
    });

    refs.sleeveBackgrounds?.addEventListener('click', () => {
      if (panelView.isSleeveBlocked(refs.sleeveBackgrounds)) return;
      audio.playMenuSound('click');
      togglePanel(PANELS.backgrounds);
    });

    refs.sleeveGuide?.addEventListener('click', () => {
      if (panelView.isSleeveBlocked(refs.sleeveGuide)) return;
      audio.playMenuSound('click');
      togglePanel(PANELS.guide);
    });

    refs.sleeveCharacter?.addEventListener('click', () => {
      if (panelView.isSleeveBlocked(refs.sleeveCharacter)) return;
      audio.playMenuSound('forbidden');
    });
  }

  return {
    bindEvents,
    showPanel,
  };
}

module.exports = {
  createPanelController,
};
