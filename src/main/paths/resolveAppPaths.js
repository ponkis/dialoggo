const fs = require('fs');
const path = require('path');

function findExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function resolveAppPaths() {
  const candidateRoots = [
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..'),
  ];

  const appRoot = candidateRoots.find((candidate) => {
    return fs.existsSync(path.join(candidate, 'public', 'index.html'));
  }) || candidateRoots[0];

  const publicDir = path.join(appRoot, 'public');

  return {
    appRoot,
    publicDir,
    indexHtmlPath: path.join(publicDir, 'index.html'),
    iconPath: path.join(publicDir, 'favicon.ico'),
    packageJsonPath: path.join(appRoot, 'package.json'),
    preloadPath: findExistingPath([
      path.join(appRoot, 'main', 'preload.js'),
      path.join(appRoot, 'src', 'main', 'preload.js'),
    ]),
    rendererEntryPath: findExistingPath([
      path.join(appRoot, 'src', 'renderer', 'index.js'),
      path.join(publicDir, 'assets', 'js', 'app.js'),
    ]),
  };
}

module.exports = {
  resolveAppPaths
};