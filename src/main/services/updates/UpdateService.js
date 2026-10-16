const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  createCompareUrl,
  isNewerRelease,
} = require('../../../shared/releaseVersion');
const {
  INSTALL_MODES,
  SHA256_PATTERN,
  isTrustedReleaseDownloadUrl,
  parseChecksums,
  summarizeRelease,
  toSafeAssetFileName,
} = require('./releaseAssets');

const CHECK_TIMEOUT_MS = 15000;
const DOWNLOAD_STALL_TIMEOUT_MS = 30000;
const MAX_CHECKSUMS_BYTES = 64 * 1024;
const PROGRESS_INTERVAL_MS = 100;
const UPDATE_DIRECTORY_NAME = 'dialoggo-updates';

class UpdateError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'UpdateError';
    this.code = code;
  }
}

function describeError(error) {
  if (error instanceof UpdateError) return error.message;
  if (error?.name === 'TimeoutError') return 'The connection timed out.';

  let cause = error;
  while (cause?.cause) cause = cause.cause;
  const message = String(cause?.message || '').trim();
  return message || 'The connection was interrupted before the download completed.';
}

/**
 * Checks GitHub releases for a newer version and downloads the platform
 * installer, verifying it against the release's SHA256SUMS.txt. Mirrors
 * Mystral's updater: check, confirm, download with progress, launch, quit.
 */
