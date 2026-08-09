const fs = require('fs');
const path = require('path');

const version = process.env.RELEASE_VERSION;
if (!version) {
  console.error('RELEASE_VERSION environment variable is required.');
  process.exit(1);
}

const artifactsDir = path.join(__dirname, '../artifacts');
if (!fs.existsSync(artifactsDir)) {
  console.error('Artifacts directory does not exist:', artifactsDir);
  process.exit(1);
}

const updater = {
  version: version,
  notes: `Changelog for v${version} is available on GitHub release page.`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

const repo = 'Aninda7479/AgentApp';

const getAllFiles = (dir, fileList = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
};

const allFilePaths = getAllFiles(artifactsDir);
const fileMap = {};
for (const filePath of allFilePaths) {
  fileMap[path.basename(filePath)] = filePath;
}

const filenames = Object.keys(fileMap);

for (const file of filenames) {
  if (file.endsWith('.sig')) {
    const targetFile = file.slice(0, -4);
    if (!filenames.includes(targetFile)) continue;

    const sigContent = fs.readFileSync(fileMap[file], 'utf8').trim();
    const url = `https://github.com/${repo}/releases/download/v${version}/${targetFile}`;

    let platform = '';
    const lowerFile = file.toLowerCase();

    if (lowerFile.includes('aarch64') || lowerFile.includes('arm64') || (lowerFile.includes('app.tar.gz') && !lowerFile.includes('x64') && !lowerFile.includes('x86_64'))) {
      platform = 'darwin-aarch64';
    } else if ((lowerFile.includes('x64') || lowerFile.includes('x86_64')) && (lowerFile.includes('tar.gz') || lowerFile.includes('app') || lowerFile.includes('dmg')) && (lowerFile.includes('darwin') || lowerFile.includes('macos'))) {
      platform = 'darwin-x86_64';
    } else if ((lowerFile.includes('x64') || lowerFile.includes('x86_64')) && (lowerFile.includes('zip') || lowerFile.includes('msi') || lowerFile.includes('exe') || lowerFile.includes('nsis'))) {
      platform = 'windows-x86_64';
    } else if ((lowerFile.includes('amd64') || lowerFile.includes('x86_64') || lowerFile.includes('x64')) && (lowerFile.includes('appimage') || lowerFile.includes('deb') || lowerFile.includes('tar.gz'))) {
      platform = 'linux-x86_64';
    }

    if (platform) {
      updater.platforms[platform] = {
        signature: sigContent,
        url: url
      };
    }
  }
}

fs.writeFileSync(path.join(artifactsDir, 'updater.json'), JSON.stringify(updater, null, 2) + '\n', 'utf8');
console.log('[generate-updater-json] Successfully generated updater.json:', JSON.stringify(updater, null, 2));
