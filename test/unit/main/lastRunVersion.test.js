const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  recordLaunchVersion,
} = require('../../../src/main/services/updates/lastRunVersion');
const {
  formatBytes,
} = require('../../../src/renderer/domain/formatBytes');

const REPO_URL = 'https://github.com/ponkis/dialoggo';

test('reports the first launch after an update only once', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoggo-userdata-'));
  const launch = (currentVersion) => recordLaunchVersion({
    userDataDir,
    currentVersion,
    repositoryUrl: REPO_URL,
  });

  try {
    assert.equal(launch('1.0.0'), null, 'fresh install');
    assert.equal(launch('1.0.0'), null, 'same version');
    assert.deepEqual(launch('1.1.0'), {
      previousVersion: '1.0.0',
      currentVersion: '1.1.0',
      compareUrl: `${REPO_URL}/compare/v1.0.0...v1.1.0`,
    });
    assert.equal(launch('1.1.0'), null, 'already reported');
    assert.equal(launch('1.0.5'), null, 'downgrade');
  } finally {
    fs.rmSync(userDataDir, {
      recursive: true,
      force: true,
    });
  }
});

test('formatBytes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(139211953), '133 MB');
  assert.equal(formatBytes('nope'), '0 B');
});
