const {
  CONSTANTS,
} = require('../config/constants');
const {
  getDialoggoBridge,
} = require('../core/bridge');
const {
  collectDomRefs,
} = require('../core/domRefs');
const {
  APP_EVENTS,
  createEventBus,
} = require('../core/EventBus');
const {
  createAudioService,
} = require('../services/AudioService');
const {
  createImageCache,
} = require('../services/ImageCache');
const {
  SpeechSoundLoop,
} = require('../services/SpeechSoundLoop');
const {
  createAppState,
} = require('../state/createAppState');
const {
  createCollectionStore,
} = require('../state/createCollectionStore');
const {
  createPreferencesStore,
} = require('../state/PreferencesStore');
const {
  createBackgroundController,
} = require('../features/backgrounds/BackgroundController');
const {
  createBackgroundGridView,
} = require('../features/backgrounds/BackgroundGridView');
const {
  createCharacterCardAnimator,
} = require('../features/characters/CharacterCardAnimator');
const {
  createCharacterController,
} = require('../features/characters/CharacterController');
const {
  createCharacterGridView,
} = require('../features/characters/CharacterGridView');
const {
  createAppChromeController,
} = require('../features/chrome/AppChromeController');
const {
  createContextMenuView,
} = require('../features/contextMenu/ContextMenuView');
const {
  createAppDialogView,
} = require('../features/dialog/AppDialogView');
const {
  createDialogueBoxView,
} = require('../features/dialogue/DialogueBoxView');
const {
  createDialogueInputController,
} = require('../features/dialogue/DialogueInputController');
const {
  createDialogueInputView,
} = require('../features/dialogue/DialogueInputView');
const {
  createDialogueLayout,
} = require('../features/dialogue/DialogueLayout');
const {
  createN64TextRenderer,
} = require('../features/dialogue/N64TextRenderer');
const {
  initializeGuideImageViewer,
} = require('../features/guide/GuideImageViewer');
const {
  createPanelController,
} = require('../features/panels/PanelController');
const {
  createPanelView,
} = require('../features/panels/PanelView');
const {
  createPlaybackController,
} = require('../features/playback/PlaybackController');
const {
  createPlaybackControlsView,
} = require('../features/playback/PlaybackControlsView');
const {
  createSettingsController,
} = require('../features/settings/SettingsController');
const {
  createShortcutController,
} = require('../features/shortcuts/ShortcutController');
const {
  createShortcutVisualizerView,
} = require('../features/shortcuts/ShortcutVisualizerView');
const {
  createPreviewView,
} = require('../features/stage/PreviewView');
const {
  SpriteRenderer,
} = require('../features/stage/SpriteRenderer');
const {
  createStartupSequence,
} = require('../features/startup/StartupSequence');
const {
  createUpdateController,
} = require('../features/updates/UpdateController');

/**
 * Composition root for the renderer. It loads the app info and asset catalog
 * from the main process, builds every service, view, and controller with its
 * explicit dependencies, binds events, and restores the saved session.
 */
