const fs = require('fs');
const path = require('path');
const {
  safeReadJsonFile,
} = require('../../security/safeJson');

const MAX_CONFIG_BYTES = 16 * 1024;
const AUDIO_FILE_PATTERN = /\.(wav|mp3|ogg)$/i;

function createAssetLayout(assetsDir) {
  const dataDir = path.join(assetsDir, 'data');
  const imgDir = path.join(assetsDir, 'img');
  const sndDir = path.join(assetsDir, 'snd');

  return Object.freeze({
    assetsDir,
    dataDir,
    imgDir,
    sndDir,
    packDataDir: path.join(dataDir, 'packs'),
    packImgDir: path.join(imgDir, 'packs'),
    packSndDir: path.join(sndDir, 'packs'),
    backgroundDataDir: path.join(dataDir, 'backgrounds'),
    backgroundImgDir: path.join(imgDir, 'backgrounds'),
    genericImgDir: path.join(imgDir, 'generic'),
    genericSndDir: path.join(sndDir, 'generic'),
    guiImgDir: path.join(imgDir, 'gui'),
    guiSndDir: path.join(sndDir, 'gui'),
    guiAnimDir: path.join(imgDir, 'gui', 'anim'),
  });
}

/**
 * Read-through cache over the asset tree for a single catalog scan. Each
 * directory is listed once and each config is parsed once, which keeps the
 * scan to a few hundred syscalls instead of thousands of stat() calls.
 */
function createFsIndex() {
  const directoryEntries = new Map();
  const configs = new Map();

  function listEntries(directory) {
    const key = path.resolve(directory);
    if (directoryEntries.has(key)) return directoryEntries.get(key);

    let entries;
    try {
      entries = new Map(fs.readdirSync(key, {
        withFileTypes: true,
      }).map((entry) => [entry.name, entry]));
    } catch {
      entries = null;
    }

    directoryEntries.set(key, entries);
    return entries;
  }

  function isDirectory(targetPath) {
    const resolved = path.resolve(targetPath);
    const parent = path.dirname(resolved);
    if (parent === resolved) return listEntries(resolved) !== null;
    return listEntries(parent)?.get(path.basename(resolved))?.isDirectory() === true;
  }

  function exists(targetPath) {
    const resolved = path.resolve(targetPath);
    const parent = path.dirname(resolved);
    if (parent === resolved) return listEntries(resolved) !== null;
    return listEntries(parent)?.has(path.basename(resolved)) === true;
  }

  function listDirectoryNames(directory) {
    const entries = listEntries(directory);
    if (!entries) return [];
    return Array.from(entries.values())
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  function listAudioFiles(directory) {
    const entries = listEntries(directory);
    if (!entries) return [];
    return Array.from(entries.keys())
      .filter((fileName) => AUDIO_FILE_PATTERN.test(fileName))
      .map((fileName) => path.join(directory, fileName));
  }

  function readConfig(configPath, label) {
    const key = path.resolve(configPath);
    if (configs.has(key)) return configs.get(key);

    let config = {};
    if (exists(key)) {
      try {
        const value = safeReadJsonFile(key, {
          fallback: {},
          label,
          maxBytes: MAX_CONFIG_BYTES,
        });
        config = typeof value === 'object' && value !== null ? value : {};
      } catch {
        config = {};
      }
    }

    configs.set(key, config);
    return config;
  }

  return {
    exists,
    isDirectory,
    listAudioFiles,
    listDirectoryNames,
    readConfig,
  };
}

function sortDirectoryNames(directoryNames) {
  return [...directoryNames].sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: 'base',
  }));
}

function sortItemsByDisplayName(items, getDisplayName) {
  return [...items].sort((left, right) => {
    const leftName = String(getDisplayName(left) || '').trim();
    const rightName = String(getDisplayName(right) || '').trim();
    return leftName.localeCompare(rightName, undefined, {
      sensitivity: 'base',
    });
  });
}

function listDirectoryNamesFromRoots(fsIndex, rootDirs, reservedNames = null) {
  const directoryNames = new Set();

  rootDirs.forEach((rootDir) => {
    fsIndex.listDirectoryNames(rootDir).forEach((directoryName) => {
      if (reservedNames?.has(String(directoryName).toLowerCase())) return;
      directoryNames.add(directoryName);
    });
  });

  return sortDirectoryNames(directoryNames);
}

function formatAssetFolderName(folderName) {
  const sanitizedFolderName = String(folderName || '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!sanitizedFolderName) return '';

  return sanitizedFolderName
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getConfiguredDisplayName(folderName, config) {
  const configuredName = String(config?.name || '').trim();
  if (configuredName) return configuredName;
  return formatAssetFolderName(folderName);
}

function createPackSorter(specialPackOrder) {
  return (packs) => [...packs].sort((left, right) => {
    const leftId = String(left?.id || '').toLowerCase();
    const rightId = String(right?.id || '').toLowerCase();
    const leftPriority = specialPackOrder.has(leftId) ? specialPackOrder.get(leftId) : Number.MAX_SAFE_INTEGER;
    const rightPriority = specialPackOrder.has(rightId) ? specialPackOrder.get(rightId) : Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return String(left?.displayName || '').localeCompare(String(right?.displayName || ''), undefined, {
      sensitivity: 'base',
    });
  });
}

module.exports = {
  createAssetLayout,
  createFsIndex,
  createPackSorter,
  formatAssetFolderName,
  getConfiguredDisplayName,
  listDirectoryNamesFromRoots,
  sortItemsByDisplayName,
};
