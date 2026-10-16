const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseBuildArgs,
  resolveBuildVersion,
} = require('../../../scripts/lib/buildPipeline');

test('development builds get a -dev version suffix', () => {
  assert.equal(resolveBuildVersion('1.2.3', 'production'), '1.2.3');
  assert.equal(resolveBuildVersion('1.2.3', 'production', '42'), '1.2.3');
  assert.equal(resolveBuildVersion('1.2.3', 'development'), '1.2.3-dev');
  assert.equal(resolveBuildVersion('1.2.3', 'development', '42'), '1.2.3-dev.42');
});

test('build arguments are validated', () => {
  const previousSuffix = process.env.DIALOGGO_VERSION_SUFFIX;
  delete process.env.DIALOGGO_VERSION_SUFFIX;

  try {
    assert.deepEqual(parseBuildArgs([]), {
      mode: 'production',
      appEnv: 'production',
      versionSuffix: '',
      clean: true,
    });
    assert.deepEqual(parseBuildArgs(['--mode=development', '--env=development', '--no-clean', '--version-suffix=7']), {
      mode: 'development',
      appEnv: 'development',
      versionSuffix: '7',
      clean: false,
    });
    assert.throws(() => parseBuildArgs(['--env=staging']));
    assert.throws(() => parseBuildArgs(['--unknown']));
  } finally {
    if (previousSuffix !== undefined) process.env.DIALOGGO_VERSION_SUFFIX = previousSuffix;
  }
});
