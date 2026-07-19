import React from 'react';
import { Box, Text } from 'ink';

/** A selectable model entry in the model picker. */
export interface ModelPickItem {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  capabilities?: string[];
  isCurrent?: boolean;
}

/** Props for the {@link ModelPicker}. */
export interface ModelPickerProps {
  items: ModelPickItem[];
  selected: number;
  total: number;
}

const MAX_VISIBLE = 12;

/** Renders the arrow-navigable model picker shown when the user runs `/model`. */
export const ModelPicker: React.FC<ModelPickerProps> = ({ items, selected, total }) => {
  if (items.length === 0) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} marginY={1}>
        <Text dimColor color="gray">
          No models available.
        </Text>
      </Box>
    );
  }
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
      <Text bold color="cyan">
        Select a Model
      </Text>
      {visible.map((item, i) => {
        const isSel = i === selected;
        const caps = item.capabilities && item.capabilities.length > 0 ? ` · ${item.capabilities.join(', ')}` : '';
        const ctx = item.contextWindow ? ` · ${(item.contextWindow / 1000).toLocaleString()}k ctx` : '';
        return (
          <Box key={item.id}>
            <Text color={isSel ? 'cyan' : 'gray'}>{isSel ? '❯ ' : '  '}</Text>
            <Text bold color={isSel ? 'cyan' : 'white'}>
              {item.name}
            </Text>
            {item.isCurrent && (
              <Text color="green" bold>
                {' ●'}
              </Text>
            )}
            <Text color="gray" dimColor>
              {`  (${item.provider})${ctx}${caps}`}
            </Text>
          </Box>
        );
      })}
      {total > MAX_VISIBLE && (
        <Text dimColor color="gray">
          … {total - MAX_VISIBLE} more
        </Text>
      )}
      <Text dimColor color="gray">
        ↑/↓ to navigate · Enter to select · Esc to cancel
      </Text>
    </Box>
  );
};
