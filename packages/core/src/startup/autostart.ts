import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { SettingsStorage } from '../storage/settings-store.js';

const execAsync = promisify(exec);

export type AutostartTarget = 'desktop' | 'cli';

export interface AutostartOptions {
  /** Target execution path if known */
  execPath?: string;
  /** Port for CLI web server (defaults to 1469) */
  port?: number;
  /** Additional arguments */
  args?: string[];
}

export interface AutostartInfo {
  enabled: boolean;
  target: AutostartTarget;
  platform: NodeJS.Platform;
  command?: string;
  entryLocation?: string;
}

/**
 * Cross-platform Autostart Manager for SuperAgent.
 * Handles system startup registration on Windows, macOS, and Linux
 * for both Desktop (dormant background tray) and CLI (`superagent --serve`).
 */
export class AutostartManager {
  private static readonly REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  private static readonly APP_NAME_DESKTOP = 'SuperAgentDesktop';
  private static readonly APP_NAME_CLI = 'SuperAgentServe';

  /**
   * Checks whether autostart is enabled in the OS for the given target.
   */
  public static async isEnabled(target: AutostartTarget = 'cli'): Promise<boolean> {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        const appName = target === 'desktop' ? this.APP_NAME_DESKTOP : this.APP_NAME_CLI;
        const { stdout } = await execAsync(`reg query "${this.REG_KEY}" /v "${appName}"`);
        return stdout.includes(appName);
      } else if (platform === 'darwin') {
        const plistPath = this.getMacPlistPath(target);
        return fs.existsSync(plistPath);
      } else if (platform === 'linux') {
        const desktopPath = this.getLinuxDesktopPath(target);
        return fs.existsSync(desktopPath);
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Synchronous check for autostart state.
   */
  public static isEnabledSync(target: AutostartTarget = 'cli'): boolean {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        const appName = target === 'desktop' ? this.APP_NAME_DESKTOP : this.APP_NAME_CLI;
        const stdout = execSync(`reg query "${this.REG_KEY}" /v "${appName}"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        return stdout.includes(appName);
      } else if (platform === 'darwin') {
        const plistPath = this.getMacPlistPath(target);
        return fs.existsSync(plistPath);
      } else if (platform === 'linux') {
        const desktopPath = this.getLinuxDesktopPath(target);
        return fs.existsSync(desktopPath);
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Enables autostart for the specified target (Desktop or CLI).
   */
  public static async enable(
    target: AutostartTarget = 'cli',
    options: AutostartOptions = {}
  ): Promise<{ success: boolean; message: string; command?: string }> {
    const platform = os.platform();
    const command = this.resolveCommand(target, options);

    try {
      if (platform === 'win32') {
        const appName = target === 'desktop' ? this.APP_NAME_DESKTOP : this.APP_NAME_CLI;
        // Escape quotes for Windows reg command
        const escapedCommand = command.replace(/"/g, '\\"');
        await execAsync(`reg add "${this.REG_KEY}" /v "${appName}" /t REG_SZ /d "${escapedCommand}" /f`);
      } else if (platform === 'darwin') {
        const plistPath = this.getMacPlistPath(target);
        const plistDir = path.dirname(plistPath);
        if (!fs.existsSync(plistDir)) {
          fs.mkdirSync(plistDir, { recursive: true });
        }
        const plistContent = this.generateMacPlist(target, command);
        fs.writeFileSync(plistPath, plistContent, 'utf-8');
      } else if (platform === 'linux') {
        const desktopPath = this.getLinuxDesktopPath(target);
        const desktopDir = path.dirname(desktopPath);
        if (!fs.existsSync(desktopDir)) {
          fs.mkdirSync(desktopDir, { recursive: true });
        }
        const desktopContent = this.generateLinuxDesktop(target, command);
        fs.writeFileSync(desktopPath, desktopContent, 'utf-8');
      }

      // Update settings
      if (target === 'desktop') {
        SettingsStorage.saveSettings({ general: { openAtLogin: true } });
      } else {
        SettingsStorage.saveSettings({
          general: { openAtLogin: true },
          webApp: { autoStart: true, port: options.port || 1469 }
        });
      }

      return {
        success: true,
        message: `Autostart enabled for SuperAgent (${target.toUpperCase()}) on system startup.`,
        command
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to enable autostart: ${err?.message || err}`,
        command
      };
    }
  }

