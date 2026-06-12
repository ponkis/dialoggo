# Dialoggo

Dialoggo is a retro dialogue generator for Banjo-Kazooie and Banjo-Tooie style scenes. It is made by ponkis and ships as an Electron desktop app.

Current baseline: `1.0.0`

## Quick Start

```bash
npm install
npm start
```

## Commands

```bash
npm start              # Run the source app
npm run build          # Build the production bundle into dist/
npm run start:dist     # Run the production bundle
npm test               # Validate project metadata and repo hygiene
npm run verify         # Validate, build, and audit bundled dependency licenses
npm run audit:deps     # Run npm audit
npm run audit:licenses # Fail on GPL-family dependency licenses
```

## Project Structure

```text
src/
  main/       Electron lifecycle, windows, IPC, logging, and preload
  renderer/   App model, view, controller, runtime helpers, and services
  shared/     Cross-context metadata and security helpers

public/
  index.html  Renderer shell
  assets/     Bundled data, images, sounds, fonts, CSS, and vendor assets

scripts/      Build, validation, and audit utilities
docs/         Architecture and release notes
```

## Production Notes

- `package.json` is the source of truth for versioning. The production baseline is `1.0.0`.
- App branding is centralized in `src/shared/appMetadata.js` and exposed to the renderer through the preload bridge.
- The production build writes a runnable Electron bundle to `dist/`; `dist/` is generated and ignored by git.
- `package-lock.json` is committed for reproducible app installs.
- The public shell intentionally uses external brand resources for Google Fonts and the Ponkis logo.
- The renderer reads assets only through the restricted preload bridge.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Release process](docs/RELEASE.md)
- [Changelog](CHANGELOG.md)

## Licensing

Application code is licensed under MIT. See [NOTICE.md](NOTICE.md) before redistributing bundled media or trademarked franchise assets.
