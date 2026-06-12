# Architecture

Dialoggo is an Electron desktop app with a small MVC-style renderer and a hardened main-process boundary.

## Runtime Boundaries

- `src/main` owns the Electron lifecycle, window creation, IPC handlers, crash reporting, and logging.
- `src/main/preload.js` exposes a narrow `window.dialoggo` bridge. The renderer does not receive direct Node access.
- `src/renderer/models` discovers bundled assets, normalizes configuration, and owns app state constants.
- `src/renderer/views` owns DOM rendering, sprite drawing, panels, animation, and layout behavior.
- `src/renderer/controllers` wires user input, playback flow, settings, favorites, and view updates.
- `src/renderer/services` contains runtime services such as audio loading, playback, and cache control.
- `src/shared` contains code that is safe to use across Electron contexts.

## Branding And Versioning

`package.json` is the source of truth for the app version. Shared product metadata lives in `src/shared/appMetadata.js`, and the preload bridge exposes the runtime values to the renderer.

The production baseline is `1.0.0`. Future releases should update `package.json`, `package-lock.json`, and `CHANGELOG.md` together.

## Assets

Bundled assets live under `public/assets`. The preload bridge restricts renderer file reads to the packaged `public` tree and converts safe paths to `file:` URLs when needed.

The app may use approved external brand resources such as Google Fonts and the Ponkis logo. Keep those allowances explicit in the HTML Content Security Policy.
