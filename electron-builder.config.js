// electron-builder configuration. Packages the already-bundled dist/ folder
// (produced by `npm run build`), so the installer contains no node_modules.
//
// DIALOGGO_ENV=development produces a side-by-side "Dialoggo Development"
// install with its own app id, name, and settings folder.
const {
  APP_METADATA,
} = require('./src/shared/appMetadata');

const isDevelopment = process.env.DIALOGGO_ENV === 'development';
const productName = isDevelopment ? `${APP_METADATA.productName} Development` : APP_METADATA.productName;
const artifactBaseName = isDevelopment ? 'Dialoggo-Development' : 'Dialoggo';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: isDevelopment ? `${APP_METADATA.appId}.dev` : APP_METADATA.appId,
  productName,
  copyright: APP_METADATA.copyright,
  directories: {
    app: 'dist',
    output: 'release',
    buildResources: 'build',
  },
  files: [
    '**/*',
  ],
  asar: true,
  icon: 'build/icon.png',
  artifactName: `${artifactBaseName}-\${version}-\${os}-\${arch}.\${ext}`,
  publish: null,
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: productName,
    artifactName: `${artifactBaseName}-\${version}-win-\${arch}-setup.\${ext}`,
  },
  mac: {
    category: 'public.app-category.entertainment',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    // Releases are unsigned until a Developer ID certificate is configured.
    identity: null,
  },
  linux: {
    category: 'Graphics',
    maintainer: APP_METADATA.author,
    synopsis: 'Retro dialogue scene editor',
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'tar.gz',
        arch: ['x64'],
      },
    ],
  },
};
