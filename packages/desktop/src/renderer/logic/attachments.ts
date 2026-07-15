/**
 * `AttachmentService` — handles composer attachments: picking files from disk,
 * pasting from the clipboard, removing them, and copying/persisting them into a
 * chat folder before a prompt is sent. Keeps the attachment state in React
 * (via `ctx`) and the file IO in the main process (via IPC).
 */
import type { AppContext, ComposerAttachment } from './types';

export class AttachmentService {
  /**
   * Adds files chosen via the native file dialog as composer attachments
   * (each carries a `sourcePath` for the main process to copy later).
   */
  static fromFiles(ctx: AppContext, filePaths: string[] | undefined): void {
    if (filePaths && filePaths.length > 0) {
      const newAttachments = filePaths.map((filePath) => {
        const filename = filePath.split(/[\\/]/).pop() || 'file';
        return { filename, sourcePath: filePath };
      });
      ctx.setComposerAttachments((prev) => [...prev, ...newAttachments]);
      ctx.triggerToast(`Attached ${newAttachments.length} file(s) to draft`);
    }
  }

  /**
   * Extracts files pasted from the clipboard. Files with a real path are added
   * directly; files without a path (e.g. copied images) are read into a buffer
   * and stored as a base64-ready byte array for the main process to persist.
   */
  static async fromPaste(ctx: AppContext, files: FileList): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = (file as any).path;

      if (filePath) {
        const filename = filePath.split(/[\\/]/).pop() || 'file';
        ctx.setComposerAttachments((prev) => [...prev, { filename, sourcePath: filePath }]);
        ctx.triggerToast(`Attached: ${filename}`);
      } else {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const filename = file.name || `pasted-media-${Date.now()}.png`;
        ctx.setComposerAttachments((prev) => [...prev, { filename, buffer: Array.from(uint8) }]);
        ctx.triggerToast(`Attached pasted image`);
      }
    }
  }

  /** Removes the attachment at the given index from the composer. */
  static remove(ctx: AppContext, index: number): void {
    ctx.setComposerAttachments((prev) => prev.filter((_, idx) => idx !== index));
  }

  /**
   * Copies a single attachment into the chat's folder via IPC. Returns the saved
   * `{ filename, fullPath }` so the prompt can reference it, or null on failure.
   */
  static async copyToChat(
    ctx: AppContext,
    att: ComposerAttachment,
    chatId: string,
    projectName: string
  ): Promise<{ filename: string; fullPath: string } | null> {
    try {
      if (att.sourcePath) {
        const res = await ctx.ipc?.invoke('copy-file-to-chat', {
          sourcePath: att.sourcePath,
          chatId,
          projectName
        });
        if (res) return { filename: res.filename, fullPath: res.fullPath };
      } else if (att.buffer) {
        const res = await ctx.ipc?.invoke('save-chat-media-buffer', {
          buffer: att.buffer,
          filename: att.filename,
          chatId,
          projectName
        });
        if (res) return { filename: res.filename, fullPath: res.fullPath };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy attachment', err);
    }
    return null;
  }

  /**
   * Materializes all staged attachments into a chat folder, returning the saved
   * references (filename + on-disk path) to embed in the prompt's trajectory.
   */
  static async materialize(
    ctx: AppContext,
    attachmentsToSave: ComposerAttachment[],
    chatId: string,
    projectScope: string
  ): Promise<{ filename: string; fullPath: string }[]> {
    const saved: { filename: string; fullPath: string }[] = [];
    for (const att of attachmentsToSave) {
      const res = await AttachmentService.copyToChat(ctx, att, chatId, projectScope);
      if (res) saved.push(res);
    }
    return saved;
  }
}
