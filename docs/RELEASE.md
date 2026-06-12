# Release Process

Use this checklist before tagging or packaging Dialoggo.

## Versioning

Dialoggo uses semantic versioning.

- Patch: bug fixes, metadata fixes, asset corrections, or small UI polish.
- Minor: backwards-compatible features or new bundled content.
- Major: breaking project structure, data format, or runtime behavior changes.

The initial production baseline is `1.0.0`.

## Checklist

1. Update `package.json` and `package-lock.json` to the target version.
2. Add the release notes to `CHANGELOG.md`.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm run audit:licenses`.
6. Launch the bundle with `npm run start:dist` and smoke-test character selection, playback, backgrounds, settings, and export controls.
7. Review `NOTICE.md` before redistributing any bundled media.
