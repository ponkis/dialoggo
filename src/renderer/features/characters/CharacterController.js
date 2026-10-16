const {
  pick,
} = require('../../core/timing');
const {
  getCharacterPitchSemitoneOffset,
  semitoneOffsetToRate,
} = require('../../domain/speechPlayback');

const REEL_TAP_STEP = 160;
const REEL_DRAG_THRESHOLD_PX = 6;

/**
 * Character selection and library management: picking a character, the
 * favorites/hidden context menu, recents, search, and reel scrolling.
 */
function createCharacterController({
  refs,
  state,
  gridView,
  animator,
  collection,
  preferences,
  contextMenu,
  audio,
  spriteRenderer,
  notifications,
  playback,
}) {
  let reelDragState = null;
  let suppressGridClick = false;

  function render({
    preserveScroll = true,
  } = {}) {
    const charGrid = refs.charGrid;
    const previousScrollLeft = charGrid?.scrollLeft || 0;
    const previousScrollWidth = charGrid?.scrollWidth || 0;

    contextMenu.hide();
    gridView.build({
      onCharacterSelected: (character, wasActive) => {
        select(character);
        if (!wasActive) animator.startSpeakThenIdle(character.id);
      },
      onCharacterContextMenu: (character, event) => {
        if (!character?.id) return;
        audio.playMenuSound('click');
        contextMenu.show({
          targetId: character.id,
          targetType: 'character',
          isFavorite: collection.isFavorite(character.id),
          isHidden: collection.isHidden(character.id),
          x: event.clientX,
          y: event.clientY,
          onToggleFavorite: () => toggleFavorite(character),
          onToggleHidden: () => toggleHidden(character),
        });
      },
      onToggleHiddenCollapsed: toggleHiddenCollapsed,
    });

    if (state.hideBrokenChars) {
      gridView.applyHideBroken(state.hideBrokenChars);
    } else {
      gridView.applyFilters();
    }

    gridView.updateSelected(state.selectedCharacter);

    if (preserveScroll && charGrid) {
      const scrollDiff = charGrid.scrollWidth - previousScrollWidth;
      const targetScrollLeft = Math.max(0, previousScrollLeft + scrollDiff);

      const previousBehavior = charGrid.style.scrollBehavior;
      charGrid.style.scrollBehavior = 'auto';
      charGrid.scrollLeft = targetScrollLeft;
      void charGrid.offsetWidth;
      charGrid.style.scrollBehavior = previousBehavior;
    }

    playback.syncUiState();
  }

  function notifyLibraryChange(character, {
    leadingText,
    trailingText = '',
  }) {
    if (character.previewSpriteUrl) {
      notifications.show({
        leadingText,
        trailingText,
        iconSrc: character.previewSpriteUrl,
        iconAlt: character.displayName,
      });
      return;
    }

    notifications.show({
      action: [leadingText, character.displayName, trailingText].filter(Boolean).join(' '),
    });
  }

  function toggleFavorite(character) {
    if (!collection.has(character?.id)) return;

    const wasFavorite = collection.toggleFavorite(character.id);
    render();
    audio.playMenuSound(wasFavorite ? 'favoriteRemove' : 'favoriteAdd');
    notifyLibraryChange(character, {
      leadingText: wasFavorite ? 'Removed' : 'Added',
      trailingText: wasFavorite ? 'from favorites' : 'to favorites',
    });
  }

  function toggleHidden(character) {
    if (!collection.has(character?.id)) return;

    const wasHidden = collection.toggleHidden(character.id);
    render();
    audio.playMenuSound('click');
    notifyLibraryChange(character, {
      leadingText: wasHidden ? 'Unhid' : 'Hid',
    });
  }

  function toggleHiddenCollapsed() {
    state.hiddenCharactersCollapsed = !state.hiddenCharactersCollapsed;
    preferences.writeString(preferences.keys.hiddenCharactersCollapsed, state.hiddenCharactersCollapsed);
    audio.playMenuSound('click');
    gridView.setHiddenCollapsed(state.hiddenCharactersCollapsed);
  }

  function select(character) {
    if (state.isPlaying) return;
    if (!character?.isAvailable) return;
    if (state.selectedCharacter?.id === character.id) return;

    state.selectedCharacter = character;
    if (collection.moveToRecent(character.id)) render();
    gridView.updateSelected(character);

    spriteRenderer.loadCharacter(character);
    audio.playMenuSound('select');

    if (character.sounds.length > 0) {
      const randomClip = pick(character.sounds);
      const playbackRate = semitoneOffsetToRate(getCharacterPitchSemitoneOffset(character));

      audio.loadAudioBuffer(randomClip)
        .then((buffer) => audio.playAudioBuffer(buffer, {
          playbackRate,
        }))
        .catch(() => { });
    }

    playback.syncUiState();
  }

  function stopReelDrag() {
    if (!reelDragState) return;
    reelDragState = null;
    refs.charGrid.classList.remove('is-dragging');
  }

  function bindReelEvents() {
    refs.reelLeft?.addEventListener('click', () => {
      if (refs.reelLeft.classList.contains('hidden')) return;
      audio.playMenuSound('arrowLeft');
      refs.charGrid.scrollBy({
        left: -REEL_TAP_STEP,
        behavior: 'smooth',
      });
    });

    refs.reelRight?.addEventListener('click', () => {
      if (refs.reelRight.classList.contains('hidden')) return;
      audio.playMenuSound('arrowRight');
      refs.charGrid.scrollBy({
        left: REEL_TAP_STEP,
        behavior: 'smooth',
      });
    });

    refs.charGrid?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      reelDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: refs.charGrid.scrollLeft,
        moved: false,
      };

      suppressGridClick = false;
    });

    window.addEventListener('pointermove', (event) => {
      if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;

      const deltaX = event.clientX - reelDragState.startX;
      if (!reelDragState.moved && Math.abs(deltaX) >= REEL_DRAG_THRESHOLD_PX) {
        reelDragState.moved = true;
        suppressGridClick = true;
        refs.charGrid.classList.add('is-dragging');
      }

      if (!reelDragState.moved) return;

      event.preventDefault();
      refs.charGrid.scrollLeft = reelDragState.startScrollLeft - deltaX;
    });

    window.addEventListener('pointerup', (event) => {
      if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
      stopReelDrag();
      if (suppressGridClick) {
        window.setTimeout(() => {
          suppressGridClick = false;
        }, 0);
      }
    });

    window.addEventListener('pointercancel', (event) => {
      if (!reelDragState || event.pointerId !== reelDragState.pointerId) return;
      stopReelDrag();
      suppressGridClick = false;
    });

    refs.charGrid?.addEventListener('click', (event) => {
      if (!suppressGridClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressGridClick = false;
    }, true);
  }

  function bindScrollEvents() {
    refs.charGrid.addEventListener('scroll', () => {
      contextMenu.hide();
      gridView.updateReelArrows();
    });
  }

  function bindSearchEvents({
    onSearchChanged,
  }) {
    refs.characterSearchInput?.addEventListener('input', () => {
      contextMenu.hide();
      gridView.syncSearchClearButton();
      gridView.applyFilters({
        resetScroll: true,
      });
      onSearchChanged(refs.characterSearchInput);
    });

    refs.characterSearchClear?.addEventListener('click', () => {
      if (!refs.characterSearchInput) return;
      contextMenu.hide();
      refs.characterSearchInput.value = '';
      gridView.syncSearchClearButton();
      gridView.applyFilters({
        resetScroll: true,
      });
      refs.characterSearchInput.focus();
      onSearchChanged(refs.characterSearchInput);
    });
  }

  function setHideBroken(hideBroken) {
    state.hideBrokenChars = hideBroken;
    gridView.applyHideBroken(hideBroken);
  }

  return {
    bindReelEvents,
    bindScrollEvents,
    bindSearchEvents,
    render,
    select,
    setHideBroken,
    toggleHiddenCollapsed,
  };
}

module.exports = {
  createCharacterController,
};
