# Dialoggo

Banjo-Kazooie / Tooie dialogue generator built with Electron.

## Architecture

The app is now organized around a lightweight MVC-style structure:

```text
src/
  main/
    index.js                  # Electron lifecycle entry
    ipc/                      # Main-process IPC handlers
    windows/                  # BrowserWindow setup
  renderer/
    index.js                  # Renderer entry
    controllers/              # App orchestration and event wiring
    models/                   # State, asset discovery, constants
    services/                 # Audio and runtime services
    views/                    # DOM, rendering, animations, layout helpers

public/
  index.html                  # Renderer shell
  assets/
    css/
    js/app.js                 # Thin renderer bootstrap
    img/
    snd/
```

## Notes

- `src/main` keeps Electron-specific code out of `public`.
- `src/renderer/models` owns application state and asset discovery.
- `src/renderer/views` contains DOM-heavy behavior like sprite rendering, startup animations, and panel transitions.
- `src/renderer/controllers` coordinates playback, settings, and user interaction.
- `src/renderer/services` holds audio playback and caching logic.

## Build

- `npm start`: run the source app directly.
- `npm run build`: create an obfuscated production bundle in `dist/`.
- `npm run start:dist`: launch the bundled app from `dist/`.

The build process uses Webpack to bundle the Electron main process and renderer separately, then writes a runnable `dist/package.json` and copies the static public assets into the distribution folder.
