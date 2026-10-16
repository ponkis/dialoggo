const {
  createFavoriteHeartIcon,
} = require('../../ui/icons');

const BG_SCROLL_STEP = 180;
const CUSTOM_PACK_ID = 'custom';

function isCustomPackId(packId) {
  return String(packId || '').toLowerCase() === CUSTOM_PACK_ID;
}

function hashString(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Deterministic per-card tilt so the "photo" layout is stable between renders.
function computeBackgroundCardRotation(background, index) {
  const hash = hashString(`${background?.id || ''}:${background?.packId || ''}:${index}`);
  const normalized = ((Math.abs(hash) % 1000) / 1000);
  const rotation = (normalized * 8) - 4;
  return `${rotation.toFixed(2)}deg`;
}

function attachBackgroundCardInteractions(button, onActivate) {
  let clickTimer = 0;

  const clearPressedState = () => {
    button.classList.remove('is-pressing');
  };

  const replayClickAnimation = () => {
    window.clearTimeout(clickTimer);
    button.classList.remove('is-clicked');
    void button.offsetWidth;
    button.classList.add('is-clicked');
    clickTimer = window.setTimeout(() => {
      button.classList.remove('is-clicked');
    }, 420);
  };

  button.addEventListener('pointerdown', (event) => {
    if (button.disabled || event.button !== 0) return;
    button.classList.add('is-pressing');
  });

  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((eventName) => {
    button.addEventListener(eventName, clearPressedState);
  });

  button.addEventListener('click', () => {
    if (button.disabled) return;
    clearPressedState();
    replayClickAnimation();
    onActivate();
  });
}

/**
 * The backgrounds sleeve: one pack shown at a time with pack navigation,
 * scrollable "photo" cards, and the Hidden/Favorites/Recent special packs.
 */
function createBackgroundGridView({
  refs,
  state,
  catalog,
  audio,
}) {
  const {
    backgrounds,
    backgroundPacks,
  } = catalog;
  let packSections = [];
  let activePackIndex = 0;

  function getSectionIndexById(packId) {
    return packSections.findIndex((section) => section.dataset.packId === packId);
  }

  function getActivePackId() {
    return packSections[activePackIndex]?.dataset.packId || null;
  }

  function getVisiblePackIndices() {
    return packSections
      .map((_section, i) => i)
      .filter((i) => !packSections[i].classList.contains('pack-hidden'));
  }

  function updatePackNavArrows() {
    const visibleIndices = getVisiblePackIndices();
    const currentPos = visibleIndices.indexOf(activePackIndex);
    const isFirst = currentPos <= 0;
    const isLast = currentPos >= visibleIndices.length - 1;

    packSections.forEach((section) => {
      const prev = section.querySelector('.pack-nav-prev');
      const next = section.querySelector('.pack-nav-next');
      if (prev) prev.classList.toggle('hidden', isFirst);
      if (next) next.classList.toggle('hidden', isLast);
    });
  }

  function syncPackVerticalAlignment() {
    const isCompactLayout = window.matchMedia('(max-width: 720px)').matches;

    packSections.forEach((section) => {
      const packTop = section.querySelector('.background-pack-top');
      const packGrid = section.querySelector('.background-pack-grid');
      if (!packTop || !packGrid) return;

      const gridStyle = window.getComputedStyle(packGrid);
      const paddingTop = Number.parseFloat(gridStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(gridStyle.paddingBottom) || 0;
      const visualPaddingOffset = (paddingBottom - paddingTop) / 2;
      const offset = isCompactLayout ?
        0 :
        (-(packTop.getBoundingClientRect().height / 2) + visualPaddingOffset);

      packGrid.style.setProperty('--background-pack-grid-offset', `${offset}px`);
      const gridWrapper = packGrid.closest('.background-pack-grid-wrapper');
      if (gridWrapper) gridWrapper.style.setProperty('--background-pack-grid-offset', `${offset}px`);
    });
  }

  function refreshActivePackLayout() {
    requestAnimationFrame(() => {
      syncPackVerticalAlignment();
      const activeSection = packSections[activePackIndex];
      if (activeSection) {
        const grid = activeSection.querySelector('.background-pack-grid');
        if (grid) grid.dispatchEvent(new Event('scroll'));
      }
    });
  }

  function showPack(index) {
    if (!packSections.length) {
      activePackIndex = 0;
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, packSections.length - 1));
    packSections.forEach((section, i) => {
      section.classList.toggle('pack-active', i === safeIndex);
    });
    activePackIndex = safeIndex;
    updatePackNavArrows();
    refreshActivePackLayout();
  }

  function navigatePack(direction) {
    const visibleIndices = getVisiblePackIndices();
    if (visibleIndices.length === 0) return;

    const currentPos = visibleIndices.indexOf(activePackIndex);
    const nextPos = currentPos + direction;

    if (nextPos >= 0 && nextPos < visibleIndices.length) {
      audio.playMenuSound('click');
      showPack(visibleIndices[nextPos]);
    }
  }

  function applyFilters() {
    document.querySelectorAll('.background-card.unavailable').forEach((button) => {
      button.classList.toggle('hidden-broken', state.hideBrokenBackgrounds);
    });

    document.querySelectorAll('.background-pack-section').forEach((section) => {
      const hasVisibleButtons = Array.from(section.querySelectorAll('.background-card, .background-pack-anchor')).some((button) => (
        !button.classList.contains('hidden-broken')
      ));
      section.classList.toggle('pack-hidden', !hasVisibleButtons);
    });

    const visibleIndices = getVisiblePackIndices();
    if (visibleIndices.length > 0 && !visibleIndices.includes(activePackIndex)) {
      showPack(visibleIndices[0]);
    } else {
      updatePackNavArrows();
    }
  }

  function getPackScrollState() {
    const scrollLeftByPackId = {};

    packSections.forEach((section) => {
      const packId = section.dataset.packId;
      const grid = section.querySelector('.background-pack-grid');
      if (!packId || !grid) return;
      scrollLeftByPackId[packId] = grid.scrollLeft;
    });

    return scrollLeftByPackId;
  }

  function restorePackState({
    activePackId = null,
    scrollLeftByPackId = {},
  } = {}) {
    const visibleIndices = getVisiblePackIndices();
    let targetIndex = getSectionIndexById(activePackId);

    if (targetIndex < 0 || !visibleIndices.includes(targetIndex)) {
      targetIndex = visibleIndices[0] ?? 0;
    }

    showPack(targetIndex);

    requestAnimationFrame(() => {
      packSections.forEach((section) => {
        const packId = section.dataset.packId;
        const grid = section.querySelector('.background-pack-grid');
        if (!packId || !grid) return;

        const nextScrollLeft = Number(scrollLeftByPackId?.[packId]);
        if (Number.isFinite(nextScrollLeft)) {
          const previousBehavior = grid.style.scrollBehavior;
          grid.style.scrollBehavior = 'auto';
          grid.scrollLeft = Math.max(0, nextScrollLeft);
          void grid.offsetWidth;
          grid.style.scrollBehavior = previousBehavior;
        }

        grid.dispatchEvent(new Event('scroll'));
      });
    });
  }

  function updateSelected(background) {
    const selectedBackgroundId = background?.id || null;
    document.querySelectorAll('.background-card').forEach((button) => {
      button.classList.toggle('active', Boolean(selectedBackgroundId) && button.dataset.id === selectedBackgroundId);
    });
  }

  function collectOrderedPacks() {
    const backgroundsByPack = new Map();
    const backgroundsById = new Map(backgrounds.map((background) => [background.id, background]));
    const hiddenBackgroundIdsSet = new Set(state.hiddenBackgroundIds || []);

    backgrounds.forEach((background) => {
      if (hiddenBackgroundIdsSet.has(background.id)) return;
      if (!backgroundsByPack.has(background.packId)) {
        backgroundsByPack.set(background.packId, {
          id: background.packId,
          displayName: background.packDisplayName,
          backgrounds: [],
        });
      }

      backgroundsByPack.get(background.packId).backgrounds.push(background);
    });

    const buildSpecialPack = (id, displayName, backgroundIds) => {
      const packBackgrounds = backgroundIds
        .map((backgroundId) => backgroundsById.get(backgroundId))
        .filter((background) => Boolean(background));

      if (packBackgrounds.length === 0) return null;

      return {
        id,
        displayName,
        backgrounds: packBackgrounds,
      };
    };

    const specialPacks = [
      buildSpecialPack('__hidden__', 'Hidden', state.hiddenBackgroundIds || []),
      buildSpecialPack('__favorites__', 'Favorites', (state.favoriteBackgroundIds || []).filter((id) => !hiddenBackgroundIdsSet.has(id))),
      buildSpecialPack('__recent__', 'Recent', (state.recentBackgroundIds || []).filter((id) => !hiddenBackgroundIdsSet.has(id))),
    ].filter((pack) => Boolean(pack));

    const regularPacks = Array.isArray(backgroundPacks) && backgroundPacks.length > 0 ?
      backgroundPacks
        .map((pack) => ({
          id: pack.id,
          displayName: pack.displayName,
          backgrounds: backgroundsByPack.get(pack.id)?.backgrounds || [],
        }))
        .filter((pack) => pack.backgrounds.length > 0 || isCustomPackId(pack.id)) :
      Array.from(backgroundsByPack.values());

    return {
      orderedPacks: [...specialPacks, ...regularPacks],
      favoriteBackgroundIds: new Set((state.favoriteBackgroundIds || []).filter((id) => !hiddenBackgroundIdsSet.has(id))),
    };
  }

  function formatPackCount(pack) {
    return `${pack.backgrounds.length} background${pack.backgrounds.length === 1 ? '' : 's'}`;
  }

  function createScrollArrow(direction, initiallyHidden) {
    const arrow = document.createElement('div');
    arrow.className = `bg-scroll-arrow bg-scroll-arrow-${direction}${initiallyHidden ? ' hidden' : ''}`;
    const hit = document.createElement('button');
    hit.className = 'bg-scroll-arrow-hit';
    hit.type = 'button';
    hit.title = direction === 'left' ? 'Scroll left' : 'Scroll right';
    hit.innerHTML = direction === 'left' ?
      '<svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>' :
      '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
    arrow.appendChild(hit);
    return {
      arrow,
      hit,
    };
  }

  function createPackNavArrow(className, title, pathData, direction) {
    const arrow = document.createElement('button');
    arrow.className = `background-pack-nav-arrow ${className}`;
    arrow.type = 'button';
    arrow.title = title;
    arrow.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="${pathData}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    arrow.addEventListener('click', () => navigatePack(direction));
    return arrow;
  }

  function createPackSection(pack, {
    isActive,
    scrollLeftByPackId,
  }) {
    const packSection = document.createElement('section');
    packSection.className = `background-pack-section${isActive ? ' pack-active' : ''}`;
    packSection.dataset.packId = pack.id;

    const packTop = document.createElement('div');
    packTop.className = 'background-pack-top';

    const packHeader = document.createElement('div');
    packHeader.className = 'background-pack-header';

    const headerInfo = document.createElement('div');
    headerInfo.className = 'background-pack-header-info';

    const packHeading = document.createElement('span');
    packHeading.className = 'background-pack-heading';
    packHeading.textContent = pack.displayName;

    const packCount = document.createElement('span');
    packCount.className = 'background-pack-count';
    packCount.textContent = formatPackCount(pack);

    const packDivider = document.createElement('span');
    packDivider.className = 'background-pack-divider';
    packDivider.setAttribute('aria-hidden', 'true');

    headerInfo.appendChild(packHeading);
    headerInfo.appendChild(packCount);
    packHeader.appendChild(createPackNavArrow('pack-nav-prev', 'Previous pack', 'M15 19l-7-7 7-7', -1));
    packHeader.appendChild(headerInfo);
    packHeader.appendChild(createPackNavArrow('pack-nav-next', 'Next pack', 'M9 5l7 7-7 7', 1));
    packTop.appendChild(packHeader);
    packTop.appendChild(packDivider);
    packSection.appendChild(packTop);

    const packGrid = document.createElement('div');
    packGrid.className = 'background-pack-grid';

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'background-pack-grid-wrapper';

    const initialScrollLeft = Number(scrollLeftByPackId?.[pack.id]) || 0;
    const left = createScrollArrow('left', initialScrollLeft <= 2);
    const right = createScrollArrow('right', true);

    const updateScrollArrows = () => {
      const atStart = packGrid.scrollLeft <= 2;
      const atEnd = packGrid.scrollLeft + packGrid.clientWidth >= packGrid.scrollWidth - 2;
      left.arrow.classList.toggle('hidden', atStart);
      right.arrow.classList.toggle('hidden', atEnd);
    };

    packGrid.updateBgScrollArrows = updateScrollArrows;
    packGrid.addEventListener('scroll', updateScrollArrows);
    requestAnimationFrame(updateScrollArrows);

    left.hit.addEventListener('click', () => {
      if (left.arrow.classList.contains('hidden')) return;
      audio.playMenuSound('arrowLeft');
      packGrid.scrollBy({ left: -BG_SCROLL_STEP, behavior: 'smooth' });
    });
    right.hit.addEventListener('click', () => {
      if (right.arrow.classList.contains('hidden')) return;
      audio.playMenuSound('arrowRight');
      packGrid.scrollBy({ left: BG_SCROLL_STEP, behavior: 'smooth' });
    });

    gridWrapper.appendChild(packGrid);
    packSection.appendChild(gridWrapper);
    packSection.appendChild(left.arrow);
    packSection.appendChild(right.arrow);

    return packSection;
  }

  function syncUploadButton(packGrid, pack, isCustomPack) {
    if (!isCustomPack) {
      packGrid.querySelector('.bg-upload-btn')?.remove();
      return;
    }

    let uploadButton = packGrid.querySelector('.bg-upload-btn');
    if (!uploadButton) {
      uploadButton = document.createElement('button');
      uploadButton.className = 'bg-upload-btn background-pack-anchor';
      uploadButton.dataset.packId = pack.id;
      uploadButton.type = 'button';
      uploadButton.title = 'Upload background';
      uploadButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
            <path d="M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
          </svg>`;
      attachBackgroundCardInteractions(uploadButton, () => {
        audio.playMenuSound('click');
      });
    }
    packGrid.appendChild(uploadButton);
  }

  function createBackgroundCard(background, pack, isCustomPack, {
    onBackgroundSelected,
    onBackgroundContextMenu,
  }) {
    const button = document.createElement('button');
    button.className = 'background-card';
    button.dataset.id = background.id;
    button.dataset.packId = pack.id;
    button.type = 'button';

    const photo = document.createElement('div');
    photo.className = 'background-card-photo';

    const image = document.createElement('img');
    image.className = 'background-card-image';
    image.alt = background.displayName;
    image.loading = 'lazy';
    if (background.previewImageUrl) image.src = background.previewImageUrl;
    photo.appendChild(image);

    const copy = document.createElement('div');
    copy.className = 'background-card-copy';

    const title = document.createElement('span');
    title.className = 'background-card-title';

    const meta = document.createElement('span');
    meta.className = 'background-card-meta';

    copy.appendChild(title);
    if (!isCustomPack) copy.appendChild(meta);
    button.appendChild(photo);
    button.appendChild(copy);

    attachBackgroundCardInteractions(button, () => {
      const wasActive = state.selectedBackground?.id === background.id;
      onBackgroundSelected?.(background, wasActive);
    });
    button.addEventListener('contextmenu', (event) => {
      if (button.disabled) return;
      event.preventDefault();
      onBackgroundContextMenu?.(background, event);
    });

    return button;
  }

  function syncBackgroundCard(button, background, pack, index, isFavorite) {
    button.title = background.displayName;
    button.disabled = !background.isAvailable;
    button.classList.toggle('unavailable', !background.isAvailable);
    button.classList.toggle('background-card-featured', index === 0 && pack.backgrounds.length > 2);
    button.classList.toggle('background-card-fallback', !background.hasBuiltImage);
    button.style.setProperty('--card-rotation', computeBackgroundCardRotation(background, index));

    const photo = button.querySelector('.background-card-photo');
    const title = button.querySelector('.background-card-title');
    const meta = button.querySelector('.background-card-meta');

    if (title) title.textContent = background.displayName;
    if (meta) meta.textContent = background.packDisplayName;

    const existingHeart = photo.querySelector('.background-card-favorite-heart');
    if (isFavorite && !existingHeart) {
      photo.appendChild(createFavoriteHeartIcon('background-card-favorite-heart'));
    } else if (!isFavorite && existingHeart) {
      existingHeart.remove();
    }

    const tapeHash = hashString(`tape:${background?.id || ''}:${index}`);
    const tapeChance = (Math.abs(tapeHash) % 1000) / 1000;
    const existingTape = button.querySelector('.background-card-tape');

    if (tapeChance < 0.45) {
      let tape = existingTape;
      if (!tape) {
        tape = document.createElement('div');
        tape.className = 'background-card-tape';
        button.appendChild(tape);
      }
      const tapeLeftPercent = 20 + ((Math.abs(tapeHash >> 3) % 400) / 10);
      const tapeRotation = ((Math.abs(tapeHash >> 7) % 300) / 10) - 15;
      const tapeWidth = 32 + ((Math.abs(tapeHash >> 11) % 160) / 10);
      tape.style.left = `${tapeLeftPercent}%`;
      tape.style.transform = `translateX(-50%) rotate(${tapeRotation.toFixed(1)}deg)`;
      tape.style.width = `${tapeWidth.toFixed(0)}px`;
    } else if (existingTape) {
      existingTape.remove();
    }
  }

  function restoreGridScrollPositions(scrollLeftByPackId) {
    packSections.forEach((section) => {
      const packId = section.dataset.packId;
      const scrollLeft = Number(scrollLeftByPackId?.[packId]);
      const grid = section.querySelector('.background-pack-grid');
      if (!grid) return;

      const hasSavedScroll = Number.isFinite(scrollLeft) && scrollLeft > 0;
      if (hasSavedScroll) {
        const previousBehavior = grid.style.scrollBehavior;
        grid.style.scrollBehavior = 'auto';
        grid.scrollLeft = scrollLeft;
        grid.style.scrollBehavior = previousBehavior;
      }

      // Force layout so scrollWidth/clientWidth are accurate for the arrows.
      void grid.offsetWidth;

      if (typeof grid.updateBgScrollArrows === 'function') {
        grid.updateBgScrollArrows();
      }
    });
  }

  /**
   * Rebuilds the sleeve, reusing sections and cards where possible so the
   * active pack and each pack's scroll position can be carried across.
   */
  function build({
    onBackgroundSelected = null,
    onBackgroundContextMenu = null,
    activePackId = null,
    scrollLeftByPackId = {},
  } = {}) {
    if (!refs.backgroundsSections) return;

    const existingSections = new Map();
    refs.backgroundsSections.querySelectorAll('.background-pack-section').forEach((section) => {
      const packId = section.dataset.packId;
      if (packId) existingSections.set(packId, section);
    });

    packSections = [];
    activePackIndex = -1;
    const fragment = document.createDocumentFragment();
    const {
      orderedPacks,
      favoriteBackgroundIds,
    } = collectOrderedPacks();

    orderedPacks.forEach((pack, packIdx) => {
      const isCustomPack = isCustomPackId(pack.id);
      const isActive = activePackId !== null ? pack.id === activePackId : packIdx === 0;
      if (isActive) activePackIndex = packIdx;

      let packSection = existingSections.get(pack.id);
      const existingButtons = new Map();

      if (packSection) {
        packSection.className = `background-pack-section${isActive ? ' pack-active' : ''}`;
        packSection.querySelector('.background-pack-heading').textContent = pack.displayName;
        packSection.querySelector('.background-pack-count').textContent = formatPackCount(pack);
        packSection.querySelectorAll('.background-pack-grid .background-card').forEach((button) => {
          if (button.dataset.id) existingButtons.set(button.dataset.id, button);
        });
      } else {
        packSection = createPackSection(pack, {
          isActive,
          scrollLeftByPackId,
        });
      }

      const packGrid = packSection.querySelector('.background-pack-grid');
      syncUploadButton(packGrid, pack, isCustomPack);

      pack.backgrounds.forEach((background, index) => {
        let button = existingButtons.get(background.id);
        if (!button) {
          button = createBackgroundCard(background, pack, isCustomPack, {
            onBackgroundSelected,
            onBackgroundContextMenu,
          });
        }

        syncBackgroundCard(button, background, pack, index, favoriteBackgroundIds.has(background.id));
        packGrid.appendChild(button);
        existingButtons.delete(background.id);
      });

      existingButtons.forEach((button) => button.remove());

      fragment.appendChild(packSection);
      packSections.push(packSection);
    });

    refs.backgroundsSections.innerHTML = '';
    refs.backgroundsSections.appendChild(fragment);

    restoreGridScrollPositions(scrollLeftByPackId);

    if (activePackIndex < 0 && packSections.length > 0) {
      activePackIndex = 0;
      packSections[0].classList.add('pack-active');
    }

    updatePackNavArrows();
    updateSelected(state.selectedBackground);
    applyFilters();
    refreshActivePackLayout();
  }

  return {
    applyFilters,
    build,
    getActivePackId,
    getPackScrollState,
    restorePackState,
    syncPackVerticalAlignment,
    updateSelected,
  };
}

module.exports = {
  createBackgroundGridView,
};
