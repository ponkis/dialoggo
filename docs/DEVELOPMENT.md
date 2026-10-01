# Development setup

## Prerequisites

- Node.js 20.11 or newer
- npm
- A Windows, macOS, or Linux desktop environment for launching Electron

## Install and run

```bash
npm ci
npm start
```

`npm ci` installs the locked dependency versions. `npm start` compiles the renderer page bundle into the ignored `public/assets/js/app.js`, then opens the source Electron main process with the preload bridge and public assets.

## Build the app bundle

```bash
npm run build
npm run start:dist
```

The build copies the public assets to `dist/public/`, bundles the main, preload, and renderer entry points, and writes a small `dist/package.json`. It does not create a signed installer. Generated files in `dist/` are ignored by Git.

## Repository checks

```bash
npm test
npm run build
npm run audit:licenses
```

`npm run verify` runs these three checks in sequence. `npm run audit:deps` runs the npm advisory audit separately and may require network access.

## Where to make changes

- Keep Electron lifecycle, window configuration, IPC registration, and privileged integrations in `src/main/`.
- Keep the renderer on the `window.dialoggo` bridge; add a narrowly scoped bridge operation when the UI needs a new privileged capability.
- Keep renderer input and application flow in `AppController`, application data/state in `AppModel`, DOM and canvas rendering in `AppView`, and audio operations in `AudioService`.
- Keep dialogue formatting and speech timing rules in the pure modules under `src/renderer/domain/` so they remain separate from DOM, asset, and Electron concerns.
- Keep packaged character/background data and media under `public/assets/` with the matching configuration files.
- Update the architecture docs when a change moves a responsibility across process boundaries.

Before adding any third-party media, confirm its redistribution rights and record the source and terms in [NOTICE.md](../NOTICE.md). The app bundle copies the entire `public/` directory.

