const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getPairedDialogueMarkerStarts,
  parseDialogueMarkup,
  splitTextIntoLines,
} = require('../../../src/renderer/domain/dialogueText');

test('parseDialogueMarkup uppercases text and strips paired markers', () => {
  const characters = parseDialogueMarkup('a **b** _c_ ~~d~~');
  assert.equal(characters.map((character) => character.value).join(''), 'A B C D');

  const byValue = Object.fromEntries(characters.map((character) => [character.value, character]));
  assert.equal(byValue.B.emphasis, true);
  assert.equal(byValue.C.italic, true);
  assert.equal(byValue.D.strikethrough, true);
  assert.equal(byValue.A.emphasis, false);
});

test('unpaired markers are kept as literal text', () => {
  const text = parseDialogueMarkup('**open').map((character) => character.value).join('');
  assert.equal(text, '**OPEN');
  assert.equal(getPairedDialogueMarkerStarts('**a**b**', '**').size, 2);
});

test('splitTextIntoLines wraps on word boundaries', () => {
  assert.deepEqual(splitTextIntoLines('hello world', 5), ['HELLO', 'WORLD']);
  assert.deepEqual(splitTextIntoLines('hello world', 32), ['HELLO WORLD']);
});

test('splitTextIntoLines breaks words longer than a line', () => {
  assert.deepEqual(splitTextIntoLines('abcdefgh', 3), ['ABC', 'DEF', 'GH']);
});

test('splitTextIntoLines honours explicit newlines and empty input', () => {
  assert.deepEqual(splitTextIntoLines('one\ntwo', 32), ['ONE', 'TWO']);
  assert.deepEqual(splitTextIntoLines('', 32), ['']);
});

test('splitTextIntoLines uses a custom measure when provided', () => {
  const lines = splitTextIntoLines('ab cd', {
    maxUnits: 4,
    measureCharacters: (characters) => characters.length * 2,
  });
  assert.deepEqual(lines, ['AB', 'CD']);
});