async function startApp() {
  const bridge = getDialoggoBridge();
  const [appInfo, catalog] = await Promise.all([
    bridge.app.getInfo(),
    bridge.catalog.load(),
  ]);

  const log = bridge.log;
  const constants = CONSTANTS;
  const refs = collectDomRefs(document);
  const state = createAppState();
  const preferences = createPreferencesStore();
  const events = createEventBus();
  const charactersById = new Map(catalog.characters.map((character) => [character.id, character]));
  const backgroundsById = new Map(catalog.backgrounds.map((background) => [background.id, background]));

  // Services
  const audio = createAudioService({
    uiSounds: catalog.ui.sounds,
  });
  const images = createImageCache();

  // Collections persisted to preferences
  const characterCollection = createCollectionStore({
    state,
    preferences,
    validIds: charactersById,
    recentLimit: constants.MAX_RECENT_CHARACTERS,
    fields: {
      favorites: 'favoriteCharacterIds',
      recent: 'recentCharacterIds',
      hidden: 'hiddenCharacterIds',
    },
    storageKeys: {
      favorites: preferences.keys.favoriteCharacters,
      recent: preferences.keys.recentCharacters,
      hidden: preferences.keys.hiddenCharacters,
    },
  });
  const backgroundCollection = createCollectionStore({
    state,
    preferences,
    validIds: backgroundsById,
    recentLimit: constants.MAX_RECENT_BACKGROUNDS,
    fields: {
      favorites: 'favoriteBackgroundIds',
      recent: 'recentBackgroundIds',
      hidden: 'hiddenBackgroundIds',
    },
    storageKeys: {
      favorites: preferences.keys.favoriteBackgrounds,
      recent: preferences.keys.recentBackgrounds,
      hidden: preferences.keys.hiddenBackgrounds,
    },
  });

  // Views
  const n64Text = createN64TextRenderer({
    refs,
    state,
    constants,
    log,
  });
  n64Text.observeResize();

  const contextMenu = createContextMenuView({
    state,
  });
  const visualizerView = createShortcutVisualizerView({
    refs,
  });
  const spriteRenderer = new SpriteRenderer({
    canvas: refs.spriteCanvas,
    state,
    constants,
    images,
  });
  const dialogueBox = createDialogueBoxView({
    refs,
    state,
    n64Text,
  });
  const dialogueLayout = createDialogueLayout({
    refs,
    constants,
  });
  const inputView = createDialogueInputView({
    refs,
    constants,
  });
  const animator = createCharacterCardAnimator();
  const characterGrid = createCharacterGridView({
    refs,
    state,
    catalog,
    animator,
  });
  const backgroundGrid = createBackgroundGridView({
    refs,
    state,
    catalog,
    audio,
  });
  const previewView = createPreviewView({
    refs,
    state,
    constants,
    loadingFrames: catalog.ui.loadingFrames,
  });
  const panelView = createPanelView({
    refs,
    state,
    constants,
    catalog,
    previewView,
  });
  const controlsView = createPlaybackControlsView({
    refs,
    state,
  });
  const appDialog = createAppDialogView({
    state,
  });
  const startup = createStartupSequence({
    refs,
    constants,
    ui: catalog.ui,
    audio,
    images,
    log,
  });

  // Controllers
  const speechLoop = new SpeechSoundLoop({
    audioService: audio,
    spriteRenderer,
  });
  const playback = createPlaybackController({
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
    genericSounds: catalog.genericSounds,
    log,
  });
  const shortcuts = createShortcutController({
    refs,
    state,
    visualizerView,
    playback,
    characterGrid,
    contextMenu,
  });
  const notifications = {
    show: shortcuts.showTransientAlert,
  };
  const characters = createCharacterController({
    refs,
    state,
    gridView: characterGrid,
    animator,
    collection: characterCollection,
    preferences,
    contextMenu,
    audio,
    spriteRenderer,
    notifications,
    playback,
  });
  const backgrounds = createBackgroundController({
    refs,
    state,
    catalog,
    gridView: backgroundGrid,
    previewView,
    collection: backgroundCollection,
    preferences,
    contextMenu,
    audio,
    notifications,
  });
  const panels = createPanelController({
    refs,
    state,
    panelView,
    previewView,
    contextMenu,
    audio,
    shortcuts,
  });
  const settings = createSettingsController({
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
  });
  const dialogueInput = createDialogueInputController({
    refs,
    inputView,
    onInputChanged: () => playback.syncUiState(),
  });
  const updates = createUpdateController({
    refs,
    appInfo,
    bridge,
    preferences,
    dialog: appDialog,
    audio,
    startup,
  });
  const chrome = createAppChromeController({
    refs,
    appInfo,
    bridge,
    audio,
    startup,
  });

  events.on(APP_EVENTS.playbackUiSynced, () => shortcuts.syncOverlay());

  // Initial view state
  chrome.renderBranding();
  initializeGuideImageViewer(refs.guidePanel);
  panelView.initialize();
  previewView.applySelectedBackground(state.selectedBackground);
  window.addEventListener('resize', inputView.syncHighlight);
  window.addEventListener('resize', backgroundGrid.syncPackVerticalAlignment);
  inputView.syncHighlightMetrics();
  previewView.syncPlaceholderState();
  visualizerView.sync();

  // Event bindings (registration order matters for shared capture listeners)
  chrome.bindEvents();
  dialogueInput.bindEvents();
  playback.bindEvents();
  shortcuts.bindEvents();

  window.addEventListener('blur', () => {
    playback.resetFastForwardState();
    shortcuts.resetVisualizerState();
    contextMenu.hide();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!contextMenu.isVisible()) return;
    if (contextMenu.containsTarget(event.target)) return;
    contextMenu.hide();
  }, true);

  characters.bindReelEvents();
  backgrounds.bindDragEvents();
  characters.bindScrollEvents();
  backgrounds.bindScrollEvents();
  characters.bindSearchEvents({
    onSearchChanged: (target) => shortcuts.syncOverlay(target),
  });
  panels.bindEvents();
  settings.bindEvents();
  updates.bindEvents();

  // Restore the saved session
  inputView.normalize();
  characterGrid.syncSearchClearButton();
  characterCollection.load();
  backgroundCollection.load();
  settings.restoreHiddenCharactersCollapsed();
  characters.render({
    preserveScroll: false,
  });
  backgrounds.render({
    preserveActivePack: false,
    preservePackScroll: false,
  });
  requestAnimationFrame(characterGrid.updateReelArrows);
  settings.restoreShortcutVisualizer();
  playback.syncUiState();
  settings.restoreN64Mode();
  backgrounds.restoreSelectedFromPreferences();
  settings.restoreMirrored();
  settings.restoreHideBrokenCharacters();
  settings.restoreHideBrokenBackgrounds();
  updates.initialize();

  void startup.run().then(() => updates.runStartupTasks());

  const summary = {
    ok: true,
    version: appInfo.appVersion,
    environment: appInfo.environment,
    characters: catalog.characters.length,
    backgrounds: catalog.backgrounds.length,
    genericSounds: catalog.genericSounds.length,
  };

  log.info('Renderer started', summary);
  bridge.app.notifyReady(summary);
  console.log(`[Dialoggo] v${appInfo.appVersion} - ${summary.characters} characters, ${summary.backgrounds} backgrounds, ${summary.genericSounds} generic sounds`);
}

module.exports = {
  startApp,
};
