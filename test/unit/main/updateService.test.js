const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createUpdateService,
} = require('../../../src/main/services/updates/UpdateService');

const REPO = 'ponkis/dialoggo';
const REPO_URL = `https://github.com/${REPO}`;
const INSTALLER = 'Dialoggo-1.1.0-win-x64-setup.exe';
const INSTALLER_URL = `${REPO_URL}/releases/download/v1.1.0/${INSTALLER}`;
const SUMS_URL = `${REPO_URL}/releases/download/v1.1.0/SHA256SUMS.txt`;
const PAYLOAD = Buffer.alloc(256 * 1024, 7);
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function createRelease({
  tag = 'v1.1.0',
  installerUrl = INSTALLER_URL,
  withChecksums = true,
} = {}) {
  return {
    tag_name: tag,
    html_url: `${REPO_URL}/releases/tag/${tag}`,
    assets: [
      {
        name: INSTALLER,
        browser_download_url: installerUrl,
        size: PAYLOAD.length,
      },
      ...(withChecksums ? [{
        name: 'SHA256SUMS.txt',
        browser_download_url: SUMS_URL,
        size: 100,
      }] : []),
    ],
  };
}

function createFakeGitHub({
  release = createRelease(),
  status = 200,
  checksum = sha256(PAYLOAD),
  chunkDelayMs = 0,
} = {}) {
  const requests = [];

  async function fetchImpl(url, options = {}) {
    requests.push(url);

    if (url.startsWith('https://api.github.com/')) {
      return new Response(status === 200 ? JSON.stringify(release) : '{}', {
        status,
      });
    }

    if (url === SUMS_URL) {
      return new Response(`${checksum}  ${INSTALLER}\n`);
    }

    if (url === INSTALLER_URL) {
      const chunkSize = 16 * 1024;
      let offset = 0;
      const body = new ReadableStream({
        async pull(controller) {
          if (options.signal?.aborted) {
            controller.error(options.signal.reason);
            return;
          }
          if (chunkDelayMs) await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
          if (offset >= PAYLOAD.length) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(PAYLOAD.subarray(offset, offset + chunkSize)));
          offset += chunkSize;
        },
      });
      return new Response(body, {
        headers: {
          'content-length': String(PAYLOAD.length),
        },
      });
    }

    return new Response('not found', {
      status: 404,
    });
  }

  return {
    fetchImpl,
    requests,
  };
}

function createService(fakeGitHub, overrides = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoggo-update-'));
  const launched = [];
  const service = createUpdateService({
    fetchImpl: fakeGitHub.fetchImpl,
    currentVersion: '1.0.0',
    repository: REPO,
    repositoryUrl: REPO_URL,
    userAgent: 'Dialoggo-test',
    platform: 'win32',
    arch: 'x64',
    tempDir,
    canApplyUpdates: true,
    launchInstaller: async (filePath) => launched.push(filePath),
    openDiskImage: async () => { },
    ...overrides,
  });

  return {
    launched,
    service,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    }),
  };
}

test('reports an available update with notes and size', async () => {
  const {
    service,
    cleanup,
  } = createService(createFakeGitHub());
  try {
    const result = await service.check();
    assert.equal(result.ok, true);
    assert.equal(result.status, 'available');
    assert.equal(result.latestVersion, '1.1.0');
    assert.equal(result.installMode, 'installer');
    assert.equal(result.downloadSize, PAYLOAD.length);
    assert.equal(result.notesUrl, `${REPO_URL}/compare/v1.0.0...v1.1.0`);
  } finally {
    cleanup();
  }
});

test('reports up to date, no releases, and HTTP failures', async () => {
  const upToDate = createService(createFakeGitHub({
    release: createRelease({
      tag: 'v1.0.0',
    }),
  }));
  const none = createService(createFakeGitHub({
    status: 404,
  }));
  const failing = createService(createFakeGitHub({
    status: 500,
  }));

  try {
    assert.equal((await upToDate.service.check()).status, 'up-to-date');
    assert.equal((await none.service.check()).status, 'no-releases');
    const failure = await failing.service.check();
    assert.equal(failure.ok, false);
    assert.match(failure.message, /HTTP 500/);
  } finally {
    upToDate.cleanup();
    none.cleanup();
    failing.cleanup();
  }
});

test('builds that cannot apply updates fall back to the release page', async () => {
  const fake = createFakeGitHub();
  const {
    service,
    cleanup,
  } = createService(fake, {
    canApplyUpdates: false,
  });
  try {
    const result = await service.check();
    assert.equal(result.installMode, 'manual');
    assert.equal(result.downloadSize, null);
    assert.equal((await service.download()).code, 'unavailable');
    assert.ok(!fake.requests.includes(INSTALLER_URL));
  } finally {
    cleanup();
  }
});

test('downloads, verifies, and launches the installer', async () => {
  const {
    service,
    launched,
    tempDir,
    cleanup,
  } = createService(createFakeGitHub());
  const progress = [];
  try {
    await service.check();
    const result = await service.download({
      onProgress: (event) => progress.push(event),
    });
    assert.equal(result.ok, true);
    assert.equal(result.verified, true);
    assert.equal(progress.at(-1).receivedBytes, PAYLOAD.length);
    assert.equal(progress.at(-1).totalBytes, PAYLOAD.length);

    const installed = await service.install();
    assert.equal(installed.ok, true);
    assert.equal(launched.length, 1);
    assert.equal(path.basename(launched[0]), INSTALLER);
    assert.ok(launched[0].startsWith(tempDir));
    assert.deepEqual(fs.readFileSync(launched[0]), PAYLOAD);
  } finally {
    cleanup();
  }
});

test('rejects a download whose checksum does not match', async () => {
  const {
    service,
    launched,
    tempDir,
    cleanup,
  } = createService(createFakeGitHub({
    checksum: 'f'.repeat(64),
  }));
  try {
    await service.check();
    const result = await service.download();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'checksum');
    assert.equal((await service.install()).ok, false);
    assert.equal(launched.length, 0);
    const leftovers = fs.readdirSync(path.join(tempDir, 'dialoggo-updates'));
    assert.deepEqual(leftovers, []);
  } finally {
    cleanup();
  }
});

test('refuses installers hosted outside the repository', async () => {
  const fake = createFakeGitHub({
    release: createRelease({
      installerUrl: 'https://evil.example/Dialoggo-1.1.0-win-x64-setup.exe',
    }),
  });
  const {
    service,
    cleanup,
  } = createService(fake);
  try {
    await service.check();
    const result = await service.download();
    assert.equal(result.code, 'untrusted');
    assert.ok(!fake.requests.some((url) => url.startsWith('https://evil.example')));
  } finally {
    cleanup();
  }
});

test('a download can be canceled', async () => {
  const {
    service,
    cleanup,
  } = createService(createFakeGitHub({
    chunkDelayMs: 5,
  }));
  try {
    await service.check();
    const pending = service.download({
      onProgress: ({
        receivedBytes,
      }) => {
        if (receivedBytes > 0) service.cancelDownload();
      },
    });
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.code, 'canceled');
  } finally {
    cleanup();
  }
});
