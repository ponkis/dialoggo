const fs = require('fs');
const path = require('path');

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
  };
}

module.exports = { resolveAppPaths };
