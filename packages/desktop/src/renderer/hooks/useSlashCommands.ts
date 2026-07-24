/**
 * React Hook for Slash Command Suggestions
 */

import { useMemo } from 'react';

export interface SlashCommandItem {
  name: string;
  description: string;
  type: 'command' | 'skill';
}

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  { name: 'help', description: 'Show available commands and usage guide', type: 'command' },
  { name: 'clear', description: 'Clear conversation history', type: 'command' },
  { name: 'compact', description: 'Summarize and compact conversation context window', type: 'command' },
  { name: 'undo', description: 'Revert last prompt turn and steps', type: 'command' },
];

export function useSlashCommands(inputPrompt: string): {
  isOpen: boolean;
  suggestions: SlashCommandItem[];
} {
  const query = useMemo(() => {
    if (!inputPrompt.startsWith('/')) return null;
    const match = inputPrompt.match(/^\/([a-zA-Z0-9_-]*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [inputPrompt]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    return BUILTIN_SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().includes(query));
  }, [query]);

  return {
    isOpen: query !== null && suggestions.length > 0,
    suggestions,
  };
}
