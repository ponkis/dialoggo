const {
  prefersReducedMotion,
} = require('../../core/timing');

function renderStackedText(element, text, options = {}) {
  const characters = Array.from(text || '');
  const length = characters.length;
  element.replaceChildren(...characters.map((char, i) => {
    const span = document.createElement('span');
    span.style.zIndex = String(length - i);
    if (char === ' ') {
      span.className = 'space';
      span.textContent = ' ';
      return span;
    }

    span.textContent = char;
    if (options.funky) {
      // Deterministic wobble so the same title always gets the same tilt.
      const seed = Math.sin((char.codePointAt(0) * 12.9898) + (i * 78.233)) * 43758.5453;
      const jitter = seed - Math.floor(seed);
      const direction = i % 2 === 0 ? -1 : 1;
      const rotate = direction * (4 + (jitter * 7));
      const lift = (jitter - 0.5) * 8;
      span.style.transform = `translateY(${lift.toFixed(1)}px) rotate(${rotate.toFixed(1)}deg)`;
    }
    return span;
  }));
}

/**
 * The scene preview above the panels: the cross-fading background layers,
 * the background title banner, and the idle loading placeholder.
 */
function createPreviewView({
  refs,
  state,
  constants,
  loadingFrames,
}) {
  let placeholderFrameIdx = 0;
  let placeholderTimer = null;
  let placeholderExplicitSuppression = false;
  let placeholderPanelIntent = null;
  let backgroundTransitionTimer = 0;
  let pendingImage = 'none';
  let pendingHasImage = false;

  function showPlaceholderFrame() {
    const frameUrl = loadingFrames[placeholderFrameIdx];
    if (frameUrl) {
      refs.placeholderAnim.src = frameUrl;
    }
  }

  function startPlaceholderAnim() {
    if (placeholderTimer) return;

    placeholderFrameIdx = 0;
    showPlaceholderFrame();
    placeholderTimer = setInterval(() => {
      placeholderFrameIdx = (placeholderFrameIdx + 1) % loadingFrames.length;
      showPlaceholderFrame();
    }, 90);
  }

  function stopPlaceholderAnim() {
    if (!placeholderTimer) return;
    clearInterval(placeholderTimer);
    placeholderTimer = null;
  }

  function isDialogueOpen() {
    return refs.dialogueContainer?.classList.contains('active') === true;
  }

  function shouldSuppressPlaceholder() {
    const panel = placeholderPanelIntent || state.activePanel || 'controls';
    return placeholderExplicitSuppression || panel !== 'controls' || isDialogueOpen();
  }

  function shouldAnimateContentExit() {
    return isDialogueOpen();
  }

  function syncPlaceholderState() {
    const suppressed = shouldSuppressPlaceholder();
    refs.previewArea?.classList.toggle('preview-placeholder-suppressed', suppressed);
    refs.placeholder?.classList.toggle('fade-out', suppressed);

    if (suppressed) {
      stopPlaceholderAnim();
      return;
    }

    startPlaceholderAnim();
  }

  function setPlaceholderSuppressed(suppressed) {
    placeholderExplicitSuppression = suppressed === true;
    syncPlaceholderState();
  }

  function setPlaceholderPanelIntent(panel) {
    placeholderPanelIntent = panel || null;
    syncPlaceholderState();
  }

  function setBackgroundLayer(layer, imageValue, hasImage) {
    if (!layer) return;

    layer.style.setProperty('--preview-layer-image', hasImage ? imageValue : 'none');
    layer.classList.toggle('has-image', hasImage);
  }

  function commitBackground(imageValue, hasImage) {
    setBackgroundLayer(refs.previewBackgroundCurrent, imageValue, hasImage);
    setBackgroundLayer(refs.previewBackgroundNext, 'none', false);
    refs.previewArea?.classList.remove('is-transitioning-background', 'is-clearing-background');
    refs.previewArea?.classList.toggle('has-selected-background', hasImage);
    pendingImage = imageValue;
    pendingHasImage = hasImage;
  }

  /** Jumps a running background cross-fade straight to its end state. */
  function flushBackgroundTransition() {
    if (
      !refs.previewArea?.classList.contains('is-transitioning-background') &&
      !refs.previewArea?.classList.contains('is-clearing-background')
    ) return;

    window.clearTimeout(backgroundTransitionTimer);
    backgroundTransitionTimer = 0;
    commitBackground(pendingImage, pendingHasImage);
  }

  function showBanner(background) {
    renderStackedText(refs.bannerTitle, background?.displayName || '', {
      funky: true,
    });
    renderStackedText(refs.bannerSubtitle, background?.packDisplayName ? `( ${background.packDisplayName} )` : '');
    refs.banner.classList.remove('active');
    void refs.banner.offsetWidth;
    refs.banner.classList.add('active');
  }

  function applySelectedBackground(background, isUserAction = false) {
    if (!refs.previewArea) return;

    const hasPreviewImage = Boolean(background?.previewImageUrl);
    const nextImageValue = hasPreviewImage ? `url("${background.previewImageUrl}")` : 'none';

    if (!refs.previewBackgroundCurrent || !refs.previewBackgroundNext) {
      refs.previewArea.style.setProperty('--preview-scene-image', nextImageValue);
      refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
      return;
    }

    flushBackgroundTransition();

    const currentHasImage = refs.previewBackgroundCurrent.classList.contains('has-image');
    const currentImageValue = currentHasImage ?
      (refs.previewBackgroundCurrent.style.getPropertyValue('--preview-layer-image').trim() || 'none') :
      'none';

    if (currentHasImage === hasPreviewImage && currentImageValue === nextImageValue) {
      refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
      return;
    }

    if (prefersReducedMotion()) {
      commitBackground(nextImageValue, hasPreviewImage);
      return;
    }

    pendingImage = nextImageValue;
    pendingHasImage = hasPreviewImage;
    setBackgroundLayer(refs.previewBackgroundCurrent, currentImageValue, currentHasImage);
    setBackgroundLayer(refs.previewBackgroundNext, nextImageValue, hasPreviewImage);
    refs.previewArea.classList.toggle('has-selected-background', hasPreviewImage);
    const isClearingBackground = currentHasImage && !hasPreviewImage;
    refs.previewArea.classList.remove('is-transitioning-background', 'is-clearing-background');
    void refs.previewArea.offsetWidth;
    refs.previewArea.classList.add(isClearingBackground ? 'is-clearing-background' : 'is-transitioning-background');

    backgroundTransitionTimer = window.setTimeout(() => {
      backgroundTransitionTimer = 0;
      commitBackground(pendingImage, pendingHasImage);
    }, constants.PREVIEW_BACKGROUND_TRANSITION_MS + 40);

    if (hasPreviewImage && isUserAction) {
      showBanner(background);
    } else if (!isUserAction || !hasPreviewImage) {
      refs.banner.classList.remove('active');
    }
  }

  return {
    applySelectedBackground,
    flushBackgroundTransition,
    setPlaceholderPanelIntent,
    setPlaceholderSuppressed,
    shouldAnimateContentExit,
    syncPlaceholderState,
  };
}

module.exports = {
  createPreviewView,
};
