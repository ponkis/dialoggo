const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildDialogueInputHighlightMarkup,
  clampDialogueInputValue,
  escapeHtml,
  toggleSelectionModifier,
} = require('../../../src/renderer/domain/dialogueInput');

test('clampDialogueInputValue limits length and tolerates empty values', () => {
  assert.equal(clampDialogueInputValue('abcdef', 3), 'abc');
  assert.equal(clampDialogueInputValue(null, 3), '');
});

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('highlight markup styles paired markers and escapes text', () => {
  const markup = buildDialogueInputHighlightMarkup('**<b>**');
  assert.match(markup, /<span class="text-input-modifier">\*\*<\/span>/);
  assert.match(markup, /text-input-emphasis">&lt;b&gt;<\/span>/);
  assert.ok(markup.endsWith('<span class="text-input-trailing-space">&#8203;</span>'));
});

test('highlight markup keeps unpaired markers as plain text', () => {
  const markup = buildDialogueInputHighlightMarkup('a_b');
  assert.ok(!markup.includes('text-input-modifier'));
  assert.ok(!markup.includes('text-input-italic'));
});

test('toggleSelectionModifier wraps and unwraps a selection', () => {
  const wrapped = toggleSelectionModifier('say hi now', 4, 6, '**');
  assert.deepEqual(wrapped, {
    value: 'say **hi** now',
    selectionStart: 6,
    selectionEnd: 8,
  });

  const unwrapped = toggleSelectionModifier(wrapped.value, wrapped.selectionStart, wrapped.selectionEnd, '**');
  assert.deepEqual(unwrapped, {
    value: 'say hi now',
    selectionStart: 4,
    selectionEnd: 6,
  });

  assert.equal(toggleSelectionModifier('abc', 1, 1, '_'), null);
});