function createUpdateService({
  fetchImpl,
  currentVersion,
  repository,
  repositoryUrl,
  userAgent,
  platform = process.platform,
  arch = process.arch,
  tempDir,
  canApplyUpdates,
  launchInstaller,
  openDiskImage,
  logger = null,
}) {
  const downloadDir = path.join(tempDir, UPDATE_DIRECTORY_NAME);
  let latestRelease = null;
  let activeDownload = null;
  let downloadedFile = null;

  function requestHeaders(accept) {
    return {
      Accept: accept,
      'User-Agent': userAgent,
    };
  }

  async function check() {
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`, {
        headers: requestHeaders('application/vnd.github+json'),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });

      if (response.status === 404) {
        latestRelease = null;
        return {
          ok: true,
          status: 'no-releases',
          currentVersion,
        };
      }

      if (!response.ok) {
        throw new UpdateError('http', `GitHub responded with HTTP ${response.status}.`);
      }

      const release = summarizeRelease(await response.json(), {
        platform,
        arch,
      });

      if (!isNewerRelease(release.version, currentVersion)) {
        latestRelease = null;
        return {
          ok: true,
          status: 'up-to-date',
          currentVersion,
          latestVersion: release.version,
        };
      }

      latestRelease = release;
      const installMode = canApplyUpdates ? release.installMode : INSTALL_MODES.manual;

      return {
        ok: true,
        status: 'available',
        currentVersion,
        latestVersion: release.version,
        releaseUrl: release.releaseUrl || `${repositoryUrl}/releases/latest`,
        notesUrl: createCompareUrl(repositoryUrl, currentVersion, release.version) || release.releaseUrl,
        installMode,
        downloadSize: installMode === INSTALL_MODES.manual ? null : release.installAsset?.size ?? null,
      };
    } catch (error) {
      logger?.warn('Update check failed', {
        message: error?.message,
      });
      return {
        ok: false,
        message: describeError(error),
      };
    }
  }

  async function fetchExpectedChecksum(release, signal) {
    if (!release.checksumsAsset) return null;
    if (!isTrustedReleaseDownloadUrl(release.checksumsAsset.url, repository)) {
      throw new UpdateError('untrusted', 'The release checksum file is not hosted by this repository.');
    }

    const response = await fetchImpl(release.checksumsAsset.url, {
      headers: requestHeaders('application/octet-stream'),
      signal,
    });
    if (!response.ok) throw new UpdateError('http', `Could not download checksums (HTTP ${response.status}).`);

    const text = await response.text();
    if (text.length > MAX_CHECKSUMS_BYTES) throw new UpdateError('checksum', 'The release checksum file is too large.');

    const expected = parseChecksums(text).get(release.installAsset.name);
    if (!expected || !SHA256_PATTERN.test(expected)) {
      throw new UpdateError('checksum', `The release checksums do not list ${release.installAsset.name}.`);
    }

    return expected;
  }

  async function streamToFile(response, filePath, {
    expectedSize,
    controller,
    onProgress,
  }) {
    const declaredSize = Number(response.headers.get('content-length')) || null;
    const totalBytes = expectedSize || declaredSize;
    const hash = crypto.createHash('sha256');
    const reader = response.body.getReader();
    const file = await fs.promises.open(filePath, 'w');
    let receivedBytes = 0;
    let lastProgressAt = 0;
    let stallTimer = null;

    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(new UpdateError('stalled', 'The download stopped responding.')), DOWNLOAD_STALL_TIMEOUT_MS);
    };

    try {
      onProgress({
        receivedBytes,
        totalBytes,
      });
      armStallTimer();

      for (;;) {
        const {
          done,
          value,
        } = await reader.read();
        if (done) break;

        armStallTimer();
        await file.write(value);
        hash.update(value);
        receivedBytes += value.byteLength;

        if (totalBytes && receivedBytes > totalBytes) {
          throw new UpdateError('size', 'The download is larger than the release reported.');
        }

        const now = Date.now();
        if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
          lastProgressAt = now;
          onProgress({
            receivedBytes,
            totalBytes,
          });
        }
      }
    } finally {
      clearTimeout(stallTimer);
      await file.close();
    }

    if (receivedBytes === 0) throw new UpdateError('empty', 'The update server returned an empty file.');
    if (totalBytes && receivedBytes !== totalBytes) {
      throw new UpdateError('incomplete', 'The connection closed before the download finished.');
    }

    onProgress({
      receivedBytes,
      totalBytes: totalBytes || receivedBytes,
    });

    return hash.digest('hex');
  }

  async function download({
    onProgress = () => { },
  } = {}) {
    if (activeDownload) return {
      ok: false,
      code: 'busy',
      message: 'An update is already downloading.',
    };

    const release = latestRelease;
    if (!release || !canApplyUpdates || release.installMode === INSTALL_MODES.manual || !release.installAsset) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'There is no update to download for this build.',
      };
    }

    const controller = new AbortController();
    activeDownload = controller;
    downloadedFile = null;

    const fileName = toSafeAssetFileName(release.installAsset.name);
    const finalPath = fileName ? path.join(downloadDir, fileName) : null;
    const partialPath = finalPath ? `${finalPath}.partial` : null;

    try {
      if (!finalPath) throw new UpdateError('untrusted', 'The release installer has an invalid file name.');
      if (!isTrustedReleaseDownloadUrl(release.installAsset.url, repository)) {
        throw new UpdateError('untrusted', 'The release installer is not hosted by this repository.');
      }

      await fs.promises.mkdir(downloadDir, {
        recursive: true,
      });
      const expectedChecksum = await fetchExpectedChecksum(release, controller.signal);

      const response = await fetchImpl(release.installAsset.url, {
        headers: requestHeaders('application/octet-stream'),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new UpdateError('http', `The download failed with HTTP ${response.status}.`);
      }

      const actualChecksum = await streamToFile(response, partialPath, {
        expectedSize: release.installAsset.size,
        controller,
        onProgress,
      });

      if (expectedChecksum && actualChecksum !== expectedChecksum) {
        throw new UpdateError('checksum', 'The downloaded installer did not match the published checksum.');
      }

      await fs.promises.rm(finalPath, {
        force: true,
      });
      await fs.promises.rename(partialPath, finalPath);
      downloadedFile = {
        path: finalPath,
        installMode: release.installMode,
        version: release.version,
      };

      logger?.info('Update downloaded', {
        version: release.version,
        file: fileName,
        verified: Boolean(expectedChecksum),
      });

      return {
        ok: true,
        version: release.version,
        verified: Boolean(expectedChecksum),
      };
    } catch (error) {
      if (partialPath) await fs.promises.rm(partialPath, {
        force: true,
      }).catch(() => { });

      const reason = controller.signal.reason;
      if (controller.signal.aborted && !(reason instanceof UpdateError)) {
        logger?.info('Update download canceled');
        return {
          ok: false,
          code: 'canceled',
          message: 'The download was canceled.',
        };
      }

      const failure = reason instanceof UpdateError ? reason : error;
      logger?.warn('Update download failed', {
        message: failure?.message,
      });
      return {
        ok: false,
        code: failure?.code || 'failed',
        message: describeError(failure),
      };
    } finally {
      if (activeDownload === controller) activeDownload = null;
    }
  }

  function cancelDownload() {
    activeDownload?.abort();
  }

  async function install() {
    if (!downloadedFile) {
      return {
        ok: false,
        message: 'No downloaded update is ready to install.',
      };
    }

    try {
      if (downloadedFile.installMode === INSTALL_MODES.installer) {
        await launchInstaller(downloadedFile.path);
      } else if (downloadedFile.installMode === INSTALL_MODES.diskImage) {
        await openDiskImage(downloadedFile.path);
      } else {
        throw new UpdateError('unavailable', 'This build cannot install updates automatically.');
      }

      logger?.info('Update installer launched', {
        version: downloadedFile.version,
      });
      return {
        ok: true,
      };
    } catch (error) {
      logger?.error('Could not launch the update installer', {
        message: error?.message,
      });
      return {
        ok: false,
        message: describeError(error),
      };
    }
  }

  /** Removes installers left behind by earlier sessions. */
  async function cleanupStaleDownloads() {
    await fs.promises.rm(downloadDir, {
      recursive: true,
      force: true,
    }).catch(() => { });
  }

  return {
    cancelDownload,
    check,
    cleanupStaleDownloads,
    download,
    install,
  };
}

module.exports = {
  UpdateError,
  createUpdateService,
  describeError,
};
