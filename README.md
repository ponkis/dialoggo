# Dialoggo

Banjo-Kazooie / Tooie dialogue generator built with Electron.

## Architecture

The app is organized around a lightweight MVC-style structure with a hardened Electron shell:

```text
src/
  main/
    index.js                  # Electron lifecycle entry
    ipc/                      # Main-process IPC handlers
    logging/                  # Local file logging
    preload.js                # Context bridge + renderer bootstrap
    security/                 # URL / Electron safety helpers
    windows/                  # BrowserWindow setup
  renderer/
    index.js                  # Renderer entry
    controllers/              # App orchestration and event wiring
    models/                   # State, asset discovery, constants
    runtime/                  # Bridge access helpers
    services/                 # Audio and runtime services
    views/                    # DOM, rendering, animations, layout helpers
  shared/
    security/                 # Safe JSON and path utilities

public/
  index.html                  # Renderer shell
  assets/
    css/
    img/
    snd/
```

## Notes

- `src/main` keeps Electron-specific code out of `public`.
- `src/main/preload.js` exposes a minimal bridge instead of giving the renderer direct Node access.
- `src/renderer/models` owns application state and asset discovery.
- `src/renderer/views` contains DOM-heavy behavior like sprite rendering, startup animations, and panel transitions.
- `src/renderer/controllers` coordinates playback, settings, and user interaction.
- `src/renderer/services` holds audio playback and caching logic.

## Build

- `npm start`: run the source app directly.
- `npm run build`: create an obfuscated production bundle in `dist/`.
- `npm run start:dist`: launch the bundled app from `dist/`.
- `npm run audit:deps`: run `npm audit`.
- `npm run audit:licenses`: fail if GPL-family licenses are detected in `node_modules`.
- `npm run licenses:summary`: print a dependency license summary.

The build process uses Webpack to bundle the Electron main process, preload script, and renderer separately, then writes a runnable `dist/package.json` and copies the static public assets into the distribution folder.

## Security

- Electron runs with `contextIsolation: true` and `nodeIntegration: false`, with a narrow preload bridge for the renderer.
- The preload bridge only exposes the window controls, logging, and a restricted asset-file API.
- Renderer file access is restricted to the packaged `public/` asset tree.
- JSON reads are size-limited and sanitized before use.
- Audio is lazy-loaded and the in-memory audio cache is bounded.
- Local logs are written with `electron-log`.
- Electron crash reporting is enabled in local-only mode (`uploadToServer: false`) so no crash data is sent anywhere by default.

## Licensing

- The application code is licensed under MIT. `package.json` and `LICENSE` are aligned to that license.
- See [NOTICE.md](./NOTICE.md) for the important distinction between the MIT-licensed application code and any bundled franchise-owned media or trademarks.
