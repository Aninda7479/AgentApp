/** Sandbox permission mode: controls file edit and command execution policies. */
export type PermissionMode = 'read-only' | 'auto-approve-edits' | 'full-autonomy';

/** A request for user confirmation before performing an action. */
export interface ConfirmationRequest {
  action: string;
  command?: string;
  filePath?: string;
  details?: Record<string, unknown>;
}

/** Handler type for user-in-the-loop permission prompts. */
export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean>;

/** Options for the permission mode controller. */
export interface PermissionControllerOptions {
  initialMode?: PermissionMode;
  onConfirmationRequired?: ConfirmationHandler;
}

/** Controls the sandbox permission mode and handles user confirmation requests. */
export class PermissionModeController {
  private mode: PermissionMode;
  private onConfirmationRequired?: ConfirmationHandler;
  /** Commands the user has pre-approved for this session (the
   *  "Always allow" choice). Lets the executor skip re-prompting
   *  for commands the user has already green-lit, in any mode. */
  private preApproved: Set<string> = new Set();

  constructor(options?: PermissionControllerOptions) {
    this.mode = options?.initialMode ?? 'read-only';
    this.onConfirmationRequired = options?.onConfirmationRequired;
  }

  public getMode(): PermissionMode {
    return this.mode;
  }

  public setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  /** Records a command as pre-approved for this session. */
  public preApprove(command: string): void {
    if (command && command.trim().length > 0) {
      this.preApproved.add(command.trim());
    }
  }

  /** Whether a command was pre-approved this session. */
  public isPreApproved(command: string): boolean {
    const trimmed = command.trim();
    if (this.preApproved.has(trimmed)) return true;
    // Prefix match: pre-approving "git" covers "git status", etc.
    for (const entry of this.preApproved) {
      if (trimmed === entry || trimmed.startsWith(entry + ' ')) return true;
    }
    return false;
  }

  public canModifyFile(): boolean {
    return this.mode !== 'read-only';
  }

  public canAutoExecuteCommand(): boolean {
    return this.mode === 'full-autonomy';
  }

  public async requestApproval(request: ConfirmationRequest): Promise<boolean> {
    if (this.mode === 'full-autonomy') {
      return true;
    }
    if (this.onConfirmationRequired) {
      return await this.onConfirmationRequired(request);
    }
    return false;
  }
}
