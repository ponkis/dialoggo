# Changelog

All notable changes to Dialoggo are tracked here.

## [Unreleased]

### Architecture

- Split the code by Electron process into `src/main`, `src/preload`, `src/renderer`, and `src/shared`.
- The main process is now an `Application` class with a single-instance lock, grouped IPC handlers, and sender validation on every channel.
- The renderer now loads from a privileged `dialoggo://` protocol instead of `file://`, and the renderer and preload run with `sandbox: true`.
- Moved asset discovery from the renderer to a main-process `CatalogService`. It reads each asset folder once, so scans are about 3x faster.
- Replaced the single view, controller, and model files with feature modules (playback, dialogue, characters, backgrounds, stage, panels, shortcuts, settings, startup) wired by one composition root.
- Added separate development and production environments with their own app id, name, settings folder, and `-dev` version suffix.

### Tooling

- Added electron-builder packaging: an NSIS installer and zip for Windows, dmg and zip for macOS, and AppImage and tar.gz for Linux.
- Added ESLint, a `node:test` unit and integration suite, and an Electron startup smoke test.
- Added GitHub Actions workflows for CI on every push, development builds from `dev`, and tag-driven releases with SHA-256 checksums.
- Added the `npm run promote` and `npm run promote:release` dev-to-main flow.
- Updated Electron to 41.10.7, which includes upstream security fixes.

### Changed

- DevTools and reload shortcuts now work only in development builds.
- Saved preferences (favorites, recents, settings) start fresh once, because the app now runs from a new origin.

## [1.0.0]

- Established the production baseline for Dialoggo.
- Added centralized app branding for the Electron shell, preload bridge, renderer, and build output.
- Added repository hygiene checks, release documentation, and offline-safe public branding.
