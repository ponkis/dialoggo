const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  resolveAssetRequestPath,
  toAssetUrl,
} = require('../../../src/main/protocol/assetProtocol');

const rootDir = path.resolve('/srv/dialoggo/renderer');

test('maps app URLs onto files under the renderer root', () => {
  assert.equal(
    resolveAssetRequestPath('dialoggo://app/assets/img/gui/1.png', rootDir),
    path.join(rootDir, 'assets', 'img', 'gui', '1.png'),
  );
  assert.equal(resolveAssetRequestPath('dialoggo://app/', rootDir), path.join(rootDir, 'index.html'));
  assert.equal(
    resolveAssetRequestPath('dialoggo://app/assets/My%20Pack/bg.png', rootDir),
    path.join(rootDir, 'assets', 'My Pack', 'bg.png'),
  );
});

test('rejects traversal, foreign hosts, other schemes, and malformed input', () => {
  // URL parsing collapses dot segments at the root, so this stays inside it.
  assert.equal(resolveAssetRequestPath('dialoggo://app/%2e%2e/%2e%2e/secret.txt', rootDir), path.join(rootDir, 'secret.txt'));
  // Encoded separators survive URL parsing and must be caught after decoding.
  assert.equal(resolveAssetRequestPath('dialoggo://app/assets/..%2F..%2F..%2Fsecret.txt', rootDir), null);
  assert.equal(resolveAssetRequestPath('dialoggo://app/..%5C..%5Csecret.txt', rootDir), null);
  assert.equal(resolveAssetRequestPath('dialoggo://evil/index.html', rootDir), null);
  assert.equal(resolveAssetRequestPath('file:///etc/passwd', rootDir), null);
  assert.equal(resolveAssetRequestPath('dialoggo://app/a%00b', rootDir), null);
  assert.equal(resolveAssetRequestPath('dialoggo://app/%E0%A4%A', rootDir), null);
  assert.equal(resolveAssetRequestPath('not a url', rootDir), null);
});

test('toAssetUrl round-trips through resolveAssetRequestPath', () => {
  const filePath = path.join(rootDir, 'assets', 'snd', 'packs', 'bk', 'mr vile', '1.wav');
  const url = toAssetUrl(filePath, rootDir);
  assert.equal(url, 'dialoggo://app/assets/snd/packs/bk/mr%20vile/1.wav');
  assert.equal(resolveAssetRequestPath(url, rootDir), filePath);
});
