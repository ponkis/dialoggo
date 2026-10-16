const {
  getPairedDialogueMarkerStarts,
} = require('./dialogueText');

function clampDialogueInputValue(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the HTML overlay that mirrors the dialogue textarea, styling paired
 * markup markers (**shake**, _italic_, ~~strike~~) and the text between them.
 */
function buildDialogueInputHighlightMarkup(value) {
  const source = String(value || '');
  const segments = [];
  let emphasis = false;
  let italic = false;
  let strikethrough = false;
  const pairedShakeStarts = getPairedDialogueMarkerStarts(source, '**');
  const pairedItalicStarts = getPairedDialogueMarkerStarts(source, '_');
  const pairedStrikeStarts = getPairedDialogueMarkerStarts(source, '~~');
  let runStart = 0;

  function pushRun(endIndex) {
    if (endIndex <= runStart) return;
    const classes = ['text-input-plain'];
    if (emphasis) classes.push('text-input-emphasis');
    if (italic) classes.push('text-input-italic');
    if (strikethrough) classes.push('text-input-strikethrough');
    segments.push(`<span class="${classes.join(' ')}">${escapeHtml(source.slice(runStart, endIndex))}</span>`);
  }

  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith('**', index) && pairedShakeStarts.has(index)) {
      pushRun(index);
      segments.push('<span class="text-input-modifier">**</span>');
      emphasis = !emphasis;
      runStart = index + 2;
      index += 1;
      continue;
    }

    if (source.startsWith('~~', index) && pairedStrikeStarts.has(index)) {
      pushRun(index);
      segments.push('<span class="text-input-modifier text-input-modifier-strike">~~</span>');
      strikethrough = !strikethrough;
      runStart = index + 2;
      index += 1;
      continue;
    }

    if (source.startsWith('_', index) && pairedItalicStarts.has(index)) {
      pushRun(index);
      segments.push('<span class="text-input-modifier text-input-modifier-italic">_</span>');
      italic = !italic;
      runStart = index + 1;
      continue;
    }

    if (source.startsWith('**', index) || source.startsWith('~~', index)) {
      pushRun(index);
      segments.push(`<span class="text-input-plain">${escapeHtml(source.slice(index, index + 2))}</span>`);
      runStart = index + 2;
      index += 1;
      continue;
    }

    if (source.startsWith('_', index)) {
      pushRun(index);
      segments.push(`<span class="text-input-plain">${escapeHtml(source.slice(index, index + 1))}</span>`);
      runStart = index + 1;
      continue;
    }
  }

  pushRun(source.length);

  if (segments.length === 0) {
    return '<span class="text-input-trailing-space">&#8203;</span>';
  }

  return `${segments.join('')}<span class="text-input-trailing-space">&#8203;</span>`;
}

/**
 * Wraps the selected text in a markup modifier, or unwraps it when it is
 * already wrapped. Returns null for an empty selection.
 */
function toggleSelectionModifier(value, start, end, modifier) {
  if (start === end) return null;

  const before = value.substring(0, start);
  const selected = value.substring(start, end);
  const after = value.substring(end);
  const isWrapped = before.endsWith(modifier) && after.startsWith(modifier);

  if (isWrapped) {
    return {
      value: before.slice(0, -modifier.length) + selected + after.slice(modifier.length),
      selectionStart: start - modifier.length,
      selectionEnd: end - modifier.length,
    };
  }

  return {
    value: before + modifier + selected + modifier + after,
    selectionStart: start + modifier.length,
    selectionEnd: end + modifier.length,
  };
}

module.exports = {
  buildDialogueInputHighlightMarkup,
  clampDialogueInputValue,
  escapeHtml,
  toggleSelectionModifier,
};
