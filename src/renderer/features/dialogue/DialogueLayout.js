const {
  splitStyledTextIntoLines,
} = require('../../domain/dialogueText');
const {
  getDialogueLetterSpacing,
} = require('./dialogueMetrics');

const MAX_MEASURE_CACHE_ENTRIES = 600;

/**
 * Wraps dialogue text into box lines using the real rendered font metrics, so
 * line breaks match what the dialogue box can actually fit.
 */
function createDialogueLayout({
  refs,
  constants,
}) {
  const measureCache = new Map();
  let measureContext = null;

  function getWrapMetrics() {
    if (!refs.dialogueTextArea || !refs.dialogueText) return null;

    const textStyle = window.getComputedStyle(refs.dialogueText);
    const areaStyle = window.getComputedStyle(refs.dialogueTextArea);
    const effectiveLetterSpacing = getDialogueLetterSpacing(refs.dialogueText, textStyle);
    const paddingLeft = Number.parseFloat(areaStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(areaStyle.paddingRight) || 0;
    const measuredWidth = Math.floor(refs.dialogueTextArea.clientWidth - paddingLeft - paddingRight);

    if (measuredWidth <= 0) return null;

    if (!measureContext) {
      const canvas = document.createElement('canvas');
      measureContext = canvas.getContext('2d');
    }

    if (!measureContext) return null;

    const font = textStyle.font || constants.N64_TEXT_FONT;
    measureContext.font = font;

    return {
      ctx: measureContext,
      fontKey: `${font}|${effectiveLetterSpacing}`,
      letterSpacing: effectiveLetterSpacing,
      maxWidth: measuredWidth,
    };
  }

  function measureCharactersWidth(characters, metrics) {
    if (!metrics || characters.length === 0) return 0;

    const text = characters.map((character) => character.value).join('');
    const cacheKey = `${metrics.fontKey}|line|${text}`;
    if (measureCache.has(cacheKey)) {
      return measureCache.get(cacheKey);
    }

    let width = 0;

    characters.forEach((character, index) => {
      const charCacheKey = `${metrics.fontKey}|char|${character.value}`;
      let charWidth = measureCache.get(charCacheKey);

      if (typeof charWidth !== 'number') {
        charWidth = metrics.ctx.measureText(character.value).width;
        measureCache.set(charCacheKey, charWidth);
      }

      width += charWidth;
      if (index < characters.length - 1) {
        width += metrics.letterSpacing;
      }
    });

    if (measureCache.size > MAX_MEASURE_CACHE_ENTRIES) {
      measureCache.clear();
    }

    measureCache.set(cacheKey, width);
    return width;
  }

  function splitIntoRenderLines(text) {
    const metrics = getWrapMetrics();
    if (!metrics) {
      return splitStyledTextIntoLines(text);
    }

    return splitStyledTextIntoLines(text, {
      maxUnits: metrics.maxWidth,
      measureCharacters(characters) {
        return measureCharactersWidth(characters, metrics);
      },
    });
  }

  return {
    splitIntoRenderLines,
  };
}

module.exports = {
  createDialogueLayout,
};
