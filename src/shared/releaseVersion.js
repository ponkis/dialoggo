// Semantic-version parsing and precedence (semver.org §11), plus helpers for
// the -dev versions produced by development builds.

const NUMERIC_IDENTIFIER = /^(0|[1-9]\d*)$/;
const PRERELEASE_IDENTIFIER = /^[0-9A-Za-z-]+$/;

function parseReleaseVersion(value) {
  if (typeof value !== 'string') return null;

  let text = value.trim();
  if (text.startsWith('v') || text.startsWith('V')) text = text.slice(1);

  // Build metadata does not affect precedence.
  const plusIndex = text.indexOf('+');
  if (plusIndex >= 0) text = text.slice(0, plusIndex);

  const dashIndex = text.indexOf('-');
  const numericPart = dashIndex < 0 ? text : text.slice(0, dashIndex);
  const prerelease = dashIndex < 0 ? null : text.slice(dashIndex + 1);
  const numbers = numericPart.split('.');

  if (numbers.length !== 3 || !numbers.every((part) => NUMERIC_IDENTIFIER.test(part))) return null;

  const prereleaseIdentifiers = prerelease === null ? [] : prerelease.split('.');
  if (prerelease !== null && !prereleaseIdentifiers.every((identifier) => (
    PRERELEASE_IDENTIFIER.test(identifier) &&
    (!/^\d+$/.test(identifier) || NUMERIC_IDENTIFIER.test(identifier))
  ))) {
    return null;
  }

  const [major, minor, patch] = numbers.map(Number);
  return {
    major,
    minor,
    patch,
    prerelease: prereleaseIdentifiers,
    tag: `v${major}.${minor}.${patch}${prerelease === null ? '' : `-${prerelease}`}`,
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) return Math.sign(Number(left) - Number(right));
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Returns -1, 0, or 1. Throws when either version is not valid semver. */
function compareReleaseVersions(leftValue, rightValue) {
  const left = typeof leftValue === 'string' ? parseReleaseVersion(leftValue) : leftValue;
  const right = typeof rightValue === 'string' ? parseReleaseVersion(rightValue) : rightValue;
  if (!left || !right) throw new TypeError('Cannot compare invalid versions.');

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }

  const sharedLength = Math.min(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < sharedLength; i += 1) {
    const comparison = compareIdentifiers(left.prerelease[i], right.prerelease[i]);
    if (comparison !== 0) return comparison;
  }

  return Math.sign(left.prerelease.length - right.prerelease.length);
}

/** True when candidate is a valid version that is strictly newer than current. */
function isNewerRelease(candidate, current) {
  const candidateVersion = parseReleaseVersion(candidate);
  const currentVersion = parseReleaseVersion(current);
  if (!candidateVersion || !currentVersion) return false;
  return compareReleaseVersions(candidateVersion, currentVersion) > 0;
}

function isDevelopmentVersion(value) {
  const version = parseReleaseVersion(value);
  return Boolean(version) && version.prerelease[0]?.toLowerCase() === 'dev';
}

/** GitHub compare link between two releases, or null when it would not be meaningful. */
function createCompareUrl(repositoryUrl, previousVersion, currentVersion) {
  const previous = parseReleaseVersion(previousVersion);
  const current = parseReleaseVersion(currentVersion);
  if (!previous || !current) return null;
  if (isDevelopmentVersion(previousVersion) || isDevelopmentVersion(currentVersion)) return null;
  if (compareReleaseVersions(current, previous) <= 0) return null;

  return `${repositoryUrl}/compare/${previous.tag}...${current.tag}`;
}

module.exports = {
  compareReleaseVersions,
  createCompareUrl,
  isDevelopmentVersion,
  isNewerRelease,
  parseReleaseVersion,
};
