const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

// 1. Get and validate version
const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Error: Please specify a version. Usage: node scripts/bump-version.js <new-version>');
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
if (!semverRegex.test(newVersion)) {
  console.error(`Error: "${newVersion}" is not a valid semver version (e.g. 0.2.0, 1.0.0-alpha.1)`);
  process.exit(1);
}

console.log(`\n🚀 Starting version bump to: ${newVersion}\n`);

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

// 2. Update package.json files
// Root (adds/updates version)
updatePackageJson('package.json', (data) => {
  data.version = newVersion;
});

// Core
updatePackageJson('packages/core/package.json', (data) => {
  data.version = newVersion;
});

// CLI
updatePackageJson('packages/cli/package.json', (data) => {
  data.version = newVersion;
  if (data.dependencies && data.dependencies['@superagent/core']) {
    data.dependencies['@superagent/core'] = `^${newVersion}`;
  }
});

// Web
updatePackageJson('packages/web/package.json', (data) => {
  data.version = newVersion;
  if (data.dependencies && data.dependencies['@superagent/core']) {
    data.dependencies['@superagent/core'] = `^${newVersion}`;
  }
});

// Desktop
updatePackageJson('packages/desktop/package.json', (data) => {
  data.version = newVersion;
});

// Website
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

// 5. Git Commit and Tag
console.log('\n💾 Committing and tagging release...');
try {
  execSync('git add .', { cwd: rootDir, stdio: 'inherit' });
  execSync(`git commit -m "chore: release version ${newVersion}"`, { cwd: rootDir, stdio: 'inherit' });
  execSync(`git tag v${newVersion}`, { cwd: rootDir, stdio: 'inherit' });
  console.log(`\n✅ Git commit and tag v${newVersion} created successfully.`);
} catch (err) {
  console.warn('⚠️ Warning: Git commit/tag failed (check if there were actual changes)');
}

console.log(`\n🎉 Success! All versions bumped to ${newVersion}. Run 'git push && git push --tags' to publish changes.\n`);
