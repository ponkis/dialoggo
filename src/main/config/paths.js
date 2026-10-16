const path = require('path');

/**
 * Every entry point runs from the bundled layout produced by `npm run build`
 * (also used by `npm start`), so paths are fixed relative to the main bundle:
 *
 *   dist/main/index.js        main process
 *   dist/preload/index.js     sandboxed preload
 *   dist/renderer/index.html  renderer page, scripts, and public assets
 */
function resolveAppPaths(mainDir = __dirname) {
  const appRoot = path.resolve(mainDir, '..');
  const rendererDir = path.join(appRoot, 'renderer');
  const assetsDir = path.join(rendererDir, 'assets');

  return Object.freeze({
    appRoot,
    rendererDir,
    assetsDir,
    indexHtmlPath: path.join(rendererDir, 'index.html'),
    iconPath: path.join(rendererDir, 'favicon.ico'),
    preloadPath: path.join(appRoot, 'preload', 'index.js'),
  });
}

module.exports = {
  resolveAppPaths,
};
