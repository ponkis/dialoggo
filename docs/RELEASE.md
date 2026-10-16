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

## Checklist

1. On `dev`, bump the version. This updates `package.json` and the lockfile together without creating a tag:

   ```bash
   npm version minor --no-git-tag-version
   ```

2. Add the release notes to `CHANGELOG.md`.
3. Run `npm run verify` and fix any failures.
4. Run `npm run package` and work through [SMOKE_TEST.md](../SMOKE_TEST.md) with the packaged build.
5. Review `NOTICE.md` if bundled media changed.
6. Commit and push `dev`. Wait for CI to pass.
7. Promote and release:

   ```bash
   npm run promote:release
   ```

   This merges `dev` into `main` with a merge commit, pushes `main`, then creates and pushes the `vX.Y.Z` tag. The Release workflow takes it from there.

To promote without releasing, run `npm run promote`. Add `-- --dry-run` to preview the push and tag steps.

## Re-running a release

You can start the Release workflow manually from `main` to rebuild the current version. It fails if a release for that tag already exists, so delete the existing GitHub release first.

## Code signing

Builds are currently unsigned. To sign them later, add the certificate secrets that electron-builder expects (`CSC_LINK` and `CSC_KEY_PASSWORD`, plus Apple notarization credentials for macOS). Then remove `CSC_IDENTITY_AUTO_DISCOVERY: "false"` from the release workflow and `identity: null` from `electron-builder.config.js`.
