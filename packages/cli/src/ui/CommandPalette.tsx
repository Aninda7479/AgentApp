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
  /** Origin location tag for skills (e.g. "local .superagent", "local .claude"). */
  origin?: string;
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
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
        <Text dimColor color="gray">
          No matching skills or commands.
        </Text>
      </Box>
    );
  }

  const visible = rows.slice(0, MAX_VISIBLE);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
      <Box marginBottom={0}>
        <Text bold color="white">
          Commands &amp; Skills
        </Text>
      </Box>
      {visible.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <Box key={`h-${i}`} marginTop={0}>
              <Text bold color="gray">
                {'  '}
                {row.label.toUpperCase()}
              </Text>
            </Box>
          );
        }
        const isSel = i === selectedIndex;
        const item = row.item;
        const prefix = item.kind === 'skill' ? '⚡ ' : '/';
        const aliasText =
          item.kind === 'command' && item.aliases?.length
            ? ` (${item.aliases.map((a) => `/${a}`).join(', ')})`
            : '';
        const originTag = item.origin ? ` [${item.origin}]` : '';

        return (
          <Box key={item.name}>
            <Text color={isSel ? 'cyan' : 'gray'}>{isSel ? '❯ ' : '  '}</Text>
            <Text bold color={isSel ? 'cyan' : 'white'}>
              {prefix}
              {item.name}
            </Text>
            {originTag ? (
              <Text color="gray" dimColor>
                {originTag}
              </Text>
            ) : null}
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
        ↑/↓ navigate · Enter select · Esc close
      </Text>
    </Box>
  );
};

