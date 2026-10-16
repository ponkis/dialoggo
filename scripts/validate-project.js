// Repository and metadata checks that complement the unit tests: package
// metadata, renderer security posture, branding, and required repo files.
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
  assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'Runtime code is bundled by Webpack; keep packages in devDependencies so the installer ships no node_modules.');
  ['start', 'build', 'package', 'test', 'test:smoke', 'lint', 'verify'].forEach((script) => {
    assert(pkg.scripts?.[script], `package.json must define the ${script} script.`);
  });
  assert(rootPackage.name === pkg.name, 'package-lock root package name must match package.json.');
  assert(rootPackage.version === pkg.version, 'package-lock root package version must match package.json.');
}

function validateRendererSecurity() {
  const html = readText('src/renderer/index.html');
  const preload = readText('src/preload/index.js');
  const mainWindow = readText('src/main/windows/createMainWindow.js');

  assert(html.includes('Content-Security-Policy'), 'src/renderer/index.html must define a Content Security Policy.');
  assert(!/file:/.test(html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] || ''), 'The CSP must not allow file: URLs.');
  assert(html.includes('<script src="./assets/js/app.js" defer></script>'), 'src/renderer/index.html must load the renderer bundle.');
  assert(/sandbox:\s*true/.test(mainWindow), 'The main window must run with a sandboxed renderer.');
  assert(/contextIsolation:\s*true/.test(mainWindow), 'The main window must enable contextIsolation.');
  assert(/nodeIntegration:\s*false/.test(mainWindow), 'The main window must disable nodeIntegration.');
  assert(!/require\((?!'electron'|'\.\.\/shared\/)/.test(preload), 'The sandboxed preload may only require electron and shared modules.');
}

function validatePublicBranding() {
  const html = readText('src/renderer/index.html');
  const manifest = readJson('public/site.webmanifest');
  const css = readText('public/assets/css/main.css');

  assert(html.includes('<title>Dialoggo</title>'), 'src/renderer/index.html must set the Dialoggo title.');
  assert(html.includes('id="version-label"'), 'src/renderer/index.html must include a version label.');
  assert(html.includes('id="brand-link"'), 'src/renderer/index.html must include the branded author link.');
  assert(html.includes('https://ponkis.xyz/assets/img/global/logo.png'), 'src/renderer/index.html must use the ponkis brand logo.');
  assert(css.includes('https://fonts.googleapis.com/css2?family=Outfit'), 'CSS must import the Outfit brand font.');
  assert(manifest.name === 'Dialoggo', 'site.webmanifest name must be Dialoggo.');
  assert(manifest.description?.includes('ponkis'), 'site.webmanifest must include ponkis branding.');
}

function validateRepoHygiene() {
  const gitignore = readText('.gitignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  ['node_modules/', 'dist/', 'release/'].forEach((entry) => {
    assert(gitignore.includes(entry), `.gitignore must ignore ${entry}`);
  });
  assert(!gitignore.includes('package-lock.json'), '.gitignore must not ignore package-lock.json.');
  assert(!gitignore.includes('build/'), '.gitignore must not ignore build/ (electron-builder resources).');

  [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'NOTICE.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'SUPPORT.md',
    'SMOKE_TEST.md',
    'build/icon.png',
    'electron-builder.config.js',
    'eslint.config.js',
    'docs/ARCHITECTURE.md',
    'docs/DEVELOPMENT.md',
    'docs/RELEASE.md',
    'scripts/promote-dev-to-main.js',
    '.github/workflows/ci.yml',
    '.github/workflows/dev-build.yml',
    '.github/workflows/release.yml',
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
  validateRendererSecurity();
  validatePublicBranding();
  validateRepoHygiene();
  console.log('[validate] Project metadata, security posture, and repository checks passed.');
}

try {
  main();
} catch (error) {
  console.error('[validate] Project validation failed');
  console.error(error.message);
  process.exitCode = 1;
}
