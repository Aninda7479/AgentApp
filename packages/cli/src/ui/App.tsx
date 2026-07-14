import React, { useState, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import { MarkdownStream } from './MarkdownStream.js';
import { Composer } from './Composer.js';
import { TurnQueueManager } from '../shortcuts/queue.js';
import { TranscriptManager } from '../shortcuts/transcript.js';
import { PermissionLevel, cyclePermissionLevel, getPermissionLabel } from '../shortcuts/permissions.js';
import { createSessionContext } from '../types.js';
import { buildSlashCommandRouter, formatSlashCommandHelp } from '../commands/registry.js';
import { DiffReviewer } from '../commands/diff.js';
import { ContextMessage } from '../commands/compact.js';

/** Root props for the SuperAgent TUI application. */
export interface AppProps {
  provider?: string;
  model?: string;
  initialPermission?: PermissionLevel;
  initialVerbose?: boolean;
}

/** A single message displayed in the chat view. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
}

/** Main SuperAgent Terminal TUI: manages chat messages, streaming, queue, and keyboard shortcuts. */
export const App: React.FC<AppProps> = ({
  provider = 'openai',
  model = 'default',
  initialPermission = 'ask',
  initialVerbose = false,
}) => {
  const { exit } = useApp();
  const [permission, setPermission] = useState<PermissionLevel>(initialPermission);
  const [verbose, setVerbose] = useState<boolean>(initialVerbose);
  const [messages, setMessagesState] = useState<ChatMessage[]>([
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

  // Mirror of `messages` so the slash-command router closures always read the
  // latest conversation even though the router is created once.
  const messagesRef = useRef<ChatMessage[]>(messages);
  const setMessages = (next: ChatMessage[]): void => {
    messagesRef.current = next;
    setMessagesState(next);
  };

  // Bridge between the TUI's ChatMessage[] and the router's ContextMessage[]
  // used by the /compact command.
  const getContextMessages = (): ContextMessage[] =>
    messagesRef.current.map((m) => ({ role: m.role, content: m.content }));
  const setContextMessages = (ctxMsgs: ContextMessage[]): void => {
    setMessages(
      ctxMsgs.map((m, i) => ({
        id: `c-${i}-${m.role}`,
        role: m.role as ChatMessage['role'],
        content: m.content,
        timestamp: Date.now(),
      }))
    );
  };

  const [router] = useState(() =>
    buildSlashCommandRouter({
      session: createSessionContext(provider, model),
      getMessages: getContextMessages,
      setMessages: setContextMessages,
      diffReviewer: new DiffReviewer(),
    })
  );

  const appendMessage = (msg: ChatMessage): void => {
    setMessages([...messagesRef.current, msg]);
  };

  const processNextQueuedTurn = (): void => {
    const nextTurn = queueManager.dequeue();
    setQueuedTurnsCount(queueManager.count());
    if (nextTurn) {
      handleSendMessage(nextTurn.prompt);
    }
  };

  const handleSendMessage = (text: string): void => {
    const trimmed = text.trim();

    if (trimmed === '/exit') {
      exit();
      return;
    }
    if (trimmed === '/clear') {
      setMessages([]);
      return;
    }
    if (trimmed === '/help') {
      const helpMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: formatSlashCommandHelp(router),
        timestamp: Date.now(),
      };
      appendMessage(helpMsg);
      return;
    }

    const isSlash = router.isSlashCommand(trimmed);
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    transcriptManager.addRecord('user', text);
    appendMessage(userMsg);
    setIsStreaming(true);

    setTimeout(() => {
      if (isSlash) {
        router
          .execute(trimmed)
          .then((res) => {
            const out = res.success
              ? res.output ?? ''
              : `Error: ${res.error ?? 'command failed'}`;
            transcriptManager.addRecord('system', out);
            appendMessage({
              id: `msg-${Date.now() + 1}`,
              role: 'system',
              content: out,
              timestamp: Date.now(),
            });
          })
          .finally(() => {
            setIsStreaming(false);
            processNextQueuedTurn();
          });
        return;
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Received prompt: "${text}". Permission mode is [${permission}].`,
        timestamp: Date.now(),
      };
      transcriptManager.addRecord('assistant', assistantMsg.content);
      appendMessage(assistantMsg);
      setIsStreaming(false);
      processNextQueuedTurn();
    }, 100);
  };

  const handleQueueTurn = (text: string): void => {
    queueManager.enqueue(text);
    setQueuedTurnsCount(queueManager.count());
    transcriptManager.addRecord('system', `Queued turn: ${text}`);
  };

  const handleToggleTranscript = (): void => {
    setVerbose((prev) => !prev);
  };

  const handleCyclePermission = (): void => {
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
          Shortcuts: [Tab] Queue Turn | [Shift+Tab] Cycle Permission | [Ctrl+O] Toggle Verbose | Type /help for commands
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
