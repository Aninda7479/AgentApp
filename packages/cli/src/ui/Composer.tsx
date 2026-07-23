import React from 'react';
import { Box, Text } from 'ink';

/** Props for the presentational Composer input line. */
export interface ComposerProps {
  value: string;
  placeholder?: string;
  isBusy?: boolean;
}

/** Renders the input prompt in Grok Build minimal style (`superagent >`). */
export const Composer: React.FC<ComposerProps> = ({
  value,
  placeholder = 'Type prompt or /command…',
  isBusy = false,
}) => {
  return (
    <Box flexDirection="column" marginTop={0}>
      <Box borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" />
      <Box flexDirection="row" paddingX={0} marginTop={0}>
        <Text bold color="cyan">
          {'superagent '}
          <Text color="gray">&gt; </Text>
        </Text>
        {value.length === 0 ? (
          <Text dimColor color="gray">
            {placeholder}
          </Text>
        ) : (
          <Text color="white">{value}</Text>
        )}
        <Text color="cyan">▊</Text>
      </Box>
    </Box>
  );
};

