/**
 * A single in-app modal dialog styled like the rest of the UI. Used for
 * update prompts and results; only one dialog is shown at a time.
 */
function createAppDialogView({
  state,
}) {
  let backdrop = null;
  let elements = null;
  let currentOptions = null;
  let previouslyFocused = null;

  function ensureElements() {
    if (elements) return elements;

    backdrop = document.createElement('div');
    backdrop.className = 'app-dialog-backdrop';
    backdrop.hidden = true;

    const dialog = document.createElement('div');
    dialog.className = 'app-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'app-dialog-title');
    dialog.setAttribute('aria-describedby', 'app-dialog-message');

    const title = document.createElement('div');
    title.className = 'app-dialog-title';
    title.id = 'app-dialog-title';

    const stitch = document.createElement('div');
    stitch.className = 'app-dialog-stitch';
    stitch.setAttribute('aria-hidden', 'true');

    const message = document.createElement('p');
    message.className = 'app-dialog-message';
    message.id = 'app-dialog-message';

    const progress = document.createElement('div');
    progress.className = 'app-dialog-progress';
    const progressTrack = document.createElement('div');
    progressTrack.className = 'app-dialog-progress-track';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    const progressFill = document.createElement('div');
    progressFill.className = 'app-dialog-progress-fill';
    progressTrack.appendChild(progressFill);
    const progressText = document.createElement('span');
    progressText.className = 'app-dialog-progress-text';
    progress.append(progressTrack, progressText);

    const link = document.createElement('a');
    link.className = 'app-dialog-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';

    dialog.append(title, stitch, message, progress, link, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        currentOptions?.onEscape?.();
        return;
      }

      if (event.key === 'Tab') trapFocus(event);
    });

    elements = {
      dialog,
      title,
      message,
      progress,
      progressTrack,
      progressFill,
      progressText,
      link,
      actions,
    };
    return elements;
  }

  function getFocusableElements() {
    return Array.from(elements.dialog.querySelectorAll('button, a[href]'))
      .filter((element) => !element.hidden && element.offsetParent !== null);
  }

  function trapFocus(event) {
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function createActionElement(action) {
    const element = action.href ? document.createElement('a') : document.createElement('button');
    element.className = `app-dialog-button${action.primary ? ' app-dialog-button--primary' : ''}`;
    element.textContent = action.label;

    if (action.href) {
      element.href = action.href;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    } else {
      element.type = 'button';
    }

    element.addEventListener('click', () => {
      action.onClick?.();
    });
    return element;
  }

  /**
   * @param {object} options
   * @param {string} options.title
   * @param {string} options.message       Plain text; blank lines become paragraph breaks.
   * @param {{label: string, href: string}} [options.link]
   * @param {Array<{label: string, primary?: boolean, href?: string, onClick?: Function}>} [options.actions]
   * @param {boolean} [options.progress]   Shows the progress bar.
   * @param {Function} [options.onEscape]  Called when Esc is pressed.
   */
  function show(options) {
    const view = ensureElements();
    const wasOpen = !backdrop.hidden;
    currentOptions = options;

    view.title.textContent = options.title || '';
    view.message.textContent = options.message || '';
    view.progress.hidden = options.progress !== true;
    if (options.progress) setProgress(0, null);

    view.link.hidden = !options.link?.href;
    if (options.link?.href) {
      view.link.href = options.link.href;
      view.link.textContent = options.link.label || options.link.href;
    } else {
      view.link.removeAttribute('href');
    }

    view.actions.replaceChildren(...(options.actions || []).map(createActionElement));
    view.actions.hidden = view.actions.childElementCount === 0;

    if (!wasOpen) {
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      backdrop.hidden = false;
      void backdrop.offsetWidth;
      backdrop.classList.add('is-open');
    }
    state.modalOpen = true;

    requestAnimationFrame(() => {
      const primary = view.actions.querySelector('.app-dialog-button--primary') ||
        view.actions.querySelector('.app-dialog-button') ||
        view.dialog;
      if (primary === view.dialog) view.dialog.tabIndex = -1;
      primary.focus({
        preventScroll: true,
      });
    });
  }

  function setProgress(receivedBytes, totalBytes, text = '') {
    if (!elements) return;
    const percent = totalBytes ? Math.max(0, Math.min(100, (receivedBytes / totalBytes) * 100)) : null;

    elements.progress.classList.toggle('is-indeterminate', percent === null);
    elements.progressFill.style.width = percent === null ? '' : `${percent.toFixed(1)}%`;
    if (percent === null) {
      elements.progressTrack.removeAttribute('aria-valuenow');
    } else {
      elements.progressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
    elements.progressText.textContent = text;
  }

  function close() {
    if (!backdrop || backdrop.hidden) return;

    currentOptions = null;
    state.modalOpen = false;
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    elements.actions.replaceChildren();

    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus({
        preventScroll: true,
      });
    }
    previouslyFocused = null;
  }

  function isOpen() {
    return Boolean(backdrop && !backdrop.hidden);
  }

  return {
    close,
    isOpen,
    setProgress,
    show,
  };
}

module.exports = {
  createAppDialogView,
};
