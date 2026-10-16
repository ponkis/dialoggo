const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  sanitizeExternalUrl,
} = require('../../../src/main/security/externalUrl');
const {
  safeParseJson,
  safeReadJsonFile,
} = require('../../../src/main/security/safeJson');
const {
  assertSafeAbsolutePath,
  isPathInsideRoot,
} = require('../../../src/main/security/safePaths');

test('only http(s) URLs may be opened externally', () => {
  assert.equal(sanitizeExternalUrl('https://ponkis.xyz'), 'https://ponkis.xyz/');
  assert.equal(sanitizeExternalUrl('http://example.com/a?b=c'), 'http://example.com/a?b=c');
  assert.equal(sanitizeExternalUrl('file:///C:/Windows/System32/calc.exe'), null);
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl(''), null);
});

test('safeParseJson strips prototype-pollution keys', () => {
  const parsed = safeParseJson('{"name":"x","__proto__":{"polluted":true},"nested":{"constructor":1,"ok":2}}');
  assert.deepEqual(parsed, {
    name: 'x',
    nested: {
      ok: 2,
    },
  });
  assert.equal({}.polluted, undefined);
});

test('safeParseJson enforces size limits and falls back when asked', () => {
  assert.throws(() => safeParseJson('"abcdef"', {
    maxBytes: 4,
  }));
  assert.equal(safeParseJson('{bad', {
    fallback: 'fallback',
  }), 'fallback');
});

test('safeReadJsonFile rejects oversized files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoggo-json-'));
  const filePath = path.join(directory, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    name: 'x'.repeat(100),
  }));

  try {
    assert.throws(() => safeReadJsonFile(filePath, {
      maxBytes: 10,
    }));
    assert.equal(safeReadJsonFile(filePath).name.length, 100);
  } finally {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

test('path containment checks', () => {
  const root = path.resolve('/srv/app');
  assert.equal(isPathInsideRoot(root, path.join(root, 'a', 'b')), true);
  assert.equal(isPathInsideRoot(root, root), true);
  assert.equal(isPathInsideRoot(root, path.resolve('/srv/app-other/file')), false);
  assert.equal(isPathInsideRoot(root, path.join(root, '..', 'secret')), false);
  assert.throws(() => assertSafeAbsolutePath(path.resolve('/etc/passwd'), [root]));
  assert.throws(() => assertSafeAbsolutePath('bad\0path', [root]));
});
