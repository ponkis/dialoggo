# Release Process

Use this checklist before tagging or packaging Dialoggo. The GitHub Actions workflow runs the metadata validator, production build, and dependency-license audit on pushes and pull requests.

## Versioning

Dialoggo uses semantic versioning.

- Patch: bug fixes, metadata fixes, asset corrections, or small UI polish.
- Minor: backwards-compatible features or new bundled content.
- Major: breaking project structure, data format, or runtime behavior changes.

The initial production baseline is `1.0.0`.

## Checklist

1. Update `package.json` and the `package-lock.json` root version together.
2. Add the release notes to `CHANGELOG.md`.
3. Run `npm run verify` and resolve any failures.
4. Launch the bundle with `npm run start:dist` and smoke-test character selection, playback, backgrounds, settings, and export controls.
5. Review `NOTICE.md` before redistributing any bundled media.
6. Tag the release with the same version as `package.json`.
