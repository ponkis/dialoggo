const {
  normalizeSearchText,
} = require('../../domain/search');
const {
  createFavoriteHeartIcon,
} = require('../../ui/icons');

const HIDDEN_PACK_ID = '__hidden__';
const FAVORITES_PACK_ID = '__favorites__';
const RECENT_PACK_ID = '__recent__';

/**
 * The horizontally scrolling character "film reel": pack sections, character
 * cards, search filtering, and the Hidden/Favorites/Recent special packs.
 */
function createCharacterGridView({
  refs,
  state,
  catalog,
  animator,
}) {
  const {
    characters,
    packs,
  } = catalog;
  const charactersById = new Map(characters.map((character) => [character.id, character]));

  function updateReelArrows() {
    const atStart = refs.charGrid.scrollLeft <= 2;
    const atEnd = refs.charGrid.scrollLeft + refs.charGrid.clientWidth >= refs.charGrid.scrollWidth - 2;
    refs.reelLeft.classList.toggle('hidden', atStart);
    refs.reelRight.classList.toggle('hidden', atEnd);
  }

  function syncSearchClearButton() {
    if (!refs.characterSearchClear || !refs.characterSearchInput) return;
    refs.characterSearchClear.hidden = refs.characterSearchInput.value.length === 0;
  }

  function hasSearchQuery() {
    return Boolean(refs.characterSearchInput) && refs.characterSearchInput.value.length > 0;
  }

  function clearSearchQuery() {
    if (!refs.characterSearchInput || refs.characterSearchInput.value.length === 0) return false;
    refs.characterSearchInput.value = '';
    return true;
  }

  function applyFilters({
    resetScroll = false,
  } = {}) {
    const query = normalizeSearchText(refs.characterSearchInput?.value);
    let visibleCount = 0;

    document.querySelectorAll('.char-btn').forEach((button) => {
      const searchIndex = button.dataset.searchIndex || '';
      const isHiddenChar = button.dataset.hidden === 'true';
      const matchesSearch = !query || (!isHiddenChar && searchIndex.includes(query));

      button.classList.toggle('search-hidden', !matchesSearch);
      const visible = matchesSearch && !button.classList.contains('hidden-broken');
      if (visible) visibleCount += 1;
    });

    document.querySelectorAll('.character-pack-section').forEach((section) => {
      const hasVisibleButtons = Array.from(section.querySelectorAll('.char-btn')).some((button) => (
        !button.classList.contains('search-hidden') && !button.classList.contains('hidden-broken')
      ));
      section.classList.toggle('pack-hidden', !hasVisibleButtons);
      section.classList.remove('first-visible-pack');
    });

    const firstVisiblePack = document.querySelector('.character-pack-section:not(.pack-hidden)');
    firstVisiblePack?.classList.add('first-visible-pack');

    refs.characterSearchEmpty?.classList.toggle('visible', visibleCount === 0);

    if (refs.charGrid) {
      if (visibleCount > 0) {
        refs.charGrid.style.minHeight = '';
        requestAnimationFrame(() => {
          const height = Math.ceil(refs.charGrid.getBoundingClientRect().height);
          if (height > 0) refs.charGrid.dataset.emptyHeight = String(height);
        });
      } else {
        const storedHeight = Number(refs.charGrid.dataset.emptyHeight || 0);
        refs.charGrid.style.minHeight = storedHeight > 0 ? `${storedHeight}px` : '';
      }
    }

    if (resetScroll && refs.charGrid) {
      refs.charGrid.scrollLeft = 0;
    }

    requestAnimationFrame(updateReelArrows);
  }

  function applyHideBroken(hideBroken) {
    document.querySelectorAll('.char-btn.unavailable').forEach((button) => {
      button.classList.toggle('hidden-broken', hideBroken);
    });
    applyFilters();
  }

  function syncButtonAvailability(interactionLocked) {
    document.querySelectorAll('.char-btn').forEach((button) => {
      const character = charactersById.get(button.dataset.id);
      button.disabled = interactionLocked || !(character && character.isAvailable);
    });
  }

  function setHiddenCollapsed(collapsed) {
    if (!refs.charGrid) return;
    const section = refs.charGrid.querySelector(`.character-pack-section[data-pack-id="${HIDDEN_PACK_ID}"]`);
    if (!section) return;
    section.classList.toggle('is-collapsed', Boolean(collapsed));
    requestAnimationFrame(updateReelArrows);
  }

  function updateSelected(character) {
    document.querySelectorAll('.char-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.id === character?.id);
      const buttonCardKey = button.dataset.cardKey;
      if (!buttonCardKey) return;

      const buttonCharacterId = button.dataset.id;
      if (!buttonCharacterId) return;
      if (!animator.hasCard(buttonCardKey)) return;

      if (buttonCharacterId === character?.id) {
        animator.startIdle(buttonCardKey);
        return;
      }

      animator.stop(buttonCardKey);
      animator.restorePreviewImage(buttonCardKey);
    });
  }

  function collectOrderedPacks() {
    const charactersByPack = new Map();
    const hiddenCharacterIdsSet = new Set(state.hiddenCharacterIds || []);

    characters.forEach((character) => {
      if (hiddenCharacterIdsSet.has(character.id)) return;
      if (!charactersByPack.has(character.packId)) {
        charactersByPack.set(character.packId, {
          id: character.packId,
          displayName: character.packDisplayName,
          characters: [],
        });
      }

      charactersByPack.get(character.packId).characters.push(character);
    });

    const buildSpecialPack = (id, displayName, characterIds) => {
      const packCharacters = characterIds
        .map((characterId) => charactersById.get(characterId))
        .filter((character) => Boolean(character));

      if (packCharacters.length === 0) return null;

      return {
        id,
        displayName,
        characters: packCharacters,
      };
    };

    const specialPacks = [
      buildSpecialPack(HIDDEN_PACK_ID, 'Hidden', state.hiddenCharacterIds || []),
      buildSpecialPack(FAVORITES_PACK_ID, 'Favorites', (state.favoriteCharacterIds || []).filter((id) => !hiddenCharacterIdsSet.has(id))),
      buildSpecialPack(RECENT_PACK_ID, 'Recent', (state.recentCharacterIds || []).filter((id) => !hiddenCharacterIdsSet.has(id))),
    ].filter((pack) => Boolean(pack));

    const regularPacks = Array.isArray(packs) && packs.length > 0 ?
      packs
        .map((pack) => ({
          id: pack.id,
          displayName: pack.displayName,
          characters: charactersByPack.get(pack.id)?.characters || [],
        }))
        .filter((pack) => pack.characters.length > 0) :
      Array.from(charactersByPack.values());

    return {
      orderedPacks: [...specialPacks, ...regularPacks],
      favoriteCharacterIds: new Set((state.favoriteCharacterIds || []).filter((id) => !hiddenCharacterIdsSet.has(id))),
    };
  }

  function createPackSection(packId) {
    const packSection = document.createElement('section');
    packSection.className = 'character-pack-section';
    packSection.dataset.packId = packId;

    const packSeparator = document.createElement('span');
    packSeparator.className = 'character-pack-separator';
    packSeparator.setAttribute('aria-hidden', 'true');
    packSection.appendChild(packSeparator);

    const packHeading = document.createElement('span');
    packHeading.className = 'character-pack-heading';
    const packHeadingChevron = document.createElement('span');
    packHeadingChevron.className = 'character-pack-heading-chevron';
    packHeadingChevron.setAttribute('aria-hidden', 'true');
    const packHeadingLabel = document.createElement('span');
    packHeadingLabel.className = 'character-pack-heading-label';
    packHeading.append(packHeadingChevron, packHeadingLabel);
    packSection.appendChild(packHeading);

    const packStrip = document.createElement('div');
    packStrip.className = 'character-pack-strip';
    packSection.appendChild(packStrip);

    return packSection;
  }

  function syncPackHeading(packSection, pack, isHiddenPack, onToggleHiddenCollapsed) {
    const headingEl = packSection.querySelector('.character-pack-heading');
    headingEl.querySelector('.character-pack-heading-label').textContent = pack.displayName;

    packSection.classList.toggle('character-pack-section-hidden', isHiddenPack);
    packSection.classList.toggle('is-collapsed', isHiddenPack && Boolean(state.hiddenCharactersCollapsed));

    if (isHiddenPack) {
      headingEl.setAttribute('role', 'button');
      headingEl.setAttribute('tabindex', '0');
      headingEl.onclick = () => onToggleHiddenCollapsed?.();
      headingEl.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleHiddenCollapsed?.();
        }
      };
      return;
    }

    headingEl.removeAttribute('role');
    headingEl.removeAttribute('tabindex');
    headingEl.onclick = null;
    headingEl.onkeydown = null;
  }

  function createCharacterButton(character, {
    onCharacterSelected,
    onCharacterContextMenu,
  }) {
    const button = document.createElement('button');
    button.className = 'char-btn';
    button.dataset.id = character.id;

    const spriteWrap = document.createElement('div');
    spriteWrap.className = 'char-btn-sprite';

    const spriteImage = document.createElement('img');
    spriteImage.alt = character.displayName;
    spriteWrap.appendChild(spriteImage);

    const label = document.createElement('span');
    label.className = 'char-btn-label';

    const labelText = document.createElement('span');
    labelText.className = 'char-btn-label-text';
    label.appendChild(labelText);

    button.appendChild(spriteWrap);
    button.appendChild(label);

    button.addEventListener('mouseenter', () => {
      if (button.disabled) return;
      const currentCardKey = button.dataset.cardKey;
      if (state.selectedCharacter?.id === character.id) return;
      if (currentCardKey) animator.startIdle(currentCardKey);
    });

    button.addEventListener('mouseleave', () => {
      if (button.disabled) return;
      const currentCardKey = button.dataset.cardKey;
      if (!currentCardKey) return;

      if (state.selectedCharacter?.id === character.id) {
        if (animator.getMode(currentCardKey) !== 'speak') animator.startIdle(currentCardKey);
        return;
      }

      animator.stop(currentCardKey);
      animator.restorePreviewImage(currentCardKey);
    });

    button.addEventListener('click', () => {
      if (button.disabled) return;
      const wasActive = state.selectedCharacter?.id === character.id;
      onCharacterSelected?.(character, wasActive);
    });

    button.addEventListener('contextmenu', (event) => {
      if (button.disabled) return;
      event.preventDefault();
      onCharacterContextMenu?.(character, event);
    });

    return button;
  }

  function syncCharacterButton(button, character, {
    isNewButton,
    isHiddenPack,
    isFavorite,
    cardKey,
  }) {
    const missingCharacterImage = catalog.ui.missingCharacterImage;

    button.dataset.cardKey = cardKey;
    button.dataset.packId = character.packId;
    if (isHiddenPack) {
      button.dataset.hidden = 'true';
    } else {
      delete button.dataset.hidden;
    }
    button.dataset.searchIndex = normalizeSearchText([
      character.displayName,
      character.folderName,
      character.packDisplayName,
      character.packId,
    ].join(' '));
    button.disabled = !character.isAvailable;
    button.classList.toggle('unavailable', !character.isAvailable);
    button.title = character.displayName;

    const spriteImage = button.querySelector('.char-btn-sprite img');
    const previewUrl = character.previewSpriteUrl || null;
    const defaultImageUrl = previewUrl || missingCharacterImage || null;
    const usesMissingIcon = !previewUrl && Boolean(defaultImageUrl);

    if (spriteImage && defaultImageUrl && (isNewButton || spriteImage.dataset.srcPath !== defaultImageUrl)) {
      spriteImage.src = defaultImageUrl;
      spriteImage.dataset.srcPath = defaultImageUrl;
    }
    if (spriteImage) spriteImage.classList.toggle('missing-char-icon', usesMissingIcon);

    const label = button.querySelector('.char-btn-label');
    const labelText = button.querySelector('.char-btn-label-text');
    if (labelText) labelText.textContent = character.displayName;

    const existingHeart = label.querySelector('.char-btn-favorite-heart');
    if (isFavorite && !existingHeart) {
      label.insertBefore(createFavoriteHeartIcon(), labelText);
    } else if (!isFavorite && existingHeart) {
      existingHeart.remove();
    }

    const existingBadge = button.querySelector('.warning-badge');
    if (!character.isAvailable) {
      const warningBadgeImage = catalog.ui.warningBadgeImage;
      if (warningBadgeImage) {
        let badge = existingBadge;
        if (!badge) {
          badge = document.createElement('img');
          badge.className = 'warning-badge';
          button.appendChild(badge);
        }
        badge.src = warningBadgeImage;
        badge.alt = 'Unavailable';
        badge.title = (!character.hasAllSprites && !character.hasAnySound) ?
          'Missing sprite frames and no usable sounds' :
          (!character.hasAllSprites ? 'Missing sprite frames' : 'No usable sounds found');
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }

    if (isNewButton) {
      animator.registerCard(cardKey, {
        img: spriteImage,
        defaultImageUrl,
        usesMissingIcon,
        char: character,
      });
    } else {
      const oldCardKey = button.dataset.oldCardKey;
      if (oldCardKey && oldCardKey !== cardKey) {
        animator.renameCard(oldCardKey, cardKey);
      }
    }
    button.dataset.oldCardKey = cardKey;
    animator.trackCharacterCard(character.id, cardKey);
  }

  /**
   * Rebuilds the reel, reusing existing sections and buttons so running card
   * animations and scroll positions survive favorite/hide/recent changes.
   */
  function build({
    onCharacterSelected = null,
    onCharacterContextMenu = null,
    onToggleHiddenCollapsed = null,
  } = {}) {
    if (!refs.charGrid) return;

    const existingSections = new Map();
    refs.charGrid.querySelectorAll('.character-pack-section').forEach((section) => {
      const packId = section.dataset.packId;
      if (packId) existingSections.set(packId, section);
    });

    const fragment = document.createDocumentFragment();
    const {
      orderedPacks,
      favoriteCharacterIds,
    } = collectOrderedPacks();

    orderedPacks.forEach((pack) => {
      const isHiddenPack = pack.id === HIDDEN_PACK_ID;
      let packSection = existingSections.get(pack.id);

      if (!packSection) {
        packSection = createPackSection(pack.id);
      } else {
        existingSections.delete(pack.id);
      }

      const packStrip = packSection.querySelector('.character-pack-strip');
      syncPackHeading(packSection, pack, isHiddenPack, onToggleHiddenCollapsed);

      const existingButtons = new Map();
      packStrip.querySelectorAll('.char-btn').forEach((button) => {
        const characterId = button.dataset.id;
        if (characterId) existingButtons.set(characterId, button);
      });

      pack.characters.forEach((character, index) => {
        const cardKey = `${pack.id}::${character.id}::${index}`;
        let button = existingButtons.get(character.id);
        const isNewButton = !button;

        if (isNewButton) {
          button = createCharacterButton(character, {
            onCharacterSelected,
            onCharacterContextMenu,
          });
        }

        syncCharacterButton(button, character, {
          isNewButton,
          isHiddenPack,
          isFavorite: favoriteCharacterIds.has(character.id),
          cardKey,
        });

        packStrip.appendChild(button);
        existingButtons.delete(character.id);
      });

      existingButtons.forEach((button) => {
        const staleCardKey = button.dataset.cardKey;
        if (staleCardKey) animator.unregisterCard(staleCardKey);
        button.remove();
      });

      fragment.appendChild(packSection);
    });

    existingSections.forEach((section) => section.remove());

    refs.charGrid.innerHTML = '';
    refs.charGrid.appendChild(fragment);

    applyFilters();
  }

  return {
    applyFilters,
    applyHideBroken,
    build,
    clearSearchQuery,
    hasSearchQuery,
    setHiddenCollapsed,
    syncButtonAvailability,
    syncSearchClearButton,
    updateReelArrows,
    updateSelected,
  };
}

module.exports = {
  createCharacterGridView,
};
