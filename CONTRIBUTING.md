# Contributing

Thanks for helping improve Dialoggo. Bug reports, clear feature proposals, and focused pull requests are welcome.

## Before opening a pull request

1. Open an issue for a substantial change so its scope can be discussed first.
2. Keep each pull request focused and describe the user-visible effect.
3. Do not include generated output, dependency folders, credentials, personal data, or media whose redistribution rights are unclear.
4. Update the relevant documentation when behavior or architecture changes.

## Local checks

Install dependencies and run the app with `npm ci` and `npm start`. Before submitting, run:

```bash
npm run verify
```

This checks repository metadata, builds the app bundle, and audits dependency licenses. If a change affects Electron window behavior, manually check the source app and the generated bundle with `npm run start:dist`.

## Architecture and security

Follow the process boundaries in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Keep renderer code on the narrow preload bridge; do not expose general Node APIs or unrestricted IPC. Preserve the Content Security Policy and validate any new file paths or external URLs at the privileged boundary.

The build copies everything in `public/` into the app bundle. Verify rights and add attribution for third-party media before adding assets; review [NOTICE.md](NOTICE.md).

