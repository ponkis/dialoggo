// Pure helpers for reading GitHub release metadata. Asset names follow the
// artifactName patterns in electron-builder.config.js.

const CHECKSUMS_ASSET_NAME = 'SHA256SUMS.txt';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * How an update is applied on this platform:
 * - installer:  download the NSIS installer, launch it, and quit (Windows)
 * - disk-image: download the .dmg, open it, and quit (macOS)
 * - manual:     open the release page in the browser (Linux, or no asset)
 */
const INSTALL_MODES = Object.freeze({
  installer: 'installer',
  diskImage: 'disk-image',
  manual: 'manual',
});

function getAssetMatcher(platform, arch) {
  if (platform === 'win32') {
    return (name) => /-win-x64-setup\.exe$/i.test(name);
  }

  if (platform === 'darwin') {
    const macArch = arch === 'arm64' ? 'arm64' : 'x64';
    return (name) => new RegExp(`-mac-${macArch}\\.dmg$`, 'i').test(name);
  }

  return null;
}

function normalizeAsset(asset) {
  const name = typeof asset?.name === 'string' ? asset.name : '';
  const url = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : '';
  const size = Number.isSafeInteger(asset?.size) && asset.size > 0 ? asset.size : null;
  return name && url ? {
    name,
    url,
    size,
  } : null;
}

function selectInstallAsset(assets, {
  platform,
  arch,
}) {
  const matcher = getAssetMatcher(platform, arch);
  if (!matcher || !Array.isArray(assets)) return null;

  for (const rawAsset of assets) {
    const asset = normalizeAsset(rawAsset);
    if (asset && matcher(asset.name)) return asset;
  }

  return null;
}

function selectChecksumsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  const asset = assets.map(normalizeAsset).find((candidate) => candidate?.name === CHECKSUMS_ASSET_NAME);
  return asset || null;
}

function resolveInstallMode(platform, installAsset) {
  if (!installAsset) return INSTALL_MODES.manual;
  if (platform === 'win32') return INSTALL_MODES.installer;
  if (platform === 'darwin') return INSTALL_MODES.diskImage;
  return INSTALL_MODES.manual;
}

/** Only release downloads from this repository are fetched by the updater. */
function isTrustedReleaseDownloadUrl(value, repository) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.host === 'github.com' &&
      url.pathname.startsWith(`/${repository}/releases/download/`) &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

/** Parses `sha256sum` output ("<hash>  <file>") into a Map of file name to hash. */
function parseChecksums(text) {
  const checksums = new Map();

  String(text || '').split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^([A-Fa-f0-9]{64})\s+\*?(.+)$/);
    if (!match) return;
    checksums.set(match[2].trim(), match[1].toLowerCase());
  });

  return checksums;
}

/** A safe local file name for a downloaded asset, or null if the name is unusable. */
function toSafeAssetFileName(name) {
  const fileName = String(name || '');
  if (!/^[A-Za-z0-9._-]+$/.test(fileName) || fileName.startsWith('.')) return null;
  return fileName;
}

/** Reduces a release API response to the fields the updater uses. */
function summarizeRelease(release, {
  platform,
  arch,
}) {
  const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!tag) throw new Error('The latest GitHub release has no tag.');
  if (release.draft === true) throw new Error('The latest GitHub release is a draft.');

  const installAsset = selectInstallAsset(release.assets, {
    platform,
    arch,
  });

  return {
    tag,
    version: tag.replace(/^v/i, ''),
    name: typeof release.name === 'string' && release.name.trim() ? release.name.trim() : tag,
    releaseUrl: typeof release.html_url === 'string' ? release.html_url : null,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    installAsset,
    checksumsAsset: selectChecksumsAsset(release.assets),
    installMode: resolveInstallMode(platform, installAsset),
  };
}

module.exports = {
  CHECKSUMS_ASSET_NAME,
  INSTALL_MODES,
  SHA256_PATTERN,
  isTrustedReleaseDownloadUrl,
  parseChecksums,
  selectInstallAsset,
  summarizeRelease,
  toSafeAssetFileName,
};
