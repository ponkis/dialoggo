const BG_DRAG_THRESHOLD_PX = 6;

/**
 * Background selection and library management: picking a scene background,
 * favorites/hidden via the context menu, recents, and drag scrolling.
 */
function createBackgroundController({
  refs,
  state,
  catalog,
  gridView,
  previewView,
  collection,
  preferences,
  contextMenu,
  audio,
  notifications,
}) {
  let dragState = null;
  let suppressCardClick = false;

  function render({
    preserveActivePack = true,
    preservePackScroll = true,
  } = {}) {
    const activePackId = preserveActivePack ? gridView.getActivePackId() : null;
    const scrollLeftByPackId = preservePackScroll ? gridView.getPackScrollState() : {};

    contextMenu.hide();
    gridView.build({
      activePackId,
      scrollLeftByPackId,
      onBackgroundSelected: (background) => {
        audio.playMenuSound('click');
        select(background);
      },
      onBackgroundContextMenu: (background, event) => {
        if (!background?.id) return;
        audio.playMenuSound('click');
        contextMenu.show({
          targetId: background.id,
          targetType: 'background',
          isFavorite: collection.isFavorite(background.id),
          isHidden: collection.isHidden(background.id),
          x: event.clientX,
          y: event.clientY,
          onToggleFavorite: () => toggleFavorite(background),
          onToggleHidden: () => toggleHidden(background),
        });
      },
    });

    gridView.updateSelected(state.selectedBackground);
  }

  function notifyLibraryChange(background, {
    leadingText,
    trailingText = '',
  }) {
    if (background.previewImageUrl) {
      notifications.show({
        leadingText,
        trailingText,
        iconSrc: background.previewImageUrl,
        iconAlt: background.displayName,
        iconVariant: 'thumbnail',
      });
      return;
    }

    notifications.show({
      action: [leadingText, background.displayName, trailingText].filter(Boolean).join(' '),
    });
  }

  function toggleFavorite(background) {
    if (!collection.has(background?.id)) return;

    const wasFavorite = collection.toggleFavorite(background.id);
    render();
    audio.playMenuSound(wasFavorite ? 'favoriteRemove' : 'favoriteAdd');
    notifyLibraryChange(background, {
      leadingText: wasFavorite ? 'Removed' : 'Added',
      trailingText: wasFavorite ? 'from favorites' : 'to favorites',
    });
  }

  function toggleHidden(background) {
    if (!collection.has(background?.id)) return;

    const wasHidden = collection.toggleHidden(background.id);
    render();
    audio.playMenuSound('click');
    notifyLibraryChange(background, {
      leadingText: wasHidden ? 'Unhid' : 'Hid',
    });
  }

  function persistSelected() {
    if (state.selectedBackground?.id) {
      preferences.writeString(preferences.keys.selectedBackground, state.selectedBackground.id);
    } else {
      preferences.remove(preferences.keys.selectedBackground);
    }
  }

  function select(background) {
    if (!background?.isAvailable) return;

    if (state.selectedBackground?.id === background.id) {
      state.selectedBackground = null;
      gridView.updateSelected(null);
      previewView.applySelectedBackground(null, true);
      persistSelected();
      audio.playMenuSound('select');
      return;
    }

    state.selectedBackground = background;
    if (collection.moveToRecent(background.id)) render();
    gridView.updateSelected(background);
    previewView.applySelectedBackground(background, true);
    persistSelected();
    audio.playMenuSound('select');
  }

  function restoreSelectedFromPreferences() {
    const saved = preferences.readString(preferences.keys.selectedBackground);
    if (!saved) return;

    const background = catalog.backgrounds.find((item) => item.id === saved && item.isAvailable);
    if (!background) {
      preferences.remove(preferences.keys.selectedBackground);
      return;
    }

    state.selectedBackground = background;
    gridView.updateSelected(background);
    previewView.applySelectedBackground(background);
  }

  function setHideBroken(hideBroken) {
    state.hideBrokenBackgrounds = hideBroken;
    gridView.applyFilters();
  }

  function stopDrag() {
    if (!dragState) return;
    const grid = dragState.grid;
    dragState = null;
    grid?.classList.remove('is-dragging');
  }

  function bindDragEvents() {
    document.addEventListener('pointerdown', (event) => {
      const grid = event.target?.closest?.('.background-pack-grid');
      if (!grid || event.button !== 0) return;
      dragState = {
        grid,
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: grid.scrollLeft,
        moved: false,
      };
      suppressCardClick = false;
    });

    window.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const deltaX = event.clientX - dragState.startX;
      if (!dragState.moved && Math.abs(deltaX) >= BG_DRAG_THRESHOLD_PX) {
        dragState.moved = true;
        suppressCardClick = true;
        dragState.grid.classList.add('is-dragging');
      }
      if (!dragState.moved) return;
      event.preventDefault();
      dragState.grid.scrollLeft = dragState.startScrollLeft - deltaX;
    });

    window.addEventListener('pointerup', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      stopDrag();
      if (suppressCardClick) {
        window.setTimeout(() => {
          suppressCardClick = false;
        }, 0);
      }
    });

    window.addEventListener('pointercancel', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      stopDrag();
      suppressCardClick = false;
    });

    document.addEventListener('click', (event) => {
      if (!suppressCardClick) return;
      const card = event.target?.closest?.('.background-card');
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      suppressCardClick = false;
    }, true);
  }

  function bindScrollEvents() {
    refs.backgroundsSections?.addEventListener('scroll', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.background-pack-grid')) return;
      contextMenu.hide();
    }, true);
  }

  return {
    bindDragEvents,
    bindScrollEvents,
    render,
    restoreSelectedFromPreferences,
    select,
    setHideBroken,
  };
}

module.exports = {
  createBackgroundController,
};
