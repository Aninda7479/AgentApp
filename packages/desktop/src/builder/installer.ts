export interface TargetPlatformOptions {
  win?: ('nsis' | 'portable' | 'zip')[];
  mac?: ('dmg' | 'zip' | 'pkg')[];
  linux?: ('AppImage' | 'deb' | 'rpm' | 'tar.gz')[];
}

export interface ReleaseInstallerConfigOptions {
  appId?: string;
  productName?: string;
  copyright?: string;
  directories?: {
    output?: string;
    buildResources?: string;
  };
  targets?: TargetPlatformOptions;
  artifactName?: string;
  asar?: boolean;
}

export interface ResolvedInstallerConfigOptions {
  appId: string;
  productName: string;
  copyright: string;
  directories: {
    output: string;
    buildResources: string;
  };
  targets: {
    win: ('nsis' | 'portable' | 'zip')[];
    mac: ('dmg' | 'zip' | 'pkg')[];
    linux: ('AppImage' | 'deb' | 'rpm' | 'tar.gz')[];
  };
  artifactName: string;
  asar: boolean;
}

export interface ElectronBuilderConfiguration {
  appId: string;
  productName: string;
  copyright: string;
  directories: {
    output: string;
    buildResources: string;
  };
  files: string[];
  asar: boolean;
  win: {
    target: string[];
    icon: string;
    artifactName: string;
  };
  nsis: {
    oneClick: boolean;
    allowToChangeInstallationDirectory: boolean;
    createDesktopShortcut: boolean;
  };
  mac: {
    target: string[];
    icon: string;
    category: string;
  };
  linux: {
    target: string[];
    icon: string;
    category: string;
  };
}

export interface BuildResult {
  success: boolean;
  artifacts: string[];
  config: ElectronBuilderConfiguration;
  logs: string[];
}

export class ReleaseInstallerBuilder {
  private options: ResolvedInstallerConfigOptions;

  constructor(options: ReleaseInstallerConfigOptions = {}) {
    this.options = {
      appId: options.appId || 'com.superagent.desktop',
      productName: options.productName || 'SuperAgent Desktop',
      copyright: options.copyright || `Copyright © ${new Date().getFullYear()} SuperAgent`,
      directories: {
        output: options.directories?.output || 'release',
        buildResources: options.directories?.buildResources || 'build'
      },
      targets: {
        win: options.targets?.win || ['nsis', 'portable'],
        mac: options.targets?.mac || ['dmg', 'zip'],
        linux: options.targets?.linux || ['AppImage', 'deb']
      },
      artifactName: options.artifactName || '${productName}-Setup-${version}.${ext}',
      asar: options.asar ?? true
    };
  }

  public generateBuildConfig(): ElectronBuilderConfiguration {
    return {
      appId: this.options.appId,
      productName: this.options.productName,
      copyright: this.options.copyright,
      directories: {
        output: this.options.directories.output,
        buildResources: this.options.directories.buildResources
      },
      files: [
        'dist/**/*',
        'package.json'
      ],
      asar: this.options.asar,
      win: {
        target: this.options.targets.win || ['nsis'],
        icon: 'build/icon.ico',
        artifactName: this.options.artifactName
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true
      },
      mac: {
        target: this.options.targets.mac || ['dmg'],
        icon: 'build/icon.icns',
        category: 'public.app-category.productivity'
      },
      linux: {
        target: this.options.targets.linux || ['AppImage'],
        icon: 'build/icons',
        category: 'Utility'
      }
    };
  }

  public validateConfig(config: ElectronBuilderConfiguration): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.appId) errors.push('Missing appId');
    if (!config.productName) errors.push('Missing productName');
    if (!config.directories || !config.directories.output) errors.push('Missing output directory');
    if (!config.win || !Array.isArray(config.win.target) || config.win.target.length === 0) {
      errors.push('Windows target builds must be specified');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async runSimulatedBuild(): Promise<BuildResult> {
    const config = this.generateBuildConfig();
    const validation = this.validateConfig(config);

    if (!validation.valid) {
      return {
        success: false,
        artifacts: [],
        config,
        logs: validation.errors
      };
    }

    const artifacts = [
      `${config.directories.output}/${config.productName}-Setup-0.1.0.exe`,
      `${config.directories.output}/${config.productName}-0.1.0-win.zip`,
      `${config.directories.output}/${config.productName}-0.1.0.dmg`,
      `${config.directories.output}/${config.productName}-0.1.0.AppImage`
    ];

    return {
      success: true,
      artifacts,
      config,
      logs: ['Build simulation completed successfully for Windows, macOS, and Linux targets.']
    };
  }
}
