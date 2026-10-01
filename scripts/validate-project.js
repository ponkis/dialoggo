const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validatePackageMetadata() {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const rootPackage = lock.packages?.[''] || {};

  assert(pkg.name === 'dialoggo', 'package.json name must be dialoggo.');
  assert(pkg.productName === 'Dialoggo', 'package.json productName must be Dialoggo.');
  assert(semverPattern.test(pkg.version), 'package.json version must be valid semver.');
  assert(pkg.author === 'ponkis', 'package.json author must be ponkis.');
  assert(pkg.license === 'MIT', 'package.json license must be MIT.');
  assert(pkg.private === true, 'package.json should stay private while bundled assets need distribution review.');
  assert(pkg.scripts?.build === 'node scripts/build-dist.js', 'package.json must expose the production build script.');
  assert(pkg.scripts?.test === 'node scripts/validate-project.js', 'package.json must expose the validation script as test.');
  assert(rootPackage.name === pkg.name, 'package-lock root package name must match package.json.');
  assert(rootPackage.version === pkg.version, 'package-lock root package version must match package.json.');
}

function validatePublicBranding() {
  const html = readText('public/index.html');
  const manifest = readJson('public/site.webmanifest');
  const css = readText('public/assets/css/main.css');
  const preload = readText('src/main/preload.js');

  assert(html.includes('<title>Dialoggo</title>'), 'public/index.html must set the Dialoggo title.');
  assert(html.includes('Content-Security-Policy'), 'public/index.html must define a Content Security Policy.');
  assert(html.includes('<script src="./assets/js/app.js" defer></script>'), 'public/index.html must load the separate renderer bundle.');
  assert(!preload.includes("require('../renderer/index.js')"), 'The preload must not execute the renderer app.');
  assert(html.includes('id="version-label"'), 'public/index.html must include a version label.');
  assert(html.includes('id="brand-link"'), 'public/index.html must include the branded author link.');
  assert(html.includes('https://ponkis.xyz/assets/img/global/logo.png'), 'public/index.html must use the ponkis brand logo.');
  assert(css.includes('https://fonts.googleapis.com/css2?family=Outfit'), 'CSS must import the Outfit brand font.');
  assert(css.includes('https://fonts.googleapis.com/css2?family=Over+the+Rainbow'), 'CSS must import the handwritten brand font.');
  assert(manifest.name === 'Dialoggo', 'site.webmanifest name must be Dialoggo.');
  assert(manifest.description?.includes('ponkis'), 'site.webmanifest must include ponkis branding.');
}

function validateRepoHygiene() {
  const gitignore = readText('.gitignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  assert(gitignore.includes('node_modules/'), '.gitignore must ignore node_modules/.');
  assert(gitignore.includes('dist/'), '.gitignore must ignore dist/.');
  assert(gitignore.includes('public/assets/js/app.js'), '.gitignore must ignore the generated development renderer bundle.');
  assert(!gitignore.includes('package-lock.json'), '.gitignore must not ignore package-lock.json for this app.');
  [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'NOTICE.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'SUPPORT.md',
    'public/web-app-manifest-512x512.png',
    'docs/ARCHITECTURE.md',
    'docs/DEVELOPMENT.md',
    'docs/RELEASE.md',
    'scripts/start-dev.js',
    'src/renderer/domain/dialogueText.js',
    'src/renderer/domain/math.js',
    'src/renderer/domain/speechPlayback.js',
    '.github/workflows/ci.yml',
    '.github/dependabot.yml',
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/pull_request_template.md',
  ].forEach((file) => {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} must exist.`);
  });
}

function main() {
  validatePackageMetadata();
  validatePublicBranding();
  validateRepoHygiene();
  console.log('[validate] Project metadata and production hygiene checks passed.');
}

try {
  main();
} catch (error) {
  console.error('[validate] Project validation failed');
  console.error(error.message);
  process.exitCode = 1;
}
