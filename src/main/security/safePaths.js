const path = require('path');
const {
  pathToFileURL
} = require('url');

function isPathInsideRoot(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeAbsolutePath(targetPath, allowedRoots, label = 'path') {
  if (typeof targetPath !== 'string' || targetPath.trim() === '' || targetPath.includes('\0')) {
    throw new Error(`Invalid ${label}.`);
  }

  const resolvedTarget = path.resolve(targetPath);
  const isAllowed = allowedRoots.some((rootPath) => isPathInsideRoot(rootPath, resolvedTarget));

  if (!isAllowed) {
    throw new Error(`Blocked ${label}: ${targetPath}`);
  }

  return resolvedTarget;
}

function toSafeFileUrl(targetPath, allowedRoots, label = 'path') {
  const resolvedTarget = assertSafeAbsolutePath(targetPath, allowedRoots, label);
  return pathToFileURL(resolvedTarget).toString();
}

module.exports = {
  assertSafeAbsolutePath,
  isPathInsideRoot,
  toSafeFileUrl,
};