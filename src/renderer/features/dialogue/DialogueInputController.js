/** Wires the dialogue textarea and its formatting toolbar to user input. */
function createDialogueInputController({
  refs,
  inputView,
  onInputChanged,
}) {
  function bindEvents() {
    document.addEventListener('mousedown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const formatButton = target.closest('.format-btn');
      if (formatButton) {
        event.preventDefault();
        const modifier = formatButton.dataset.modifier;
        if (modifier) {
          inputView.applyModifierToSelection(modifier);
        }
      }
    });

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === refs.input) {
        inputView.updateFormatToolbarVisibility();
      }
    });

    refs.input.addEventListener('blur', () => {
      inputView.updateFormatToolbarVisibility();
    });

    refs.input.addEventListener('input', () => {
      inputView.normalize();
      onInputChanged();
    });
    refs.input.addEventListener('scroll', inputView.syncHighlightScroll);
  }

  return {
    bindEvents,
  };
}

module.exports = {
  createDialogueInputController,
};
