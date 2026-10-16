# Development setup

## Prerequisites

- Node.js 22.12 or newer (npm included)
- Windows, macOS, or Linux with a desktop environment

## Install and run

```bash
npm ci
npm start
```

`npm start` builds unminified development bundles into `dist/`, then launches Electron on them. Public assets are synced incrementally, so after the first run only changed files are copied. Restart `npm start` after changing main-process or preload code. For renderer-only changes, rebuild and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> in the window.

Development runs use the `Dialoggo Development` app name, so their settings, favorites, and logs never mix with an installed copy.

## Checks

```bash
npm run lint        # ESLint
npm run validate    # repository and security-posture checks
npm test            # unit + integration tests (node:test)
npm run build       # production bundle
npm run test:smoke  # launch dist/ and wait for the renderer to report ready
npm run verify      # lint + validate + test + build + license audit
```

The smoke test sets `DIALOGGO_SMOKE_TEST=1`. In that mode the main process exits with code 0 once the renderer finishes startup, or with code 1 on a load failure, renderer crash, or timeout. On Linux without a display, run it under `xvfb-run`.

## Packaging

```bash
npm run package       # production installers for the current OS -> release/
npm run package:dir   # unpacked app only, for a quick local check
npm run package:dev   # "Dialoggo Development" installer, installs side by side
```

| OS | Outputs |
| --- | --- |
| Windows | NSIS installer (`-setup.exe`) and portable `.zip` |
| macOS | `.dmg` and `.zip` for x64 and arm64 (unsigned) |
| Linux | `.AppImage` and `.tar.gz` |

## Where to make changes

- **Main process** (`src/main/`): lifecycle, windows, protocol, file access, and IPC. Validate every IPC input and sender.
- **Preload** (`src/preload/`): keep it a thin facade over IPC. It is sandboxed and can only require `electron` and bundled shared modules.
- **Renderer feature** (`src/renderer/features/<name>/`): put DOM work in the feature's view and input handling in its controller. Wire new dependencies in `src/renderer/app/startApp.js`.
- **Pure logic** (`src/renderer/domain/`, `src/shared/`): keep it free of DOM and Electron, and add tests under `test/unit/`.
- **Assets** (`public/assets/`): characters live in `data|img|snd/packs/<pack>/<character>/` and backgrounds in `data|img/backgrounds/<pack>/<background>/`. The catalog picks them up automatically.

Update [ARCHITECTURE.md](ARCHITECTURE.md) when a change moves a responsibility across process boundaries. Update [SMOKE_TEST.md](../SMOKE_TEST.md) when it changes something a release tester should check.

Before adding any third-party media, confirm its redistribution rights and record the source and terms in [NOTICE.md](../NOTICE.md).