  /**
   * Disables autostart for the specified target.
   */
  public static async disable(
    target: AutostartTarget = 'cli'
  ): Promise<{ success: boolean; message: string }> {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        const appName = target === 'desktop' ? this.APP_NAME_DESKTOP : this.APP_NAME_CLI;
        try {
          await execAsync(`reg delete "${this.REG_KEY}" /v "${appName}" /f`);
        } catch (e: any) {
          // If key doesn't exist, ignore
          if (!e.message?.includes('unable to find') && !e.message?.includes('The system was unable to find')) {
            throw e;
          }
        }
      } else if (platform === 'darwin') {
        const plistPath = this.getMacPlistPath(target);
        if (fs.existsSync(plistPath)) {
          fs.unlinkSync(plistPath);
        }
      } else if (platform === 'linux') {
        const desktopPath = this.getLinuxDesktopPath(target);
        if (fs.existsSync(desktopPath)) {
          fs.unlinkSync(desktopPath);
        }
      }

      if (target === 'desktop') {
        SettingsStorage.saveSettings({ general: { openAtLogin: false } });
      } else {
        SettingsStorage.saveSettings({
          general: { openAtLogin: false },
          webApp: { autoStart: false }
        });
      }

      return {
        success: true,
        message: `Autostart disabled for SuperAgent (${target.toUpperCase()}).`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to disable autostart: ${err?.message || err}`
      };
    }
  }

  /**
   * Returns comprehensive info about current autostart status.
   */
  public static async getInfo(target: AutostartTarget = 'cli'): Promise<AutostartInfo> {
    const enabled = await this.isEnabled(target);
    const platform = os.platform();
    let entryLocation: string | undefined;

    if (platform === 'win32') {
      entryLocation = `${this.REG_KEY}\\${target === 'desktop' ? this.APP_NAME_DESKTOP : this.APP_NAME_CLI}`;
    } else if (platform === 'darwin') {
      entryLocation = this.getMacPlistPath(target);
    } else if (platform === 'linux') {
      entryLocation = this.getLinuxDesktopPath(target);
    }

    return {
      enabled,
      target,
      platform,
      entryLocation,
      command: this.resolveCommand(target)
    };
  }

  private static resolveCommand(target: AutostartTarget, options: AutostartOptions = {}): string {
    if (options.execPath) {
      const extraArgs = options.args ? ` ${options.args.join(' ')}` : '';
      return `"${options.execPath}"${extraArgs}`;
    }

    if (target === 'desktop') {
      if (process.execPath && !process.execPath.toLowerCase().endsWith('node.exe') && !process.execPath.toLowerCase().endsWith('node')) {
        return `"${process.execPath}" --autostart`;
      }
      // Fallback for dev / standard desktop install
      return `superagent-desktop --autostart`;
    }

    // CLI serve command
    const port = options.port || 1469;
    const nodePath = process.execPath;
    
    // Check if running as global cli or local npm script
    if (nodePath && (nodePath.includes('node') || nodePath.includes('node.exe'))) {
      const mainScript = process.argv[1];
      if (mainScript && fs.existsSync(mainScript)) {
        return `"${nodePath}" "${mainScript}" --serve --web-port ${port}`;
      }
    }

    return `superagent --serve --web-port ${port}`;
  }

  private static getMacPlistPath(target: AutostartTarget): string {
    const home = os.homedir();
    const id = target === 'desktop' ? 'com.opensource.agentapp.desktop' : 'com.opensource.agentapp.serve';
    return path.join(home, 'Library', 'LaunchAgents', `${id}.plist`);
  }

  private static getLinuxDesktopPath(target: AutostartTarget): string {
    const home = os.homedir();
    const id = target === 'desktop' ? 'superagent-desktop.desktop' : 'superagent-serve.desktop';
    return path.join(home, '.config', 'autostart', id);
  }

  private static generateMacPlist(target: AutostartTarget, command: string): string {
    const label = target === 'desktop' ? 'com.opensource.agentapp.desktop' : 'com.opensource.agentapp.serve';
    const parts = command.split(' ').filter(Boolean);
    const argsXml = parts.map(p => `      <string>${p.replace(/"/g, '')}</string>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
  </dict>
</plist>
`;
  }

  private static generateLinuxDesktop(target: AutostartTarget, command: string): string {
    const name = target === 'desktop' ? 'SuperAgent Desktop' : 'SuperAgent Server';
    const comment = target === 'desktop' ? 'SuperAgent Autonomous AI Agent' : 'SuperAgent Background Web Server';

    return `[Desktop Entry]
Type=Application
Exec=${command}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=${name}
Comment=${comment}
`;
  }
}
