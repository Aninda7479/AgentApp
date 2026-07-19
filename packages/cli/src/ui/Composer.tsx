import React from 'react';
import { Box, Text } from 'ink';

/** Props for the presentational Composer input line. All key handling lives in
 *  App (a single useInput); this component only renders the current value. */
export interface ComposerProps {
  value: string;
  placeholder?: string;
  isBusy?: boolean;
}

/** Renders the current input line with a blinking-style cursor block. */
export const Composer: React.FC<ComposerProps> = ({
  value,
  placeholder = 'Type a prompt or /command...',
  isBusy = false,
}) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Subtle top border line to separate the input area from scrolling logs */}
      <Box borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" />
      <Box flexDirection="row" paddingX={1} marginTop={1}>
        <Text bold color="cyan">
          {'❯ '}
        </Text>
        {value.length === 0 ? (
          <Text dimColor color="gray">
            {placeholder}
          </Text>
        ) : (
          <Text>{value}</Text>
        )}
        <Text color="cyan">█</Text>
      </Box>
    </Box>
  );
};
