const fs = require('fs');
const path = require('path');

const version = process.env.RELEASE_VERSION;
if (!version) {
  console.error('RELEASE_VERSION environment variable is required.');
  process.exit(1);
}

const artifactsDir = path.join(__dirname, '../artifacts');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

const repo = 'Aninda7479/AgentApp';

async function main() {
  const updater = {
    version: version,
    notes: `Changelog for v${version} is available on GitHub release page.`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 1. Try local files first
  const fileMap = {};
  const getAllFiles = (dir, fileList = []) => {
    if (!fs.existsSync(dir)) return fileList;
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
  for (const filePath of allFilePaths) {
    fileMap[path.basename(filePath)] = filePath;
  }

  // Check if latest.json is present locally
  if (fileMap['latest.json']) {
    try {
      const latestJson = JSON.parse(fs.readFileSync(fileMap['latest.json'], 'utf8'));
      if (latestJson.platforms) {
        Object.assign(updater.platforms, latestJson.platforms);
      }
    } catch (err) {
      console.warn('[generate-updater-json] Could not parse local latest.json:', err);
    }
  }

  let localSigFound = false;
  for (const file of Object.keys(fileMap)) {
    if (file.endsWith('.sig')) {
      localSigFound = true;
      const targetFile = file.slice(0, -4);
      if (!fileMap[targetFile]) continue;

      const sigContent = fs.readFileSync(fileMap[file], 'utf8').trim();
      const url = `https://github.com/${repo}/releases/download/v${version}/${targetFile}`;
      mapPlatformSignature(updater, targetFile, sigContent, url);
    }
  }

  // 2. If local signatures were not found or platforms incomplete, fetch from GitHub API
  if (Object.keys(updater.platforms).length === 0) {
    console.log('[generate-updater-json] Fetching release assets from GitHub API for v' + version + '...');
    const headers = { 'User-Agent': 'superagent-release' };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers['Authorization'] = `token ${token}`;

    try {
      let releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, { headers });
      if (!releaseRes.ok) {
        // Fallback to releases list for draft releases
        const listRes = await fetch(`https://api.github.com/repos/${repo}/releases`, { headers });
        if (listRes.ok) {
          const releases = await listRes.json();
          const draft = releases.find(r => r.tag_name === `v${version}` || r.name?.includes(version));
          if (draft) releaseRes = { ok: true, json: async () => draft };
        }
      }

      if (releaseRes.ok) {
        const release = await releaseRes.json();
        const assets = release.assets || [];
        console.log(`[generate-updater-json] Found ${assets.length} release assets on GitHub.`);

        // Check if latest.json is attached to the release
        const latestAsset = assets.find(a => a.name === 'latest.json');
        if (latestAsset) {
          try {
            const latestRes = await fetch(latestAsset.browser_download_url, { headers });
            if (latestRes.ok) {
              const latestJson = await latestRes.json();
              if (latestJson.platforms) {
                Object.assign(updater.platforms, latestJson.platforms);
              }
            }
          } catch (err) {
            console.warn('[generate-updater-json] Error reading remote latest.json:', err);
          }
        }

        for (const asset of assets) {
          if (asset.name.endsWith('.sig')) {
            const targetFileName = asset.name.slice(0, -4);
            const targetAsset = assets.find(a => a.name === targetFileName);
            if (!targetAsset) continue;

            const sigRes = await fetch(asset.browser_download_url, { headers });
            if (sigRes.ok) {
              const sigContent = (await sigRes.text()).trim();
              mapPlatformSignature(updater, targetFileName, sigContent, targetAsset.browser_download_url);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[generate-updater-json] Could not query GitHub release assets:', err);
    }
  }

  fs.writeFileSync(path.join(artifactsDir, 'updater.json'), JSON.stringify(updater, null, 2) + '\n', 'utf8');
  console.log('[generate-updater-json] Successfully generated updater.json:');
  console.log(JSON.stringify(updater, null, 2));
}

function mapPlatformSignature(updater, targetFileName, signature, url) {
  const lower = targetFileName.toLowerCase();

  // macOS Apple Silicon (arm64 / aarch64) - matches app.tar.gz, tar.gz, dmg
  if ((lower.includes('aarch64') || lower.includes('arm64')) && (lower.includes('app.tar.gz') || lower.includes('.tar.gz') || lower.endsWith('.dmg'))) {
    updater.platforms['darwin-aarch64'] = { signature, url };
    updater.platforms['darwin-aarch64-app'] = { signature, url };
    updater.platforms['darwin-arm64'] = { signature, url };
  }
  // macOS Intel (x64 / x86_64) - matches app.tar.gz, tar.gz, dmg
  else if ((lower.includes('x64') || lower.includes('x86_64') || lower.includes('darwin')) && (lower.includes('app.tar.gz') || lower.includes('.tar.gz') || lower.endsWith('.dmg'))) {
    updater.platforms['darwin-x86_64'] = { signature, url };
    updater.platforms['darwin-x86_64-app'] = { signature, url };
  }
  // Windows (x64) - NSIS setup exe or nsis.zip (exclude .msi for in-place updater)
  else if (lower.includes('x64') && (lower.endsWith('-setup.exe') || lower.endsWith('.nsis.zip') || (lower.endsWith('.exe') && !lower.includes('cli')))) {
    updater.platforms['windows-x86_64'] = { signature, url };
    updater.platforms['windows-x64'] = { signature, url };
  }
  // Linux (x64) - AppImage or AppImage.tar.gz (exclude .deb and .rpm)
  else if ((lower.includes('amd64') || lower.includes('x86_64') || lower.includes('x64')) && (lower.endsWith('.appimage') || lower.includes('appimage.tar.gz'))) {
    updater.platforms['linux-x86_64'] = { signature, url };
    updater.platforms['linux-x64'] = { signature, url };
  }
}

main().catch((err) => {
  console.error('[generate-updater-json] Fatal error:', err);
  process.exit(1);
});
