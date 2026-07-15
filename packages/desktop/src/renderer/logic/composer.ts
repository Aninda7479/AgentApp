import type { SlashSuggestion } from '../components/slashCommands';

/**
 * Pure logic for the Composer prompt input: building the send payload from the
 * current approval mode, labelling that mode, and filtering the slash
 * autocomplete list. Kept out of the component so its JSX stays a thin view.
 */
export class ComposerService {
  /**
   * Maps the local approval-mode toggle to the `mode` value sent with a prompt
   * (always → `auto`, never → `bypass`, ask → `plan`) and packages the model +
   * attachments into the options payload the App's send handler expects.
   */
  static buildSendOptions(
    model: string,
    approvalMode: 'always' | 'never' | 'ask',
    attachments: string[]
  ): { model: string; mode: 'auto' | 'plan' | 'bypass'; attachments: string[] } {
    const mode: 'auto' | 'plan' | 'bypass' =
      approvalMode === 'always' ? 'auto' : approvalMode === 'never' ? 'bypass' : 'plan';
    return { model, mode, attachments };
  }

  /** Returns the human-readable label for the approval-mode pill. */
  static approvalLabel(mode: 'always' | 'never' | 'ask'): string {
    if (mode === 'always') return 'Always approve';
    if (mode === 'never') return 'Never approve';
    return 'Ask for approval';
  }

  /** Filters the slash autocomplete list by a case-insensitive free-text query. */
  static filterSuggestions(all: SlashSuggestion[], query: string): SlashSuggestion[] {
    const q = query.toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }
}
