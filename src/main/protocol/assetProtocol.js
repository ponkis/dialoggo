const fs = require('fs');
const path = require('path');
const {
  pathToFileURL,
} = require('url');
const {
  APP_PROTOCOL,
} = require('../../shared/appMetadata');
const {
  isPathInsideRoot,
} = require('../security/safePaths');

/**
 * Must run before `app.whenReady()`. A standard + secure scheme gets a real
 * origin (so localStorage, fetch, and CSP 'self' work) without file:// access.
 */
function registerAssetSchemePrivileges(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL.scheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Maps a dialoggo://app/<path> URL onto a file inside rootDir. Returns null for
 * anything that is not a plain request for a file under that root.
 */
function resolveAssetRequestPath(requestUrl, rootDir) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${APP_PROTOCOL.scheme}:` || url.host !== APP_PROTOCOL.host) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  // Backslashes are separators on Windows only; reject them everywhere so the
  // same URL can never resolve differently between platforms.
  if (relativePath.includes('\0') || relativePath.includes('\\')) return null;

  const normalizedRelativePath = relativePath.replace(/^\/+/, '') || 'index.html';
  const targetPath = path.resolve(rootDir, normalizedRelativePath);
  return isPathInsideRoot(rootDir, targetPath) ? targetPath : null;
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function registerAssetProtocolHandler({
  protocol,
  net,
  rootDir,
  logger,
}) {
  protocol.handle(APP_PROTOCOL.scheme, async (request) => {
    const targetPath = resolveAssetRequestPath(request.url, rootDir);
    if (!targetPath) {
      logger.warn('Blocked asset protocol request', {
        url: request.url,
      });
      return notFound();
    }

    try {
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) return notFound();
    } catch {
      return notFound();
    }

    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function toAssetUrl(absolutePath, rootDir) {
  const relativePath = path.relative(rootDir, absolutePath);
  const encodedPath = relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${APP_PROTOCOL.origin}/${encodedPath}`;
}

module.exports = {
  registerAssetProtocolHandler,
  registerAssetSchemePrivileges,
  resolveAssetRequestPath,
  toAssetUrl,
};
