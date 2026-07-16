import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { MarkdownStream } from './MarkdownStream.js';
import { Composer } from './Composer.js';
import { TurnQueueManager } from '../shortcuts/queue.js';
import { TranscriptManager } from '../shortcuts/transcript.js';
import { PermissionLevel, cyclePermissionLevel, getPermissionLabel } from '../shortcuts/permissions.js';
import { createSessionContext } from '../types.js';
import { buildSlashCommandRouter, formatSlashCommandHelp } from '../commands/registry.js';
import { DiffReviewer } from '../commands/diff.js';
import { TaskManager } from '../commands/tasks.js';
import { ContextMessage } from '../commands/compact.js';
import { ImageAttachment, SessionLoopManager, LoopTask } from '@superagent/core';
import { prepareAttachments, formatBytes } from '../attachments.js';

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
  /** Image attachments carried by this (user) message, if any. */
  attachments?: ImageAttachment[];
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
  const [isStreaming, setIsStreamingState] = useState<boolean>(false);
  const isStreamingRef = useRef<boolean>(false);
  const setIsStreaming = (next: boolean): void => {
    isStreamingRef.current = next;
    setIsStreamingState(next);
  };
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

  // Mirror of `permission` so the slash-command router closures always read the
  // latest permission level even though the router is created once.
  const permissionRef = useRef<PermissionLevel>(permission);
  permissionRef.current = permission;

  // Shared queue of image attachments populated by the `/attach` command and
  // merged into the next user message. Held in a ref so the router (created
  // once) and the send handler share the same array by reference.
  const pendingAttachmentsRef = useRef<ImageAttachment[]>([]);

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

  const loopManagerRef = useRef<SessionLoopManager | null>(null);
  const [, setActiveLoopsList] = useState<LoopTask[]>([]);

  const startLoop = (prompt?: string, interval?: string): string => {
    if (!loopManagerRef.current) {
      loopManagerRef.current = new SessionLoopManager((task) => {
        if (isStreamingRef.current) {
          handleQueueTurn(task.prompt);
        } else {
          handleSendMessage(task.prompt);
        }
      }, () => process.cwd());
    }
    const task = loopManagerRef.current.start(interval, prompt);
    setActiveLoopsList(loopManagerRef.current.getTasks());
    return task.id;
  };

  const stopLoop = (id: string): boolean => {
    if (!loopManagerRef.current) return false;
    const ok = loopManagerRef.current.stop(id);
    setActiveLoopsList(loopManagerRef.current.getTasks());
    return ok;
  };

  const listLoops = (): LoopTask[] => {
    if (!loopManagerRef.current) return [];
    return loopManagerRef.current.getTasks();
  };

  const clearLoops = (): void => {
    if (loopManagerRef.current) {
      loopManagerRef.current.clear();
    }
    setActiveLoopsList([]);
  };

  useEffect(() => {
    return () => {
      if (loopManagerRef.current) {
        loopManagerRef.current.clear();
      }
    };
  }, []);

  const [router] = useState(() =>
    buildSlashCommandRouter({
      session: createSessionContext(provider, model),
      getMessages: getContextMessages,
      setMessages: setContextMessages,
      diffReviewer: new DiffReviewer(),
      taskManager: new TaskManager(),
      pendingAttachments: pendingAttachmentsRef.current,
      get permission() {
        return permissionRef.current;
      },
      setPermission: (level) => {
        permissionRef.current = level;
        setPermission(level);
      },
      startLoop,
      stopLoop,
      listLoops,
      clearLoops
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

  const runLoopXFlow = async (prompt: string, count: number): Promise<void> => {
    for (let i = 0; i < count; i++) {
      appendMessage({
        id: `sys-loop-x-${Date.now()}-${i}`,
        role: 'system',
        content: `[Loop-X] Starting iteration ${i + 1} of ${count}...`,
        timestamp: Date.now()
      });
      await executePromptOrCommand(prompt);
      await executePromptOrCommand('/compact');
    }
  };

  const executePromptOrCommand = async (text: string): Promise<void> => {
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

    // Slash commands: no attachment detection; execute against the router.
    if (isSlash) {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      transcriptManager.addRecord('user', text);
      appendMessage(userMsg);
      setIsStreaming(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        const res = await router.execute(trimmed);
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

        if (res.success && res.data && (res.data as any).isLoopX) {
          const { count, prompt } = res.data as any;
          setTimeout(() => {
            void runLoopXFlow(prompt, count);
          }, 0);
        }
      } catch (err: any) {
        const out = `Error: ${err?.message || 'command failed'}`;
        appendMessage({
          id: `msg-${Date.now() + 1}`,
          role: 'system',
          content: out,
          timestamp: Date.now(),
        });
      } finally {
        setIsStreaming(false);
        processNextQueuedTurn();
      }
      return;
    }

    // Regular prompt: detect image paths in the text (drag-and-drop inserts the
    // path as text), then merge any images queued via `/attach`.
    setIsStreaming(true);
    try {
      const { cleanText, attachments: detected } = await prepareAttachments(text);
      const queued = pendingAttachmentsRef.current.splice(0);
      const attachments = [...queued, ...detected];
      const promptText = cleanText.trim().length > 0 ? cleanText : text;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: promptText,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      transcriptManager.addRecord('user', promptText);
      appendMessage(userMsg);

      if (attachments.length > 0) {
        const note = attachments
          .map((a) => `📎 ${a.path.split(/[\\/]/).pop()} (${a.mediaType}, ${formatBytes(a.size)})`)
          .join('\n');
        appendMessage({
          id: `msg-${Date.now() + 1}`,
          role: 'system',
          content: `Attached ${attachments.length} image(s):\n${note}`,
          timestamp: Date.now(),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 2}`,
        role: 'assistant',
        content:
          `Received prompt: "${promptText}"` +
          (attachments.length > 0 ? ` with ${attachments.length} image attachment(s)` : '') +
          `. Permission mode is [${permission}].`,
        timestamp: Date.now(),
      };
      transcriptManager.addRecord('assistant', assistantMsg.content);
      appendMessage(assistantMsg);
    } finally {
      setIsStreaming(false);
      processNextQueuedTurn();
    }
  };

  const handleSendMessage = (text: string): void => {
    executePromptOrCommand(text).catch(() => {});
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
