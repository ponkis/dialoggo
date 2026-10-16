const {
  buildDialogueInputHighlightMarkup,
  clampDialogueInputValue,
  toggleSelectionModifier,
} = require('../../domain/dialogueInput');

/**
 * The dialogue textarea with its live markup highlight overlay, character
 * counter, and floating formatting toolbar.
 */
function createDialogueInputView({
  refs,
  constants,
}) {
  const maxLength = constants.DIALOGUE_INPUT_MAX_LENGTH;

  function getText() {
    return clampDialogueInputValue(refs.input.value, maxLength).trim();
  }

  function hasText() {
    return refs.input.value.trim().length > 0;
  }

  function setLocked(locked) {
    refs.input.readOnly = locked;
    refs.input.classList.toggle('is-locked', locked);
    refs.input.parentElement?.classList.toggle('is-locked', locked);
  }

  function syncHighlightScroll() {
    if (!refs.dialogueInputHighlight || !refs.input) return;
    refs.dialogueInputHighlight.scrollTop = refs.input.scrollTop;
    refs.dialogueInputHighlight.scrollLeft = refs.input.scrollLeft;
  }

  function syncHighlightMetrics() {
    if (!refs.dialogueInputHighlight || !refs.input) return;

    const computed = window.getComputedStyle(refs.input);

    refs.dialogueInputHighlight.style.paddingTop = computed.paddingTop;
    refs.dialogueInputHighlight.style.paddingRight = computed.paddingRight;
    refs.dialogueInputHighlight.style.paddingBottom = computed.paddingBottom;
    refs.dialogueInputHighlight.style.paddingLeft = computed.paddingLeft;
    refs.dialogueInputHighlight.style.font = computed.font;
    refs.dialogueInputHighlight.style.lineHeight = computed.lineHeight;
    refs.dialogueInputHighlight.style.letterSpacing = computed.letterSpacing;
  }

  function syncHighlight() {
    if (!refs.dialogueInputHighlight || !refs.input) return;

    const hasValue = refs.input.value.length > 0;
    refs.input.parentElement?.classList.toggle('has-value', hasValue);
    syncHighlightMetrics();
    refs.dialogueInputHighlight.innerHTML = buildDialogueInputHighlightMarkup(refs.input.value);
    syncHighlightScroll();
  }

  function syncCounter() {
    if (!refs.dialogueInputCounter || !refs.input) return;

    const length = refs.input.value.length;
    refs.dialogueInputCounter.textContent = `${length} / ${maxLength}`;
    refs.dialogueInputCounter.classList.toggle('is-near-limit', length >= maxLength - 100 && length < maxLength);
    refs.dialogueInputCounter.classList.toggle('is-at-limit', length >= maxLength);
  }

  function normalize() {
    if (!refs.input) return;

    const clamped = clampDialogueInputValue(refs.input.value, maxLength);
    if (refs.input.value !== clamped) {
      const selectionStart = Math.min(refs.input.selectionStart ?? clamped.length, clamped.length);
      const selectionEnd = Math.min(refs.input.selectionEnd ?? clamped.length, clamped.length);
      refs.input.value = clamped;
      refs.input.setSelectionRange(selectionStart, selectionEnd);
    }

    refs.input.setCustomValidity('');
    syncHighlight();
    syncCounter();
  }

  function updateFormatToolbarVisibility() {
    if (!refs.input || !refs.formatToolbar) return;
    const hasSelection = document.activeElement === refs.input && refs.input.selectionStart !== refs.input.selectionEnd;
    refs.formatToolbar.classList.toggle('hidden', !hasSelection);
  }

  function applyModifierToSelection(modifier) {
    if (!refs.input) return;

    const result = toggleSelectionModifier(
      refs.input.value,
      refs.input.selectionStart,
      refs.input.selectionEnd,
      modifier,
    );
    if (!result) return;

    refs.input.value = result.value;
    refs.input.setSelectionRange(result.selectionStart, result.selectionEnd);
    refs.input.focus();
    normalize();
    updateFormatToolbarVisibility();
  }

  return {
    applyModifierToSelection,
    getText,
    hasText,
    normalize,
    setLocked,
    syncHighlight,
    syncHighlightMetrics,
    syncHighlightScroll,
    updateFormatToolbarVisibility,
  };
}

module.exports = {
  createDialogueInputView,
};
