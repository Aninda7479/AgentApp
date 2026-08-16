const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

// Helper to load, update, and save JSON
function updatePackageJson(filePath, updater) {
  const absolutePath = path.join(rootDir, filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`⚠️ Warning: file not found: ${filePath}`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  updater(data);
  fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${filePath}`);
}

function getDesktopVersion() {
  const desktopPkgPath = path.join(rootDir, 'packages/desktop/package.json');
  if (fs.existsSync(desktopPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
    return pkg.version || '0.1.0';
  }
  return '0.1.0';
}

function incrementSemver(currentVersion, bumpType) {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return currentVersion;
  let major = parseInt(match[1], 10);
  let minor = parseInt(match[2], 10);
  let patch = parseInt(match[3], 10);

  if (bumpType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bumpType === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    // patch (default)
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function determineAutoBumpType() {
  let commitLogs = '';
  try {
    let latestTag = '';
    try {
      latestTag = execSync('git describe --tags --abbrev=0', { cwd: rootDir, encoding: 'utf8' }).trim();
    } catch (_) {
      latestTag = '';
    }

    if (latestTag) {
      commitLogs = execSync(`git log ${latestTag}..HEAD --oneline`, { cwd: rootDir, encoding: 'utf8' });
    } else {
      commitLogs = execSync('git log -n 50 --oneline', { cwd: rootDir, encoding: 'utf8' });
    }
  } catch (err) {
    console.warn('⚠️ Warning: Could not inspect git history, defaulting to patch bump.');
    return 'patch';
  }

  const lines = commitLogs.split('\n').map((l) => l.trim()).filter(Boolean);
  let hasMajor = false;
  let hasMinor = false;

  for (const line of lines) {
    // Strip commit hash
    const msg = line.replace(/^[a-f0-9]+\s+/, '');
    if (/BREAKING CHANGE/i.test(msg) || /^[a-z]+(\([^\)]+\))?!:/i.test(msg)) {
      hasMajor = true;
      break;
    }
    if (/^feat(\([^\)]+\))?:/i.test(msg)) {
      hasMinor = true;
    }
  }

  if (hasMajor) return 'major';
  if (hasMinor) return 'minor';
  return 'patch';
}

// Parse args
const rawArg = process.argv[2];
const noCommit = process.argv.includes('--no-commit');

if (!rawArg) {
  console.error('Error: Please specify a version or mode. Usage: node scripts/bump-version.js <auto|patch|minor|major|x.y.z> [--no-commit]');
  process.exit(1);
}

let newVersion = rawArg;
const currentVersion = getDesktopVersion();

if (['auto', 'patch', 'minor', 'major'].includes(rawArg.toLowerCase())) {
  const bumpType = rawArg.toLowerCase() === 'auto' ? determineAutoBumpType() : rawArg.toLowerCase();
  newVersion = incrementSemver(currentVersion, bumpType);
  console.log(`🔍 Current version: ${currentVersion} | Detected bump type: '${bumpType}' -> New version: ${newVersion}`);
}

const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
if (!semverRegex.test(newVersion)) {
  console.error(`Error: "${newVersion}" is not a valid semver version (e.g. 0.2.0, 1.0.0-alpha.1)`);
  process.exit(1);
}

console.log(`\n🚀 Starting version bump to: ${newVersion}\n`);

function updateTomlVersion(filePath, newVer) {
  const absolutePath = path.join(rootDir, filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`⚠️ Warning: file not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(absolutePath, 'utf8');
  content = content.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${newVer}"`);
  fs.writeFileSync(absolutePath, content, 'utf8');
  console.log(`✅ Updated ${filePath}`);
}

function updateJsonFile(filePath, updater) {
  const absolutePath = path.join(rootDir, filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`⚠️ Warning: file not found: ${filePath}`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  updater(data);
  fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${filePath}`);
}

// 2. Update package.json, tauri.conf.json, and Cargo.toml files
updatePackageJson('package.json', (data) => {
  data.version = newVersion;
});

updatePackageJson('packages/core/package.json', (data) => {
  data.version = newVersion;
});

updatePackageJson('packages/ui/package.json', (data) => {
  data.version = newVersion;
});

updatePackageJson('packages/cli/package.json', (data) => {
  data.version = newVersion;
  if (data.dependencies && data.dependencies['@superagent/core']) {
    data.dependencies['@superagent/core'] = `^${newVersion}`;
  }
});

updatePackageJson('packages/web/package.json', (data) => {
  data.version = newVersion;
  if (data.dependencies && data.dependencies['@superagent/core']) {
    data.dependencies['@superagent/core'] = `^${newVersion}`;
  }
});

updatePackageJson('packages/desktop/package.json', (data) => {
  data.version = newVersion;
});

updateJsonFile('packages/desktop/src-tauri/tauri.conf.json', (data) => {
  data.version = newVersion;
});

updateTomlVersion('packages/desktop/src-tauri/Cargo.toml', newVersion);
updateTomlVersion('packages/core_v2/Cargo.toml', newVersion);

updatePackageJson('website/package.json', (data) => {
  data.version = newVersion;
});

// 3. Update website config VERSION constant
const configPath = path.join(rootDir, 'website/src/config.js');
if (fs.existsSync(configPath)) {
  let content = fs.readFileSync(configPath, 'utf8');
  const versionRegex = /export const VERSION = '([^']+)'/;
  if (versionRegex.test(content)) {
    content = content.replace(versionRegex, `export const VERSION = '${newVersion}'`);
    fs.writeFileSync(configPath, content, 'utf8');
    console.log('✅ Updated website/src/config.js export const VERSION');
  } else {
    console.warn('⚠️ Warning: export const VERSION not found in website/src/config.js');
  }
}

// 4. Update package locks by running installs
console.log('\n📦 Running npm install to sync workspace locks...');
try {
  execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
  console.log('✅ Synchronized root package-lock.json');
} catch (err) {
  console.error('❌ Root npm install failed');
}

try {
  execSync('npm install', { cwd: path.join(rootDir, 'website'), stdio: 'inherit' });
  console.log('✅ Synchronized website package-lock.json');
} catch (err) {
  console.error('❌ Website npm install failed');
}

// 5. Git Commit (unless --no-commit is passed)
if (!noCommit) {
  console.log('\n💾 Committing version bump...');
  try {
    execSync('git add .', { cwd: rootDir, stdio: 'inherit' });
    execSync(`git commit -m "chore: release version ${newVersion} [skip ci]"`, { cwd: rootDir, stdio: 'inherit' });
    console.log(`\n✅ Git commit for v${newVersion} created.`);
  } catch (err) {
    console.warn('⚠️ Warning: Git commit failed (check if there were actual changes)');
  }
}

console.log(`
🎉 Done! All packages bumped to v${newVersion}.
`);

