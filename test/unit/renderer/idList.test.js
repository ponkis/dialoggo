const assert = require('node:assert/strict');
const test = require('node:test');
const {
  sanitizeIdList,
} = require('../../../src/renderer/domain/idList');

test('sanitizeIdList trims, dedupes, filters, and limits', () => {
  const validIds = new Set(['a', 'b', 'c']);
  assert.deepEqual(sanitizeIdList([' a ', 'a', '', null, 'x', 'b', 'c'], {
    validIds,
    limit: 2,
  }), ['a', 'b']);
});

test('sanitizeIdList treats non-arrays as empty', () => {
  assert.deepEqual(sanitizeIdList('a'), []);
  assert.deepEqual(sanitizeIdList(undefined), []);
});
