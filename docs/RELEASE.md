# Release process

## Branch flow

```text
work on dev -> push dev -> CI + dev builds -> promote dev to main -> vX.Y.Z tag -> Release workflow
```

| Branch / ref | What happens |
| --- | --- |
| Any push or pull request | **CI** (`ci.yml`): lint, validate, tests, production build, and smoke test on Ubuntu and Windows, plus license and dependency audits. |
| Push to `dev` | **Dev Build** (`dev-build.yml`): side-by-side `Dialoggo Development` builds for Windows, macOS, and Linux, uploaded as workflow artifacts for 14 days. |
| Tag `vX.Y.Z` on `main` | **Release** (`release.yml`): checks that the tag matches `package.json` and that the tag points at a commit on `main`. Then it runs `npm run verify`, packages all three platforms, writes `SHA256SUMS.txt`, and publishes the GitHub release. |

Keep `main` releasable. Do day-to-day work on `dev`, and only merge into `main` through promotion.

## Versioning

Dialoggo uses semantic versioning, and `package.json` is the single source of truth.

- Patch: bug fixes, metadata fixes, asset corrections, or small UI polish.
- Minor: backwards-compatible features or new bundled content.
- Major: breaking project structure, data format, or runtime behavior changes.

A version with a prerelease suffix (for example `1.2.0-beta.1`) is published as a GitHub prerelease.

## Releasing

This works like Mystral: you change one file, commit, and run one script.

1. On `dev`, change `"version"` in `package.json` (for example `1.0.0` to `1.0.1`), and add notes to `CHANGELOG.md`.
2. Commit and push `dev`.
3. Run:

   ```bash
   npm run promote:release
   ```

The script merges `dev` into `main`, pushes `main`, then creates and pushes the `vX.Y.Z` tag. The Release workflow builds every platform and publishes the GitHub release. Installed copies of Dialoggo offer the update the next time they start.

To merge into `main` without releasing, run `npm run promote`.

## Re-running a release

You can start the Release workflow manually from `main` to rebuild the current version. It fails if a release for that tag already exists, so delete the existing GitHub release first.

## Code signing

Builds are currently unsigned. To sign them later, add the certificate secrets that electron-builder expects (`CSC_LINK` and `CSC_KEY_PASSWORD`, plus Apple notarization credentials for macOS). Then remove `CSC_IDENTITY_AUTO_DISCOVERY: "false"` from the release workflow and `identity: null` from `electron-builder.config.js`.
