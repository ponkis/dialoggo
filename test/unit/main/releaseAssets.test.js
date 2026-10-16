const assert = require('node:assert/strict');
const test = require('node:test');
const {
  INSTALL_MODES,
  isTrustedReleaseDownloadUrl,
  parseChecksums,
  selectInstallAsset,
  summarizeRelease,
  toSafeAssetFileName,
} = require('../../../src/main/services/updates/releaseAssets');

const REPO = 'ponkis/dialoggo';
const download = (name) => `https://github.com/${REPO}/releases/download/v1.1.0/${name}`;
const asset = (name, size = 100) => ({
  name,
  browser_download_url: download(name),
  size,
});
const assets = [
  asset('Dialoggo-1.1.0-win-x64-setup.exe'),
  asset('Dialoggo-1.1.0-win-x64.zip'),
  asset('Dialoggo-1.1.0-mac-x64.dmg'),
  asset('Dialoggo-1.1.0-mac-arm64.dmg'),
  asset('Dialoggo-1.1.0-linux-x86_64.AppImage'),
  asset('SHA256SUMS.txt'),
];

test('selects the installer for each platform', () => {
  assert.equal(selectInstallAsset(assets, {
    platform: 'win32',
    arch: 'x64',
  }).name, 'Dialoggo-1.1.0-win-x64-setup.exe');
  assert.equal(selectInstallAsset(assets, {
    platform: 'darwin',
    arch: 'arm64',
  }).name, 'Dialoggo-1.1.0-mac-arm64.dmg');
  assert.equal(selectInstallAsset(assets, {
    platform: 'darwin',
    arch: 'x64',
  }).name, 'Dialoggo-1.1.0-mac-x64.dmg');
  assert.equal(selectInstallAsset(assets, {
    platform: 'linux',
    arch: 'x64',
  }), null);
  assert.equal(selectInstallAsset('nope', {
    platform: 'win32',
    arch: 'x64',
  }), null);
});

test('summarizes a release and picks an install mode', () => {
  const release = {
    tag_name: 'v1.1.0',
    html_url: `https://github.com/${REPO}/releases/tag/v1.1.0`,
    assets,
  };

  assert.equal(summarizeRelease(release, {
    platform: 'win32',
    arch: 'x64',
  }).installMode, INSTALL_MODES.installer);
  assert.equal(summarizeRelease(release, {
    platform: 'darwin',
    arch: 'arm64',
  }).installMode, INSTALL_MODES.diskImage);

  const linux = summarizeRelease(release, {
    platform: 'linux',
    arch: 'x64',
  });
  assert.equal(linux.installMode, INSTALL_MODES.manual);
  assert.equal(linux.version, '1.1.0');
  assert.equal(linux.checksumsAsset.name, 'SHA256SUMS.txt');

  assert.throws(() => summarizeRelease({}, {
    platform: 'win32',
  }));
});

test('only trusts release downloads from this repository', () => {
  assert.equal(isTrustedReleaseDownloadUrl(download('a.exe'), REPO), true);
  assert.equal(isTrustedReleaseDownloadUrl('http://github.com/ponkis/dialoggo/releases/download/v1/a.exe', REPO), false);
  assert.equal(isTrustedReleaseDownloadUrl('https://github.com/evil/dialoggo/releases/download/v1/a.exe', REPO), false);
  assert.equal(isTrustedReleaseDownloadUrl('https://github.com.evil.io/ponkis/dialoggo/releases/download/v1/a.exe', REPO), false);
  assert.equal(isTrustedReleaseDownloadUrl('https://user:pw@github.com/ponkis/dialoggo/releases/download/v1/a.exe', REPO), false);
  assert.equal(isTrustedReleaseDownloadUrl('not a url', REPO), false);
});

test('parses sha256sum output', () => {
  const hash = 'a'.repeat(64);
  const checksums = parseChecksums(`${hash}  Dialoggo-1.1.0-win-x64-setup.exe\n${'B'.repeat(64)} *other.zip\nnoise\n`);
  assert.equal(checksums.get('Dialoggo-1.1.0-win-x64-setup.exe'), hash);
  assert.equal(checksums.get('other.zip'), 'b'.repeat(64));
  assert.equal(checksums.size, 2);
});

test('rejects unsafe asset file names', () => {
  assert.equal(toSafeAssetFileName('Dialoggo-1.1.0-win-x64-setup.exe'), 'Dialoggo-1.1.0-win-x64-setup.exe');
  ['../evil.exe', 'a/b.exe', 'a\\b.exe', '.hidden', '', 'name with space.exe'].forEach((name) => {
    assert.equal(toSafeAssetFileName(name), null, name);
  });
});
