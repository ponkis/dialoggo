# Contributing

Thank you for helping improve Dialoggo. Small, focused changes are easiest to review.

## Set up a development environment

Dialoggo requires Node.js 20.11 or newer. npm is included with Node.js. From the repository root:

```bash
npm ci
npm start
```

## Before submitting a change

1. Open an issue for a substantial change so its scope can be discussed first.
2. Do not include generated output, dependency folders, credentials, personal data, or media whose redistribution rights are unclear.
3. Update the relevant documentation when behavior or architecture changes.
4. Run `npm run verify`. This checks repository metadata, builds the app bundle, and audits dependency licenses.
5. If a change affects Electron window behavior, manually check both the source app and the generated bundle with `npm run start:dist`.
6. Follow the process boundaries in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Keep renderer code on the narrow preload bridge; do not expose general Node APIs or unrestricted IPC.
7. Preserve the Content Security Policy and validate new file paths or external URLs at the privileged boundary.
8. The build copies everything in `public/` into the app bundle. Verify rights and add attribution for third-party media; review [NOTICE.md](NOTICE.md).

## Pull requests

- Explain the user-visible effect and motivation.
- Keep each pull request focused and leave unrelated cleanup out.
- Include screenshots or recordings for visual changes when they make the result easier to review.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
