const {
  createEyeIcon,
  createHeartIcon,
} = require('../../ui/icons');

/**
 * The right-click menu shared by character and background cards. It offers
 * hide/unhide and add/remove favorite actions for the targeted item.
 */
function createContextMenuView({
  state,
}) {
  let menu = null;

  function buildFavoriteActionContent(action, isFavorite) {
    const icon = createHeartIcon({
      filled: isFavorite,
      wrapperClassName: 'favorite-context-menu-action-icon',
    });
    const label = document.createElement('span');
    label.className = 'favorite-context-menu-action-label';
    label.textContent = isFavorite ? 'Remove from favorites' : 'Add to favorites';
    action.replaceChildren(icon, label);
  }

  function buildHideActionContent(action, isHidden) {
    const icon = createEyeIcon({
      open: !isHidden,
      wrapperClassName: 'favorite-context-menu-action-icon',
    });
    const label = document.createElement('span');
    label.className = 'favorite-context-menu-action-label';
    label.textContent = isHidden ? 'Unhide' : 'Hide';
    action.replaceChildren(icon, label);
  }

  function createActionButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-context-menu-action';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    return button;
  }

  function ensureMenu() {
    if (menu) return menu;

    menu = document.createElement('div');
    menu.className = 'favorite-context-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');

    document.body.appendChild(menu);
    return menu;
  }

  function hide() {
    state.favoriteContextMenu.visible = false;
    state.favoriteContextMenu.targetId = null;
    state.favoriteContextMenu.targetType = null;
    state.favoriteContextMenu.x = 0;
    state.favoriteContextMenu.y = 0;

    if (!menu) return;
    menu.hidden = true;
    menu.setAttribute('aria-hidden', 'true');
    delete menu.dataset.targetId;
    delete menu.dataset.targetType;
    menu.replaceChildren();
  }

  function show({
    targetId,
    targetType = 'character',
    isFavorite = false,
    isHidden = false,
    x = 0,
    y = 0,
    onToggleFavorite = null,
    onToggleHidden = null,
  } = {}) {
    if (!targetId) return;

    const menuElement = ensureMenu();

    state.favoriteContextMenu.visible = true;
    state.favoriteContextMenu.targetId = targetId;
    state.favoriteContextMenu.targetType = targetType;
    state.favoriteContextMenu.x = x;
    state.favoriteContextMenu.y = y;

    menuElement.dataset.targetId = targetId;
    menuElement.dataset.targetType = targetType;
    menuElement.replaceChildren();

    let firstAction = null;

    if (onToggleHidden && !isFavorite) {
      const hideAction = createActionButton();
      buildHideActionContent(hideAction, isHidden);
      hideAction.onclick = (event) => {
        event.preventDefault();
        onToggleHidden?.();
      };
      menuElement.appendChild(hideAction);
      if (!firstAction) firstAction = hideAction;
    }

    if (onToggleFavorite && !isHidden) {
      const favoriteAction = createActionButton();
      buildFavoriteActionContent(favoriteAction, isFavorite);
      favoriteAction.onclick = (event) => {
        event.preventDefault();
        onToggleFavorite?.();
      };
      menuElement.appendChild(favoriteAction);
      if (!firstAction) firstAction = favoriteAction;
    }

    if (!firstAction) {
      hide();
      return;
    }

    menuElement.hidden = false;
    menuElement.setAttribute('aria-hidden', 'false');
    menuElement.style.left = `${Math.round(x)}px`;
    menuElement.style.top = `${Math.round(y)}px`;

    const rect = menuElement.getBoundingClientRect();
    const clampedLeft = Math.min(
      Math.max(8, Math.round(x)),
      Math.max(8, Math.round(window.innerWidth - rect.width - 8)),
    );
    const clampedTop = Math.min(
      Math.max(8, Math.round(y)),
      Math.max(8, Math.round(window.innerHeight - rect.height - 8)),
    );

    menuElement.style.left = `${clampedLeft}px`;
    menuElement.style.top = `${clampedTop}px`;
    state.favoriteContextMenu.x = clampedLeft;
    state.favoriteContextMenu.y = clampedTop;

    requestAnimationFrame(() => {
      firstAction.focus({
        preventScroll: true,
      });
    });
  }

  function isVisible() {
    return Boolean(menu && state.favoriteContextMenu.visible === true && !menu.hidden);
  }

  function containsTarget(target) {
    return Boolean(menu && target instanceof Node && menu.contains(target));
  }

  return {
    containsTarget,
    hide,
    isVisible,
    show,
  };
}

module.exports = {
  createContextMenuView,
};
