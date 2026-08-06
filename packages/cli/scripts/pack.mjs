import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliDir, '..', '..');
const packDir = path.resolve(repoRoot, '..', '.superagent-cli-pack');
const outDir = path.resolve(cliDir, 'dist-release-cli');

function rmrf(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5 });
  }
}

function sh(cmd, args, opts = {}) {
  console.log(`[pack] Executing: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0) {
    console.error(`[pack] ❌ Command failed: ${cmd} ${args.join(' ')} (exit code: ${res.status})`);
    process.exit(res.status || 1);
  }
}

async function run() {
  console.log('[pack] Starting CLI packaging workflow with flat staging strategy...');

  // 1. Clean previous target directories
  console.log('[pack] Cleaning target directories...');
  rmrf(packDir);
  rmrf(outDir);
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 2. Create staging package.json with all production dependencies of CLI and Core combined
  console.log('[pack] Creating staging package.json...');
  const cliPkg = JSON.parse(fs.readFileSync(path.join(cliDir, 'package.json'), 'utf8'));
  const corePkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages', 'core', 'package.json'), 'utf8'));

  const combinedDeps = {
    ...corePkg.dependencies,
    ...cliPkg.dependencies
  };
  // Remove monorepo workspace dependencies as they are bundled/handled manually
  delete combinedDeps['@superagent/core'];

  const stagingPkg = {
    name: 'superagent-cli-pack',
    version: '0.1.0',
    private: true,
    dependencies: {
      ...combinedDeps,
      // Force installation of sharp platform-specific native binaries
      '@img/sharp-win32-x64': '0.33.5',
      '@img/sharp-libvips-win32-x64': '1.0.4',
      '@img/sharp-darwin-x64': '0.33.5',
      '@img/sharp-libvips-darwin-x64': '1.0.4',
      '@img/sharp-darwin-arm64': '0.33.5',
      '@img/sharp-libvips-darwin-arm64': '1.0.4',
      '@img/sharp-linux-x64': '0.33.5',
      '@img/sharp-libvips-linux-x64': '1.0.4'
    }
  };

  fs.writeFileSync(
    path.join(packDir, 'package.json'),
    JSON.stringify(stagingPkg, null, 2),
    'utf-8'
  );

  // 3. Install production dependencies inside staging folder for all platforms
  console.log('[pack] Installing production dependencies for all targeted operating systems and architectures...');
  sh('npm', [
    'install',
    '--omit=dev',
    '--force',
    '--no-audit',
    '--no-fund',
    '--prefer-offline'
  ], { cwd: packDir });

  // 4. Copy the compiled core files into the staged node_modules so esbuild resolves it as a local module
  console.log('[pack] Linking staged core package...');
  const stagedCoreDir = path.join(packDir, 'node_modules', '@superagent', 'core');
  fs.mkdirSync(stagedCoreDir, { recursive: true });
  fs.cpSync(path.join(repoRoot, 'packages', 'core', 'dist'), path.join(stagedCoreDir, 'dist'), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'packages', 'core', 'package.json'), path.join(stagedCoreDir, 'package.json'));

  // Patch ink reconciler top-level await to prevent esbuild syntax errors when compiling to CJS
  console.log('[pack] Patching ink reconciler devtools import in root and staging folders...');
  const rootReconcilerPath = path.join(repoRoot, 'node_modules', 'ink', 'build', 'reconciler.js');
  if (fs.existsSync(rootReconcilerPath)) {
    let content = fs.readFileSync(rootReconcilerPath, 'utf8');
    content = content.replace("await import('./devtools.js')", "Promise.resolve()");
    fs.writeFileSync(rootReconcilerPath, content, 'utf8');
  }
  const reconcilerPath = path.join(packDir, 'node_modules', 'ink', 'build', 'reconciler.js');
  if (fs.existsSync(reconcilerPath)) {
    let content = fs.readFileSync(reconcilerPath, 'utf8');
    content = content.replace("await import('./devtools.js')", "Promise.resolve()");
    fs.writeFileSync(reconcilerPath, content, 'utf8');
  }

  // 5. Setup the banner code to intercept Module._resolveFilename at runtime
  const bannerJs = `
const __pkg_path__ = require('path');
const __pkg_module__ = require('module');
if (process.pkg) {
  const realNodeModules = __pkg_path__.join(__pkg_path__.dirname(process.execPath), 'node_modules');
  const originalResolveFilename = __pkg_module__._resolveFilename || __pkg_module__.Module._resolveFilename;

  const externals = [
    'sharp',
    '@img',
    'playwright',
    'playwright-core',
    'systeminformation',
    'fluent-ffmpeg'
  ];

  const resolver = function (request, parent, isMain, options) {
    if (request.indexOf('@img/') === 0 && request.indexOf('/sharp.node') !== -1) {
      const parts = request.split('/');
      const pkgName = parts[1];
      return __pkg_path__.join(realNodeModules, '@img', pkgName, 'lib', pkgName + '.node');
    }

    const match = externals.find(ext => request === ext || request.startsWith(ext + '/'));
    if (match) {
      const dummyParent = {
        id: 'host-parent',
        filename: __pkg_path__.join(realNodeModules, 'index.js'),
        paths: [realNodeModules]
      };
      return originalResolveFilename(request, dummyParent, isMain, options);
    }
    return originalResolveFilename(request, parent, isMain, options);
  };

  if (__pkg_module__._resolveFilename) {
    __pkg_module__._resolveFilename = resolver;
  } else if (__pkg_module__.Module && __pkg_module__.Module._resolveFilename) {
    __pkg_module__.Module._resolveFilename = resolver;
  }

  // Mock inspector/node:inspector modules because pkg runtime does not support them
  const originalRequire = __pkg_module__.prototype.require || (__pkg_module__.Module && __pkg_module__.Module.prototype.require);
  if (originalRequire) {
    const customRequire = function (id) {
      if (id === 'inspector' || id === 'node:inspector') {
        return {
          url: () => undefined,
          Session: class Session {
            connect() {}
            disconnect() {}
            post() {}
            on() {}
          }
        };
      }
      return originalRequire.apply(this, arguments);
    };

    if (__pkg_module__.prototype.require) {
      __pkg_module__.prototype.require = customRequire;
    } else if (__pkg_module__.Module && __pkg_module__.Module.prototype.require) {
      __pkg_module__.Module.prototype.require = customRequire;
    }
  }
}
`;

  // 6. Bundle CLI entry point with esbuild
  // We keep only the native C++ modules, playwright, and system utilities external.
  // We alias 'yoga-wasm-web' to 'yoga-wasm-web/asm' to avoid top-level await compile errors in CommonJS.
  console.log('[pack] Bundling Javascript code via esbuild...');
  const bundleFile = path.join(packDir, 'bundle.cjs');
  
  const externalDeps = [
    'sharp',
    'playwright',
    'playwright-core',
    'systeminformation',
    'fluent-ffmpeg',
    'react-devtools-core'
  ];

  await build({
    entryPoints: [path.join(cliDir, 'dist', 'bin', 'main.js')],
    outfile: bundleFile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: externalDeps,
    alias: {
      'yoga-wasm-web/auto': 'yoga-wasm-web/asm'
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    banner: {
      js: bannerJs
    },
    logLevel: 'info',
  });

  // 7. Build standalone binaries for targeted platforms
  const targets = [
    { id: 'node22-win-x64', platform: 'win', arch: 'x64', binaryName: 'superagent-cli.exe', releaseDirName: 'win-x64' },
    { id: 'node22-macos-x64', platform: 'macos', arch: 'x64', binaryName: 'superagent-cli', releaseDirName: 'mac-x64' },
    { id: 'node22-macos-arm64', platform: 'macos', arch: 'arm64', binaryName: 'superagent-cli', releaseDirName: 'mac-arm64' },
    { id: 'node22-linux-x64', platform: 'linux', arch: 'x64', binaryName: 'superagent-cli', releaseDirName: 'linux-x64' },
  ];

  for (const target of targets) {
    const targetReleaseDir = path.join(outDir, target.releaseDirName);
    const targetBinPath = path.join(targetReleaseDir, target.binaryName);

    fs.mkdirSync(targetReleaseDir, { recursive: true });

    console.log(`[pack] Compiling binary for target: ${target.id} ...`);
    sh('npx', [
      'pkg',
      bundleFile,
      '--target', target.id,
      '--output', targetBinPath,
      '--no-bytecode',
      '--public',
      '--public-packages', '*'
    ], { cwd: cliDir });

    // 8. Copy and filter production node_modules to ensure target platform contains correct binaries
    console.log(`[pack] Copying production node_modules for target: ${target.releaseDirName}...`);
    const srcModulesDir = path.join(packDir, 'node_modules');
    const destModulesDir = path.join(targetReleaseDir, 'node_modules');
    fs.mkdirSync(destModulesDir, { recursive: true });

    for (const entry of externalDeps) {
      const srcPath = path.join(srcModulesDir, entry);
      const destPath = path.join(destModulesDir, entry);
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
      }
    }

    // Always copy @img which contains sharp's native binaries (filtered for the target platform)
    const srcImgDir = path.join(srcModulesDir, '@img');
    const destImgDir = path.join(destModulesDir, '@img');
    if (fs.existsSync(srcImgDir)) {
      fs.mkdirSync(destImgDir, { recursive: true });
      const imgEntries = fs.readdirSync(srcImgDir);
      for (const imgEntry of imgEntries) {
        let matches = false;
        if (target.releaseDirName === 'win-x64' && imgEntry.includes('win32-x64')) matches = true;
        else if (target.releaseDirName === 'mac-x64' && imgEntry.includes('darwin-x64')) matches = true;
        else if (target.releaseDirName === 'mac-arm64' && imgEntry.includes('darwin-arm64')) matches = true;
        else if (target.releaseDirName === 'linux-x64' && imgEntry.includes('linux-x64')) matches = true;

        if (matches) {
          fs.cpSync(path.join(srcImgDir, imgEntry), path.join(destImgDir, imgEntry), { recursive: true });
        }
      }
    }

    // 9. Compress release directory into a zip/tarball file
    const archiveName = `superagent-cli-${target.releaseDirName}`;
    console.log(`[pack] Creating archive for target: ${target.releaseDirName}...`);
    sh('tar', ['-czf', `${archiveName}.tar.gz`, '-C', targetReleaseDir, '.'], { cwd: outDir });
  }

  // 10. Cleanup staging directory
  console.log('[pack] Cleaning up staging directory...');
  // rmrf(packDir);

  console.log(`[pack] 🎉 CLI packaging successfully finished! Outdir: ${outDir}`);
}

run().catch((err) => {
  console.error('[pack] Build workflow crashed:', err);
  process.exit(1);
});
