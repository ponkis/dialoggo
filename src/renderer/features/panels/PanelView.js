const {
  nextPaint,
  prefersReducedMotion,
  sleep,
} = require('../../core/timing');
const {
  PANELS,
} = require('./panelRules');

function getFlipPhaseAngles(fromPanel, toPanel) {
  if (fromPanel === PANELS.settings && toPanel !== PANELS.settings) {
    return {
      outFrom: 180,
      outTo: 90,
      inFrom: 90,
      inTo: 0,
    };
  }

  if (fromPanel !== PANELS.settings && toPanel === PANELS.settings) {
    return {
      outFrom: 0,
      outTo: 90,
      inFrom: 90,
      inTo: 180,
    };
  }

  return {
    outFrom: 0,
    outTo: 90,
    inFrom: -90,
    inTo: 0,
  };
}

/**
 * The flip card that holds the controls, backgrounds, guide, and settings
 * panels, its sleeve tabs, the footer catalog summary, and the preview
 * collapse/expand that makes room for the tall panels.
 */
function createPanelView({
  refs,
  state,
  constants,
  catalog,
  previewView,
}) {
  let flipCardAnimation = null;

  function getCharacterFooterText() {
    const {
      packs,
      characters,
    } = catalog;
    const packCount = Array.isArray(packs) && packs.length > 0 ?
      packs.filter((pack) => Number(pack?.characterCount) > 0).length :
      new Set(characters.map((character) => character.packId)).size;

    return packCount > 0 ?
      `${characters.length} chars / ${packCount} packs` :
      `${characters.length} chars`;
  }

  function getBackgroundFooterText() {
    const {
      backgroundPacks,
      backgrounds,
    } = catalog;
    const packCount = Array.isArray(backgroundPacks) && backgroundPacks.length > 0 ?
      backgroundPacks.filter((pack) => (
        Number(pack?.backgroundCount) > 0 ||
        String(pack?.id || '').toLowerCase() === 'custom'
      )).length :
      new Set(backgrounds.map((background) => background.packId)).size;

    return packCount > 0 ?
      `${backgrounds.length} backgrounds / ${packCount} packs` :
      `${backgrounds.length} backgrounds`;
  }

  function syncFooterCatalogText(panel = state.frontPanel || state.activePanel || PANELS.controls) {
    if (!refs.charCount) return;
    refs.charCount.textContent = panel === PANELS.backgrounds ?
      getBackgroundFooterText() :
      getCharacterFooterText();
  }

  function setFrontPanel(panel) {
    refs.controlsPanel?.classList.toggle('active', panel === PANELS.controls);
    refs.backgroundsPanel?.classList.toggle('active', panel === PANELS.backgrounds);
    refs.guidePanel?.classList.toggle('active', panel === PANELS.guide);

    refs.controlsPanel?.setAttribute('aria-hidden', panel !== PANELS.controls ? 'true' : 'false');
    refs.backgroundsPanel?.setAttribute('aria-hidden', panel !== PANELS.backgrounds ? 'true' : 'false');
    refs.guidePanel?.setAttribute('aria-hidden', panel !== PANELS.guide ? 'true' : 'false');
    syncFooterCatalogText(panel);
  }

  function setActiveBackPanel(panel) {
    refs.settingsPanel?.classList.toggle('active', panel === PANELS.settings);
    refs.settingsPanel?.setAttribute('aria-hidden', panel !== PANELS.settings ? 'true' : 'false');
  }

  function setFlipCardPanel(panel) {
    refs.flipCard?.classList.toggle('panel-settings', panel === PANELS.settings);
  }

  function applyPanelState(panel) {
    if (panel === PANELS.settings) {
      setActiveBackPanel(PANELS.settings);
      setFlipCardPanel(PANELS.settings);
      return;
    }

    setFlipCardPanel(null);
    setActiveBackPanel(null);
    setFrontPanel(panel);
  }

  /** Applies the initial panel state without animating. */
  function initialize() {
    setFrontPanel(state.frontPanel || PANELS.controls);
    setActiveBackPanel(state.activePanel === PANELS.settings ? PANELS.settings : null);
    setFlipCardPanel(state.activePanel === PANELS.settings ? PANELS.settings : null);
  }

  function setActiveSleeve(panel) {
    refs.sleeveSettings.classList.toggle('active', panel === PANELS.settings);
    refs.sleeveBackgrounds.classList.toggle('active', panel === PANELS.backgrounds);
    refs.sleeveGuide?.classList.toggle('active', panel === PANELS.guide);
  }

  function syncSleeveBlockedState(blocked) {
    const setBlockedState = (element, isBlocked, title) => {
      if (!element) return;
      element.classList.toggle('sleeve-tab-blocked', isBlocked);
      element.setAttribute('aria-disabled', isBlocked ? 'true' : 'false');
      element.title = title;
    };

    setBlockedState(refs.sleeveSettings, blocked, 'Settings');
    setBlockedState(refs.sleeveBackgrounds, false, 'Backgrounds');
    setBlockedState(refs.sleeveGuide, blocked, 'Guide');
    setBlockedState(refs.sleeveCharacter, blocked, 'Character');
    setBlockedState(refs.sleeveCamera, blocked, 'Export');
  }

  function isSleeveBlocked(element) {
    return element?.getAttribute('aria-disabled') === 'true';
  }

  async function runFlipPhase(fromDeg, toDeg, duration) {
    if (!refs.flipCard || typeof refs.flipCard.animate !== 'function' || fromDeg === toDeg) return;

    if (flipCardAnimation) {
      flipCardAnimation.cancel();
      flipCardAnimation = null;
    }

    const animation = refs.flipCard.animate(
      [
        { transform: `rotateY(${fromDeg}deg)` },
        { transform: `rotateY(${toDeg}deg)` },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.4, 0.2, 0.2, 1)',
        fill: 'forwards',
      },
    );

    flipCardAnimation = animation;

    try {
      await animation.finished;
    } catch {
      // Ignore cancellations; the final state is applied by the caller.
    } finally {
      if (typeof animation.commitStyles === 'function') {
        animation.commitStyles();
      }

      animation.cancel();

      if (flipCardAnimation === animation) {
        flipCardAnimation = null;
      }
    }
  }

  async function flipPanel(fromPanel, toPanel) {
    if (fromPanel === toPanel) {
      applyPanelState(toPanel);
      return;
    }

    if (!refs.flipCard || typeof refs.flipCard.animate !== 'function') {
      applyPanelState(toPanel);
      return;
    }

    const phaseMs = Math.round(constants.FLIP_CARD_MS / 2);
    const angles = getFlipPhaseAngles(fromPanel, toPanel);
    previewView.flushBackgroundTransition();
    refs.flipCard.classList.add('panel-flipping');

    try {
      await runFlipPhase(angles.outFrom, angles.outTo, phaseMs);
      applyPanelState(toPanel);
      await runFlipPhase(angles.inFrom, angles.inTo, phaseMs);
    } finally {
      if (flipCardAnimation) {
        flipCardAnimation.cancel();
        flipCardAnimation = null;
      }

      refs.flipCard.classList.remove('panel-flipping');
      refs.flipCard.style.transform = '';
    }
  }

  function isLargeScreen() {
    return window.innerHeight >= constants.LARGE_SCREEN_MIN_HEIGHT;
  }

  function isPreviewCollapsed() {
    return refs.app?.classList.contains('settings-panel-open') === true;
  }

  function rememberNaturalPanelHeight() {
    if (!refs.panelWrapper) return;
    refs.panelWrapper.dataset.naturalPanelHeight = String(
      Math.round(refs.panelWrapper.getBoundingClientRect().height),
    );
  }

  /** Large screens keep the preview in place but dim and empty it. */
  function mutePreview() {
    refs.previewArea.classList.add('preview-settings-muted', 'preview-content-hidden');
    refs.previewArea.classList.toggle('preview-content-exiting', previewView.shouldAnimateContentExit());
    previewView.setPlaceholderSuppressed(true);
  }

  function computeExpandedPreviewHeight() {
    if (!refs.app || !refs.bottombar) return 280;

    const storedHeight = refs.panelWrapper?.dataset?.naturalPanelHeight;
    const panelHeight = storedHeight ? Number(storedHeight) : (refs.panelWrapper?.offsetHeight ?? 200);
    return Math.max(120, refs.app.clientHeight - refs.bottombar.offsetHeight - panelHeight);
  }

  function resetPanelWrapperInlineStyles() {
    if (!refs.panelWrapper) return;

    refs.panelWrapper.style.height = '';
    refs.panelWrapper.style.flex = '';
    refs.panelWrapper.style.minHeight = '';
    refs.panelWrapper.style.overflow = '';
    refs.panelWrapper.style.transition = '';
    if (refs.flipCard) {
      refs.flipCard.style.overflow = '';
    }
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

  /** Restores the regular preview/panel layout for a front panel. */
  function syncFrontPanelLayout({
    suppressPlaceholder = false,
  } = {}) {
    refs.previewArea.classList.remove('preview-settings-muted', 'preview-strip-collapsed', 'preview-content-hidden', 'preview-content-exiting');
    previewView.setPlaceholderSuppressed(suppressPlaceholder);

    resetPreviewAreaInlineStyles();
    clearExpandedPanelFlow();
    previewView.syncPlaceholderState();
  }

  async function collapsePreviewThenSettings() {
    const height = Math.round(refs.previewArea.getBoundingClientRect().height);
    const panelHeight = Math.round(refs.panelWrapper?.getBoundingClientRect().height ?? 0);
    const targetPanelHeight = refs.app && refs.bottombar ?
      Math.max(panelHeight, refs.app.clientHeight - refs.bottombar.offsetHeight - constants.PREVIEW_STRIP_HEIGHT) :
      panelHeight;

    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${height}px`;
    refs.previewArea.style.overflow = 'hidden';

    if (refs.panelWrapper) {
      refs.panelWrapper.style.flex = '0 0 auto';
      refs.panelWrapper.style.minHeight = '0';
      refs.panelWrapper.style.height = `${panelHeight}px`;
      refs.panelWrapper.style.overflow = 'visible';
    }

    if (refs.flipCard) {
      refs.flipCard.style.overflow = 'hidden';
    }

    refs.app?.classList.add('settings-panel-open');
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    if (refs.panelWrapper) {
      refs.panelWrapper.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    }
    refs.previewArea.classList.add('preview-strip-collapsed', 'preview-settings-muted', 'preview-content-hidden');
    refs.previewArea.classList.toggle('preview-content-exiting', previewView.shouldAnimateContentExit());
    previewView.setPlaceholderSuppressed(true);

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
      if (refs.panelWrapper) {
        refs.panelWrapper.style.height = `${targetPanelHeight}px`;
      }
    });

    await sleep(constants.PREVIEW_COLLAPSE_MS + 40);
    resetPanelWrapperInlineStyles();
  }

  async function expandPreviewAfterControls({
    keepPlaceholderSuppressed = false,
  } = {}) {
    const targetHeight = computeExpandedPreviewHeight();
    const revealPlaceholderOnly = !keepPlaceholderSuppressed &&
      !refs.dialogueContainer?.classList.contains('active') &&
      !prefersReducedMotion();
    refs.previewArea.style.flex = '0 0 auto';
    refs.previewArea.style.minHeight = '0';
    refs.previewArea.style.height = `${constants.PREVIEW_STRIP_HEIGHT}px`;
    refs.previewArea.style.overflow = 'hidden';
    void refs.previewArea.offsetHeight;

    refs.previewArea.style.transition = `height ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}, filter ${constants.PREVIEW_COLLAPSE_MS}ms ${constants.PREVIEW_EASE}`;
    previewView.setPlaceholderSuppressed(true);

    requestAnimationFrame(() => {
      refs.previewArea.style.height = `${targetHeight}px`;
      refs.previewArea.classList.remove('preview-settings-muted', 'preview-content-exiting');
    });

    await sleep(constants.PREVIEW_COLLAPSE_MS + 50);

    if (revealPlaceholderOnly && refs.previewAreaContent) {
      refs.previewAreaContent.style.transition = 'none';
    }

    refs.previewArea.classList.remove('preview-strip-collapsed', 'preview-content-hidden');
    resetPreviewAreaInlineStyles();
    clearExpandedPanelFlow();
    resetPanelWrapperInlineStyles();

    if (revealPlaceholderOnly && refs.previewAreaContent) {
      void refs.previewAreaContent.offsetWidth;
      refs.previewAreaContent.style.transition = '';
    }

    if (!keepPlaceholderSuppressed) {
      await nextPaint();
    }
    previewView.setPlaceholderSuppressed(keepPlaceholderSuppressed);
    previewView.syncPlaceholderState();
  }

  return {
    collapsePreviewThenSettings,
    expandPreviewAfterControls,
    flipPanel,
    initialize,
    isLargeScreen,
    isPreviewCollapsed,
    isSleeveBlocked,
    mutePreview,
    rememberNaturalPanelHeight,
    setActiveSleeve,
    syncFrontPanelLayout,
    syncSleeveBlockedState,
  };
}

module.exports = {
  createPanelView,
};
