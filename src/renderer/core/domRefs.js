/**
 * Looks up every element the features render into once at startup. Features
 * receive this registry instead of querying the document on their own.
 */
function collectDomRefs(doc = document) {
  const byId = (id) => doc.getElementById(id);

  return {
    app: doc.querySelector('.app'),
    panelWrapper: doc.querySelector('.panel-wrapper'),
    bottombar: doc.querySelector('.bottombar'),
    btnMinimize: byId('btn-minimize'),
    btnClose: byId('btn-close'),
    brandLink: byId('brand-link'),
    versionLabel: byId('version-label'),
    statusDot: byId('status-dot'),
    charCount: byId('char-count'),

    startupOverlay: byId('startup-overlay'),
    startupLoadingAnim: byId('startup-loading-anim'),
    startupIntroCanvas: byId('startup-intro-canvas'),

    charGrid: byId('character-grid'),
    characterSearchInput: byId('character-search-input'),
    characterSearchClear: byId('character-search-clear'),
    characterSearchEmpty: byId('character-search-empty'),
    reelLeft: byId('reel-arrow-left'),
    reelRight: byId('reel-arrow-right'),

    input: byId('dialogue-input'),
    dialogueInputHighlight: byId('dialogue-input-highlight'),
    dialogueInputCounter: byId('dialogue-input-counter'),
    formatToolbar: byId('dialogue-format-toolbar'),

    btnPlay: byId('btn-play'),
    btnPause: byId('btn-pause'),
    btnStop: byId('btn-stop'),
    btnFastForward: byId('btn-fastforward'),
    btnUpload: byId('btn-upload'),

    previewArea: byId('preview-area'),
    previewAreaContent: byId('preview-area-content'),
    previewBackgroundCurrent: byId('preview-background-current'),
    previewBackgroundNext: byId('preview-background-next'),
    placeholder: byId('preview-placeholder'),
    placeholderAnim: byId('placeholder-anim'),
    banner: byId('background-banner'),
    bannerTitle: byId('background-banner-title'),
    bannerSubtitle: byId('background-banner-subtitle'),

    dialogueContainer: byId('dialogue-container'),
    dialogueBox: byId('dialogue-box'),
    dialogueTextArea: byId('dialogue-text-area'),
    dialogueText: byId('dialogue-text'),
    dialogueTextN64Canvas: byId('dialogue-text-n64-canvas'),
    spriteCanvas: byId('sprite-canvas'),

    controlsPanel: byId('controls-panel'),
    settingsPanel: byId('settings-panel'),
    backgroundsPanel: byId('backgrounds-panel'),
    backgroundsSections: byId('backgrounds-sections'),
    guidePanel: byId('guide-panel'),
    flipCard: byId('flip-card'),
    sleeveCamera: byId('sleeve-tab-camera'),
    sleeveBackgrounds: byId('sleeve-tab-backgrounds'),
    sleeveGuide: byId('sleeve-tab-guide'),
    sleeveCharacter: byId('sleeve-tab-character'),
    sleeveSettings: byId('sleeve-tab-settings'),

    shortcutVisualizer: byId('shortcut-visualizer'),
    shortcutVisualizerKeys: byId('shortcut-visualizer-keys'),
    shortcutVisualizerAction: byId('shortcut-visualizer-action'),

    inputMirrored: byId('input-mirrored-dialogue'),
    inputN64: byId('input-n64-mode'),
    inputShortcutVisualizer: byId('input-shortcut-visualizer'),
    inputHideBroken: byId('input-hide-broken-chars'),
    inputHideBrokenBackgrounds: byId('input-hide-broken-backgrounds'),
  };
}

module.exports = {
  collectDomRefs,
};
