const fs = require('fs');
const path = require('path');
const {
  createCompareUrl,
  isNewerRelease,
} = require('../../../shared/releaseVersion');

const FILE_NAME = 'last-run-version';

/**
 * Records the version that last ran and reports whether this launch is the
 * first one after an update, so the renderer can show "Update installed".
 */
function recordLaunchVersion({
  userDataDir,
  currentVersion,
  repositoryUrl,
}) {
  const filePath = path.join(userDataDir, FILE_NAME);
  let previousVersion = '';

  try {
    previousVersion = fs.readFileSync(filePath, 'utf8').trim().slice(0, 64);
  } catch { }

  try {
    fs.mkdirSync(userDataDir, {
      recursive: true,
    });
    fs.writeFileSync(filePath, currentVersion, 'utf8');
  } catch { }

  if (!previousVersion || !isNewerRelease(currentVersion, previousVersion)) return null;

  return {
    previousVersion,
    currentVersion,
    compareUrl: createCompareUrl(repositoryUrl, previousVersion, currentVersion),
  };
}

module.exports = {
  recordLaunchVersion,
};
