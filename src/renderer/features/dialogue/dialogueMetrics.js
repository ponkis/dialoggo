/** Reads the dialogue letter spacing, preferring the --dialogue-letter-spacing custom property. */
function getDialogueLetterSpacing(textElement, textStyle = null) {
  const style = textStyle || window.getComputedStyle(textElement);
  const customSpacing = Number.parseFloat(style?.getPropertyValue('--dialogue-letter-spacing'));
  if (Number.isFinite(customSpacing)) return customSpacing;
  return Number.parseFloat(style?.letterSpacing) || 0;
}

module.exports = {
  getDialogueLetterSpacing,
};
