import React from 'react';
import { Box, Text } from 'ink';

/** A single selectable command shown in the palette. */
export interface PaletteItem {
  name: string;
  description: string;
  aliases?: string[];
}

/** Props for the {@link CommandPalette}. */
export interface CommandPaletteProps {
  items: PaletteItem[];
  selected: number;
  /** Total matches (may exceed items.length when the list is capped). */
  total: number;
}

const MAX_VISIBLE = 12;

/** Renders the arrow-navigable slash-command palette shown when the user types `/`. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ items, selected, total }) => {
  if (items.length === 0) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} marginY={1}>
        <Text dimColor color="gray">
          No matching commands.
        </Text>
      </Box>
    );
  }

  const visible = items.slice(0, MAX_VISIBLE);
  const start = 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
      <Text bold color="cyan">
        Slash Commands
      </Text>
      {visible.map((item, i) => {
        const isSel = start + i === selected;
        const aliasText = item.aliases?.length ? ` (${item.aliases.map((a) => `/${a}`).join(', ')})` : '';
        return (
          <Box key={item.name}>
            <Text color={isSel ? 'cyan' : 'gray'}>{isSel ? '❯ ' : '  '}</Text>
            <Text bold color={isSel ? 'cyan' : 'white'}>
              /{item.name}
            </Text>
            <Text color="gray" dimColor>
              {aliasText}
            </Text>
            <Text color="gray"> — {item.description}</Text>
          </Box>
        );
      })}
      {total > MAX_VISIBLE && (
        <Text dimColor color="gray">
          … {total - MAX_VISIBLE} more (keep typing to filter)
        </Text>
      )}
      <Text dimColor color="gray">
        ↑/↓ to navigate · Enter to run · Esc to close
      </Text>
    </Box>
  );
};
