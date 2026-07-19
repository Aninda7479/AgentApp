import React from 'react';
import { Box, Text } from 'ink';

/** A single selectable entry shown in the palette (a skill or a slash command). */
export interface PaletteItem {
  /** Command name without slash (e.g. "model") or skill id. */
  name: string;
  description: string;
  aliases?: string[];
  /** Distinguishes skills from slash commands for rendering + Enter handling. */
  kind?: 'command' | 'skill';
}

/** A row rendered by the palette: either a section header or a selectable item. */
export type PaletteRow =
  | { kind: 'header'; label: string }
  | { kind: 'item'; item: PaletteItem };

/** Props for the {@link CommandPalette}. */
export interface CommandPaletteProps {
  rows: PaletteRow[];
  /** Display index (into `rows`) of the currently highlighted selectable item. */
  selectedIndex: number;
  /** Total number of selectable items (may exceed visible when capped). */
  total: number;
}

const MAX_VISIBLE = 14;

/** Renders the arrow-navigable palette shown when the user types `/`. Lists
 *  runnable skills and slash commands in sections; arrow keys move the
 *  highlight across selectable items. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ rows, selectedIndex, total }) => {
  if (rows.length === 0) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} marginY={1}>
        <Text dimColor color="gray">
          No matching skills or commands.
        </Text>
      </Box>
    );
  }

  const visible = rows.slice(0, MAX_VISIBLE);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
      <Text bold color="cyan">
        Slash Commands &amp; Skills
      </Text>
      {visible.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <Box key={`h-${i}`}>
              <Text bold color="gray">
                {'  '}
                {row.label}
              </Text>
            </Box>
          );
        }
        const isSel = i === selectedIndex;
        const item = row.item;
        const prefix = item.kind === 'skill' ? '✦ ' : '/';
        const aliasText =
          item.kind === 'command' && item.aliases?.length
            ? ` (${item.aliases.map((a) => `/${a}`).join(', ')})`
            : '';
        return (
          <Box key={item.name}>
            <Text color={isSel ? 'cyan' : 'gray'}>{isSel ? '❯ ' : '  '}</Text>
            <Text bold color={isSel ? 'cyan' : 'white'}>
              {prefix}
              {item.name}
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
