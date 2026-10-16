const SHORTCUT_KEY_LABELS = new Map([
  ['ctrl', 'Ctrl'],
  ['shift', 'Shift'],
  ['space', 'Space'],
  ['escape', 'Esc'],
]);
const SHORTCUT_KEY_ORDER = new Map([
  ['ctrl', 0],
  ['shift', 1],
  ['space', 2],
  ['escape', 3],
]);

/** Renders the on-screen keycap overlay and the transient action alerts. */
function createShortcutVisualizerView({
  refs,
}) {
  function appendActionText(host, text) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;

    const span = document.createElement('span');
    span.className = 'shortcut-visualizer-action-text';
    span.textContent = normalizedText;
    host.appendChild(span);
  }

  function buildActionContent({
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    const normalizedAction = String(action || '').trim();
    const normalizedLeadingText = String(leadingText || '').trim();
    const normalizedTrailingText = String(trailingText || '').trim();
    const normalizedIconSrc = String(iconSrc || '').trim();
    const normalizedIconAlt = String(iconAlt || '').trim();
    const normalizedIconVariant = String(iconVariant || 'sprite').trim().toLowerCase();

    if (!normalizedIconSrc) {
      const fallbackText = normalizedAction || [normalizedLeadingText, normalizedTrailingText].filter(Boolean).join(' ');
      return {
        hasContent: fallbackText.length > 0,
        textContent: fallbackText,
        fragment: null,
      };
    }

    const fragment = document.createDocumentFragment();
    appendActionText(fragment, normalizedLeadingText);

    const sprite = document.createElement('img');
    sprite.className = normalizedIconVariant === 'thumbnail' ?
      'shortcut-visualizer-action-icon shortcut-visualizer-action-thumbnail' :
      'shortcut-visualizer-action-icon shortcut-visualizer-action-sprite';
    sprite.src = normalizedIconSrc;
    sprite.alt = normalizedIconAlt;
    sprite.setAttribute('aria-hidden', normalizedIconAlt ? 'false' : 'true');
    fragment.appendChild(sprite);

    appendActionText(fragment, normalizedTrailingText);

    return {
      hasContent: true,
      textContent: '',
      fragment,
    };
  }

  function sync({
    visible = false,
    keys = [],
    action = '',
    leadingText = '',
    trailingText = '',
    iconSrc = '',
    iconAlt = '',
    iconVariant = 'sprite',
  } = {}) {
    const root = refs.shortcutVisualizer;
    const keysHost = refs.shortcutVisualizerKeys;
    const actionHost = refs.shortcutVisualizerAction;
    if (!root || !keysHost || !actionHost) return;

    const normalizedKeys = Array.from(new Set(
      (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || '').toLowerCase())
        .filter((key) => SHORTCUT_KEY_LABELS.has(key)),
    )).sort((left, right) => {
      const leftOrder = SHORTCUT_KEY_ORDER.has(left) ? SHORTCUT_KEY_ORDER.get(left) : Number.MAX_SAFE_INTEGER;
      const rightOrder = SHORTCUT_KEY_ORDER.has(right) ? SHORTCUT_KEY_ORDER.get(right) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

    const actionContent = buildActionContent({
      action,
      leadingText,
      trailingText,
      iconSrc,
      iconAlt,
      iconVariant,
    });
    const shouldShowTextOnly = normalizedKeys.length === 0 && actionContent.hasContent;

    if (!visible || (normalizedKeys.length === 0 && !actionContent.hasContent)) {
      keysHost.replaceChildren();
      actionHost.replaceChildren();
      actionHost.textContent = '';
      actionHost.hidden = true;
      root.classList.remove('visible');
      root.classList.remove('shortcut-visualizer-text-only');
      root.setAttribute('aria-hidden', 'true');
      return;
    }

    const fragment = document.createDocumentFragment();

    normalizedKeys.forEach((key, index) => {
      if (index > 0) {
        const plus = document.createElement('span');
        plus.className = 'shortcut-visualizer-plus';
        plus.textContent = '+';
        fragment.appendChild(plus);
      }

      const wrapper = document.createElement('span');
      wrapper.className = 'shortcut-keycap';
      wrapper.dataset.key = key;

      const d3wrapper = document.createElement('span');
      d3wrapper.className = 'shortcut-keycap-3dwrapper';

      const cover = document.createElement('span');
      cover.className = 'shortcut-keycap-cover';

      const label = document.createElement('span');
      label.className = 'shortcut-keycap-button';
      label.textContent = SHORTCUT_KEY_LABELS.get(key) || key;

      cover.appendChild(label);
      d3wrapper.appendChild(cover);
      wrapper.appendChild(d3wrapper);
      fragment.appendChild(wrapper);
    });

    keysHost.replaceChildren(fragment);
    keysHost.hidden = normalizedKeys.length === 0;

    actionHost.replaceChildren();
    if (actionContent.fragment) {
      actionHost.appendChild(actionContent.fragment);
    } else {
      actionHost.textContent = actionContent.textContent;
    }
    actionHost.hidden = !actionContent.hasContent;
    root.classList.toggle('shortcut-visualizer-text-only', shouldShowTextOnly);
    root.classList.add('visible');
    root.setAttribute('aria-hidden', 'false');
  }

  function setAlertExiting(exiting) {
    refs.shortcutVisualizer?.classList.toggle('shortcut-visualizer-favorite-alert-exit', exiting);
  }

  function setButtonKeyboardPressed(button, pressed) {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle('is-keyboard-pressed', pressed === true);
  }

  return {
    setAlertExiting,
    setButtonKeyboardPressed,
    sync,
  };
}

module.exports = {
  createShortcutVisualizerView,
};
