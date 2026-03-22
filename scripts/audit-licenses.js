const checker = require('license-checker');

const GPL_PATTERN = /\b(AGPL|GPL|LGPL)\b/i;

checker.init({
  start: process.cwd(),
}, (error, packages) => {
  if (error) {
    console.error('[licenses] Audit failed');
    console.error(error);
    process.exitCode = 1;
    return;
  }

  const summary = {};
  const blockedPackages = [];

  Object.entries(packages).forEach(([name, metadata]) => {
    const license = String(metadata.licenses || 'UNKNOWN');
    summary[license] = (summary[license] || 0) + 1;

    if (GPL_PATTERN.test(license)) {
      blockedPackages.push({
        name,
        license,
      });
    }
  });

  console.log('[licenses] Summary');
  Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([license, count]) => {
      console.log(`- ${license}: ${count}`);
    });

  if (blockedPackages.length > 0) {
    console.error('[licenses] GPL-family licenses detected');
    blockedPackages.forEach((entry) => {
      console.error(`- ${entry.name}: ${entry.license}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log('[licenses] No GPL-family licenses detected.');
});