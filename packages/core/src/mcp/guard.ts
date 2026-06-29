export type MCPPermissionMode = 'auto' | 'manual' | 'read-only';

export interface MCPToolContext {
  serverName: string;
  toolName: string;
  args: Record<string, any>;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    [key: string]: any;
  };
}

export type PermissionRequestHandler = (context: MCPToolContext) => Promise<boolean>;

export interface MCPPermissionGuardOptions {
  mode?: MCPPermissionMode;
  onPermissionRequest?: PermissionRequestHandler;
  allowedTools?: string[];
  blockedTools?: string[];
}

export class MCPPermissionGuard {
  private mode: MCPPermissionMode;
  private onPermissionRequest?: PermissionRequestHandler;
  private allowedTools: Set<string>;
  private blockedTools: Set<string>;

  constructor(options: MCPPermissionGuardOptions = {}) {
    this.mode = options.mode || 'manual';
    this.onPermissionRequest = options.onPermissionRequest;
    this.allowedTools = new Set(options.allowedTools || []);
    this.blockedTools = new Set(options.blockedTools || []);
  }

  public setMode(mode: MCPPermissionMode): void {
    this.mode = mode;
  }

  public getMode(): MCPPermissionMode {
    return this.mode;
  }

  public allowTool(toolName: string): void {
    this.allowedTools.add(toolName);
    this.blockedTools.delete(toolName);
  }

  public blockTool(toolName: string): void {
    this.blockedTools.add(toolName);
    this.allowedTools.delete(toolName);
  }

  public async verifyPermission(context: MCPToolContext): Promise<boolean> {
    const fullToolName = `${context.serverName}__${context.toolName}`;

    if (this.blockedTools.has(context.toolName) || this.blockedTools.has(fullToolName)) {
      return false;
    }

    if (this.allowedTools.has(context.toolName) || this.allowedTools.has(fullToolName)) {
      return true;
    }

    if (this.mode === 'auto') {
      return true;
    }

    const isDestructive = Boolean(context.annotations?.destructiveHint);
    const isReadOnly = Boolean(context.annotations?.readOnlyHint);

    if (this.mode === 'read-only') {
      if (isDestructive || !isReadOnly) {
        return false;
      }
      return true;
    }

    if (this.onPermissionRequest) {
      return await this.onPermissionRequest(context);
    }

    if (isDestructive) {
      return false;
    }

    return true;
  }
}
