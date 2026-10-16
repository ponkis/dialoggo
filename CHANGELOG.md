# Changelog

All notable changes to Dialoggo are tracked here.

## [Unreleased]

### Added

- Built-in update checker, modeled on Mystral's. It checks GitHub releases at startup or from Settings → Updates, downloads the installer with progress, cancel, and retry, verifies it against the release's `SHA256SUMS.txt`, launches it, and shows "Update installed" with a "What's new?" link after updating.
- A Credits & Legal section in the Guide, a disclaimer in the README, and a rewritten `NOTICE.md` that clarifies ownership of bundled Banjo-Kazooie, Banjo-Tooie, and custom assets.

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
