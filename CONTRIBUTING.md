# Contributing

Thank you for helping improve Dialoggo. Bug reports, clear feature proposals, and small, focused pull requests are welcome.

## Set up a development environment

Dialoggo requires Node.js 22.12 or newer. npm is included with Node.js. From the repository root:

```bash
npm ci
npm start
```

## Before submitting a change

1. Open an issue for a substantial change so its scope can be discussed first.
2. Do not include generated output, dependency folders, credentials, personal data, or media whose redistribution rights are unclear.
3. Update the relevant documentation when behavior or architecture changes.
4. Base your branch on `dev` and open pull requests against `dev`. `main` only receives promotions from `dev`.
5. Run `npm run verify`. This lints the code, checks repository metadata, runs the tests, builds the app bundle, and audits dependency licenses.
6. If a change affects Electron window behavior, check the source app with `npm start` and the packaged app with `npm run package:dir`.
7. Follow the process boundaries in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Keep renderer code on the narrow preload bridge. Do not expose general Node APIs or unrestricted IPC, and keep the renderer sandboxed.
8. Preserve the Content Security Policy and validate new file paths or external URLs at the privileged boundary.
9. The build copies everything in `public/` into the app bundle. Verify rights and add attribution for third-party media, and review [NOTICE.md](NOTICE.md).

## Pull requests

- Explain the user-visible effect and motivation.
- Keep each pull request focused and leave unrelated cleanup out.
- Add or update tests for logic changes, and include screenshots or recordings for visual changes.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
