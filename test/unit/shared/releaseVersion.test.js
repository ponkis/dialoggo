const assert = require('node:assert/strict');
const test = require('node:test');
const {
  compareReleaseVersions,
  createCompareUrl,
  isDevelopmentVersion,
  isNewerRelease,
  parseReleaseVersion,
} = require('../../../src/shared/releaseVersion');

const REPO = 'https://github.com/ponkis/dialoggo';

test('parses tags and plain versions', () => {
  assert.deepEqual(parseReleaseVersion('v1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: [],
    tag: 'v1.2.3',
  });
  assert.equal(parseReleaseVersion('1.0.0-dev.42').tag, 'v1.0.0-dev.42');
  assert.equal(parseReleaseVersion('1.0.0+build.5').tag, 'v1.0.0');
  ['', '1.0', '01.0.0', '1.0.0-', '1.0.0-01', 'v1.x.0', null].forEach((value) => {
    assert.equal(parseReleaseVersion(value), null, String(value));
  });
});

test('follows semver precedence', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    assert.equal(compareReleaseVersions(ordered[i], ordered[i + 1]), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareReleaseVersions(ordered[i + 1], ordered[i]), 1);
  }
  assert.equal(compareReleaseVersions('v1.0.0', '1.0.0'), 0);
});

test('isNewerRelease matches Mystral semantics', () => {
  assert.equal(isNewerRelease('v1.1.5', '1.1.4'), true);
  assert.equal(isNewerRelease('v1.1.4', '1.1.4-dev'), true);
  assert.equal(isNewerRelease('v1.1.4', '1.1.4'), false);
  assert.equal(isNewerRelease('v1.1.3', '1.1.4'), false);
  assert.equal(isNewerRelease('garbage', '1.0.0'), false);
});

test('development versions are recognized', () => {
  assert.equal(isDevelopmentVersion('1.0.0-dev'), true);
  assert.equal(isDevelopmentVersion('1.0.0-dev.7'), true);
  assert.equal(isDevelopmentVersion('1.0.0-beta.1'), false);
  assert.equal(isDevelopmentVersion('1.0.0'), false);
});

test('compare URLs only link real upgrades between releases', () => {
  assert.equal(createCompareUrl(REPO, '1.0.0', '1.1.0'), `${REPO}/compare/v1.0.0...v1.1.0`);
  assert.equal(createCompareUrl(REPO, '1.1.0', '1.0.0'), null);
  assert.equal(createCompareUrl(REPO, '1.0.0-dev', '1.0.0'), null);
  assert.equal(createCompareUrl(REPO, 'nope', '1.0.0'), null);
});
