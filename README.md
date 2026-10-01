# Dialoggo
<p align="center">
![Dialoggo logo lol](public/assets/img/packs/bk/loggo/i1.png)
</p>
Dialoggo is an Electron desktop app for building and playing retro dialogue scenes inspired by Banjo-Kazooie and Banjo-Tooie. Pick a character and backdrop, write a line, then preview it with animated sprites and voice clips.

<p align="center">
  <a href="https://github.com/ponkis/dialoggo/actions/workflows/ci.yml"><img src="https://github.com/ponkis/dialoggo/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b72e8.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Node.js-20.11%2B-43853d.svg" alt="Node.js 20.11 or newer">
</p>

## Features

- Write and format dialogue with emphasis, italics, and strikethrough.
- Choose animated characters and scene backgrounds from the included packs.
- Preview speech playback with character-specific voice clips and playback controls.
- Add custom character sprites and keep favorites close at hand.
- Adjust the scene with mirror and low-resolution N64-style display modes.
- Capture a finished scene from the built-in export panel.

## Requirements

- Node.js 20.11 or newer
- npm (included with Node.js)
- Windows, macOS, or Linux with a desktop environment

## Get started

```bash
git clone https://github.com/ponkis/dialoggo.git
cd dialoggo
npm ci
npm start
```

## Development commands

| Command | Purpose |
| --- | --- |
| `npm start` | Run Dialoggo from source. |
| `npm test` | Check project metadata and repository hygiene. |
| `npm run build` | Create the runnable Electron bundle in `dist/`. |
| `npm run start:dist` | Launch the generated bundle. |
| `npm run verify` | Run metadata checks, build the app, and audit dependency licenses. |
| `npm run audit:deps` | Check npm dependencies for known advisories. |
| `npm run audit:licenses` | Check dependency licenses against the project policy. |

The build creates app files; it does not create a platform installer. `dist/` is generated locally and is ignored by Git.

## Architecture

```text
src/
├── main/                 Electron lifecycle, window, IPC, paths, and logging
├── renderer/
│   ├── controllers/      User input and application flows
│   ├── domain/           Dialogue formatting and speech timing
│   ├── models/           Dialogue state and asset catalogues
│   ├── runtime/          Preload bridge access
│   ├── services/         Audio loading and playback
│   └── views/            DOM, canvas, panels, and animation
└── shared/               Product metadata and security helpers

public/                   HTML shell, visual assets, data, sounds, and fonts
scripts/                  Build, metadata validation, and license audits
docs/                     Architecture, development, and release guides
```

The Electron preload exposes a small `window.dialoggo` API for asset access, logging, and window controls. See [Architecture](docs/ARCHITECTURE.md) for the process flow and security boundary.

## Project guides

- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)
- [Release process](docs/RELEASE.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)

## Licensing and bundled media

The application code is licensed under [MIT](LICENSE). That license does not grant rights to third-party images, sounds, fonts, or franchise marks bundled with the app. Read [NOTICE.md](NOTICE.md) before redistributing or reusing any bundled media.
