import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ComposerProps {
  onSubmit: (input: string) => void;
  onQueue?: (input: string) => void;
  onTranscriptToggle?: () => void;
  onPermissionCycle?: () => void;
  isDisabled?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  onQueue,
  onTranscriptToggle,
  onPermissionCycle,
  isDisabled = false,
  placeholder = 'Type a prompt or /command...',
  value: externalValue,
  onChange: externalOnChange,
}) => {
  const [internalValue, setInternalValue] = useState('');
  const value = externalValue !== undefined ? externalValue : internalValue;

  const setValue = (val: string) => {
    if (externalOnChange) {
      externalOnChange(val);
    } else {
      setInternalValue(val);
    }
  };

  useInput((input, key) => {
    if (isDisabled) return;

    if (key.ctrl && (input === 'o' || input === 'O')) {
      if (onTranscriptToggle) onTranscriptToggle();
      return;
    }

    if (key.tab && key.shift) {
      if (onPermissionCycle) onPermissionCycle();
      return;
    }

    if (key.tab && !key.shift) {
      if (value.trim().length > 0 && onQueue) {
        onQueue(value.trim());
        setValue('');
      }
      return;
    }

    if (key.return) {
      if (value.trim().length > 0) {
        onSubmit(value.trim());
        setValue('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue(value.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue(value + input);
    }
  });

  return (
    <Box borderStyle="round" borderColor={isDisabled ? 'gray' : 'blue'} paddingX={1}>
      <Text bold color="cyan">
        ❯{' '}
      </Text>
      {value.length === 0 ? (
        <Text dimColor color="gray">
          {placeholder}
        </Text>
      ) : (
        <Text>{value}</Text>
      )}
      <Text color="cyan">▋</Text>
    </Box>
  );
};
