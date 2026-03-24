const path = require('path');
const fs = require('fs');
const {
  contextBridge,
  ipcRenderer,
} = require('electron');
const {
  resolveAppPaths,
} = require('./paths/resolveAppPaths');
const {
  safeReadJsonFile,
} = require('../shared/security/safeJson');
const {
  assertSafeAbsolutePath,
  toSafeFileUrl,
} = require('../shared/security/safePaths');

const appPaths = resolveAppPaths();
const assetsPaths = {
  publicDir: appPaths.publicDir,
  assetsDir: path.join(appPaths.publicDir, 'assets'),
  dataDir: path.join(appPaths.publicDir, 'assets', 'data'),
  imgDir: path.join(appPaths.publicDir, 'assets', 'img'),
  sndDir: path.join(appPaths.publicDir, 'assets', 'snd'),
  charDataDir: path.join(appPaths.publicDir, 'assets', 'data', 'char'),
  charImgDir: path.join(appPaths.publicDir, 'assets', 'img', 'char'),
  charSndDir: path.join(appPaths.publicDir, 'assets', 'snd', 'char'),
  guiImgDir: path.join(appPaths.publicDir, 'assets', 'img', 'gui'),
  guiAnimDir: path.join(appPaths.publicDir, 'assets', 'img', 'gui', 'anim'),
};

const allowedRendererRoots = [appPaths.publicDir];
const packageJson = safeReadJsonFile(appPaths.packageJsonPath, {
  fallback: {},
  label: 'Application package.json',
  maxBytes: 32 * 1024,
});

function resolveRendererPath(targetPath) {
  return assertSafeAbsolutePath(targetPath, allowedRendererRoots, 'renderer asset path');
}

function serializeDirectoryEntries(entries) {
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }));
}

function existsSync(targetPath) {
  try {
    return fs.existsSync(resolveRendererPath(targetPath));
  } catch {
    return false;
  }
}

function readdirSync(targetPath, options = {}) {
  const safePath = resolveRendererPath(targetPath);
  const withFileTypes = options.withFileTypes === true;
  const entries = fs.readdirSync(safePath, {
    withFileTypes
  });
  return withFileTypes ? serializeDirectoryEntries(entries) : entries;
}

function readJsonFile(targetPath, options = {}) {
  const safePath = resolveRendererPath(targetPath);
  return safeReadJsonFile(safePath, {
    fallback: options.fallback,
    label: options.label || 'Renderer JSON file',
    maxBytes: options.maxBytes,
  });
}

function readBinaryFile(targetPath, options = {}) {
  const safePath = resolveRendererPath(targetPath);
  const stats = fs.statSync(safePath);

  if (!stats.isFile()) {
    throw new Error(`Binary asset path is not a file: ${targetPath}`);
  }

  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : 8 * 1024 * 1024;
  if (stats.size > maxBytes) {
    throw new Error(`Binary asset exceeds the ${maxBytes}-byte limit: ${targetPath}`);
  }

  const buffer = fs.readFileSync(safePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function sendWindowControl(channel) {
  ipcRenderer.send(channel);
}

function logMessage(level, message, meta) {
  ipcRenderer.send('app-log', {
    level,
    message,
    meta,
  });
}

const bridge = {
  runtime: {
    appVersion: packageJson.version || '0.0.0',
    platform: process.platform,
    paths: assetsPaths,
  },
  path: {
    join: (...segments) => path.join(...segments.map((segment) => String(segment))),
    extname: (targetPath) => path.extname(String(targetPath || '')),
  },
  files: {
    existsSync,
    readdirSync,
    readJsonFile,
    readBinaryFile,
    toFileUrl(targetPath) {
      return toSafeFileUrl(targetPath, allowedRendererRoots, 'renderer asset path');
    },
  },
  windowControls: {
    minimize() {
      sendWindowControl('window-minimize');
    },
    close() {
      sendWindowControl('window-close');
    },
  },
  log: {
    debug(message, meta) {
      logMessage('debug', message, meta);
    },
    info(message, meta) {
      logMessage('info', message, meta);
    },
    warn(message, meta) {
      logMessage('warn', message, meta);
    },
    error(message, meta) {
      logMessage('error', message, meta);
    },
  },
};

globalThis.dialoggo = bridge;
contextBridge.exposeInMainWorld('dialoggo', bridge);

window.addEventListener('DOMContentLoaded', () => {
  try {
    require('../renderer/index.js');
  } catch (error) {
    console.error('[Dialoggo] preload failed to load renderer entry', error);
    logMessage('error', 'Preload failed to load renderer entry', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
  }
});
