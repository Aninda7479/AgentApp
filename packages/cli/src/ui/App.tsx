import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { MarkdownStream } from './MarkdownStream.js';
import { Composer } from './Composer.js';
import { TurnQueueManager } from '../shortcuts/queue.js';
import { TranscriptManager } from '../shortcuts/transcript.js';
import { PermissionLevel, cyclePermissionLevel, getPermissionLabel } from '../shortcuts/permissions.js';

export interface AppProps {
  provider?: string;
  model?: string;
  initialPermission?: PermissionLevel;
  initialVerbose?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
}

export const App: React.FC<AppProps> = ({
  provider = 'openai',
  model = 'default',
  initialPermission = 'ask',
  initialVerbose = false,
}) => {
  const { exit } = useApp();
  const [permission, setPermission] = useState<PermissionLevel>(initialPermission);
  const [verbose, setVerbose] = useState<boolean>(initialVerbose);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'sys-1',
      role: 'system',
      content: `Welcome to SuperAgent Terminal CLI (${provider} / ${model}). Type prompts or slash commands (/help, /exit).`,
      timestamp: Date.now(),
    },
  ]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [queueManager] = useState(() => new TurnQueueManager());
  const [transcriptManager] = useState(() => new TranscriptManager());
  const [queuedTurnsCount, setQueuedTurnsCount] = useState<number>(0);

  const handleSendMessage = (text: string) => {
    if (text === '/exit') {
      exit();
      return;
    }
    if (text === '/clear') {
      setMessages([]);
      return;
    }
    if (text === '/help') {
      const helpMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: `**Shortcuts & Commands:**\n- **Tab**: Queue turn\n- **Ctrl+O**: Toggle verbose mode\n- **Shift+Tab**: Cycle execution permissions\n- **/clear**: Clear messages\n- **/exit**: Quit CLI`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, helpMsg]);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    transcriptManager.addRecord('user', text);
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Received prompt: "${text}". Permission mode is [${permission}].`,
        timestamp: Date.now(),
      };
      transcriptManager.addRecord('assistant', assistantMsg.content);
      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(false);

      const nextTurn = queueManager.dequeue();
      setQueuedTurnsCount(queueManager.count());
      if (nextTurn) {
        handleSendMessage(nextTurn.prompt);
      }
    }, 100);
  };

  const handleQueueTurn = (text: string) => {
    queueManager.enqueue(text);
    setQueuedTurnsCount(queueManager.count());
    transcriptManager.addRecord('system', `Queued turn: ${text}`);
  };

  const handleToggleTranscript = () => {
    setVerbose((prev) => !prev);
  };

  const handleCyclePermission = () => {
    setPermission((prev) => cyclePermissionLevel(prev));
  };

  return (
    <Box flexDirection="column" padding={1} width="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          === SuperAgent Terminal TUI ===
        </Text>
        <Text>
          Provider: <Text color="yellow">{provider}</Text> | Model: <Text color="yellow">{model}</Text> | Permission:{' '}
          <Text color={permission === 'auto' ? 'green' : permission === 'deny' ? 'red' : 'yellow'}>
            {getPermissionLabel(permission)}
          </Text>{' '}
          | Verbose: <Text color={verbose ? 'green' : 'gray'}>{verbose ? 'ON' : 'OFF'}</Text> | Queued:{' '}
          <Text color="magenta">{queuedTurnsCount}</Text>
        </Text>
        <Text dimColor color="gray">
          Shortcuts: [Tab] Queue Turn | [Shift+Tab] Cycle Permission | [Ctrl+O] Toggle Verbose
        </Text>
      </Box>

      {/* Message List */}
      <Box flexDirection="column" marginY={1}>
        {messages.map((msg) => (
          <Box key={msg.id} flexDirection="column" marginBottom={1}>
            <Text bold color={msg.role === 'user' ? 'green' : msg.role === 'assistant' ? 'blue' : 'yellow'}>
              {msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}:
            </Text>
            <MarkdownStream content={msg.content} verbose={verbose} />
          </Box>
        ))}
        {isStreaming && (
          <Box marginBottom={1}>
            <Text bold color="blue">
              Assistant:{' '}
            </Text>
            <MarkdownStream content="Thinking..." isStreaming={true} verbose={verbose} />
          </Box>
        )}
      </Box>

      {/* Verbose Transcript overlay if enabled */}
      {verbose && (
        <Box borderStyle="single" borderColor="yellow" flexDirection="column" marginY={1} paddingX={1}>
          <Text bold color="yellow">
            --- Verbose Transcript Log ---
          </Text>
          <Text dimColor>{transcriptManager.formatVerboseTranscript() || 'No logs yet.'}</Text>
        </Box>
      )}

      {/* Composer Input */}
      <Composer
        onSubmit={handleSendMessage}
        onQueue={handleQueueTurn}
        onTranscriptToggle={handleToggleTranscript}
        onPermissionCycle={handleCyclePermission}
        isDisabled={isStreaming}
      />
    </Box>
  );
};
