// Promotes dev to main: merges dev into main with a merge commit and pushes.
// With --release it also tags v<package.json version> and pushes the tag,
// which starts the Release workflow.
//
//   npm run promote
//   npm run promote:release
//   node scripts/promote-dev-to-main.js --dev=dev --main=main --remote=origin [--release] [--dry-run]
const fs = require('fs');
const path = require('path');
const {
  execFileSync,
} = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    devBranch: 'dev',
    mainBranch: 'main',
    remote: 'origin',
    release: false,
    dryRun: false,
  };

  argv.forEach((argument) => {
    const [flag, value] = argument.split('=');
    if (flag === '--dev' && value) options.devBranch = value;
    else if (flag === '--main' && value) options.mainBranch = value;
    else if (flag === '--remote' && value) options.remote = value;
    else if (flag === '--release') options.release = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown option: ${argument}`);
  });

  return options;
}

function git(args, {
  capture = false,
  allowFailure = false,
} = {}) {
  try {
    const output = execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    return capture ? output.trim() : '';
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(`git ${args.join(' ')} failed.`, {
      cause: error,
    });
  }
}

function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const run = (args) => {
    if (options.dryRun) {
      console.log(`[promote] (dry run) git ${args.join(' ')}`);
      return;
    }
    git(args);
  };

  if (git(['status', '--porcelain'], {
    capture: true,
  })) {
    throw new Error('Commit or stash your changes before promoting dev to main.');
  }

  const startingBranch = git(['branch', '--show-current'], {
    capture: true,
  });

  git(['fetch', options.remote]);
  git(['checkout', options.mainBranch]);
  git(['pull', '--ff-only', options.remote, options.mainBranch]);

  const pending = git(['rev-list', '--count', `${options.mainBranch}..${options.devBranch}`], {
    capture: true,
  });
  if (pending === '0') {
    git(['checkout', startingBranch]);
    throw new Error(`Nothing new to merge from ${options.devBranch}.`);
  }

  if (options.dryRun) {
    console.log(`[promote] ${pending} commit(s) on ${options.devBranch} would be merged into ${options.mainBranch}.`);
  } else if (git(['merge', '--no-ff', '-m', `Merge ${options.devBranch} into ${options.mainBranch}`, options.devBranch], {
    allowFailure: true,
  }) === null) {
    throw new Error('Merge has conflicts. Resolve them on main, commit, and push manually.');
  }

  run(['push', options.remote, options.mainBranch]);

  if (options.release) {
    const tag = `v${readVersion()}`;
    if (git(['tag', '--list', tag], {
      capture: true,
    })) {
      throw new Error(`Tag ${tag} already exists. Bump the version on dev before releasing.`);
    }

    run(['tag', '-a', tag, '-m', `Dialoggo ${tag.slice(1)}`]);
    run(['push', options.remote, tag]);
    console.log(`[promote] Tagged ${tag}; the Release workflow will build and publish it.`);
  }

  git(['checkout', startingBranch || options.devBranch]);
  console.log('[promote] Done.');
}

try {
  main();
} catch (error) {
  console.error(`[promote] ${error.message}`);
  process.exitCode = 1;
}
