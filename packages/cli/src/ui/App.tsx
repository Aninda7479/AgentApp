import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import fs from 'fs';
import path from 'path';

function useTerminalDimensions(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  const getDims = () => {
    const r = stdout?.rows || process.stdout.rows || 24;
    const c = stdout?.columns || process.stdout.columns || 80;
    return {
      rows: r > 0 ? r : 24,
      columns: c > 0 ? c : 80
    };
  };
  const [dims, setDims] = useState(getDims);
  useEffect(() => {
    const onResize = () => setDims(getDims());
    const stream = stdout ?? process.stdout;
    stream.on('resize', onResize);
    return () => {
      stream.off('resize', onResize);
    };
  }, [stdout]);
  return dims;
}

const TIPS = [
  'Ask SuperAgent to create subagents for specific tasks (e.g. Software Architect, Coder).',
  'Use shift+tab to cycle through permission modes (auto, ask, deny).',
  'You can run /diff to review all code modifications made during the session.',
  'Connect provider API keys or switch active models using the /model command.',
  'Run commands directly or type a prompt for the autonomous agent to solve.',
  'Type /help to see all available slash commands and key shortcuts.'
];

export const Spinner: React.FC = () => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="red" bold>{frames[frame]}</Text>;
};

interface DiffChunk {
  lines: any[];
  startLine: number;
}

function groupDiffIntoChunks(diffLines: any[], contextSize = 3): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let currentChunk: any[] = [];
  let lastChangeIndex = -1;

  for (let i = 0; i < diffLines.length; i++) {
    const isChange = diffLines[i].type === 'add' || diffLines[i].type === 'delete';
    if (isChange) {
      lastChangeIndex = i;
    }
  }

  if (lastChangeIndex === -1) return [];

  let inChunk = false;
  let chunkStartIndex = 0;

  for (let i = 0; i < diffLines.length; i++) {
    let nearChange = false;
    for (let j = Math.max(0, i - contextSize); j <= Math.min(diffLines.length - 1, i + contextSize); j++) {
      if (diffLines[j].type === 'add' || diffLines[j].type === 'delete') {
        nearChange = true;
        break;
      }
    }

    if (nearChange) {
      if (!inChunk) {
        inChunk = true;
        chunkStartIndex = i;
        currentChunk = [];
      }
      currentChunk.push(diffLines[i]);
    } else {
      if (inChunk) {
        chunks.push({
          lines: currentChunk,
          startLine: chunkStartIndex + 1
        });
        currentChunk = [];
        inChunk = false;
      }
    }
  }

  if (inChunk && currentChunk.length > 0) {
    chunks.push({
      lines: currentChunk,
      startLine: chunkStartIndex + 1
    });
  }

  return chunks;
}

function estimateMessageHeight(m: UiMessage, columns: number): number {
  const cols = columns && columns > 0 ? columns : 80;
  let height = 0;
  if (m.role === 'user') {
    const text = `❯ ${m.content}`;
    height += Math.max(1, Math.ceil(text.length / cols));
    if (m.attachments && m.attachments.length > 0) {
      height += 1;
    }
    height += 1; // marginBottom={1}
  } else if (m.role === 'system') {
    height += Math.max(1, Math.ceil(m.content.length / cols));
    height += 1; // marginBottom={1}
  } else {
    // assistant
    let contentHeight = 0;
    if (m.tools && m.tools.length > 0) {
      contentHeight += 1; // summary line
      for (const t of m.tools) {
        if (t.name === 'write_file' && t.result && t.originalContent !== undefined) {
          const diffLines = DiffReviewer.generateDiffLines(t.originalContent, t.args.content as string || '');
          const chunks = groupDiffIntoChunks(diffLines, 3);
          if (chunks.length > 0) {
            contentHeight += 2; // Title + count
            for (const chunk of chunks) {
              contentHeight += chunk.lines.length;
            }
          }
        }
      }
    }
    if (m.content.length > 0) {
      const lines = m.content.split('\n');
      for (const line of lines) {
        if (line.startsWith('```')) continue;
        contentHeight += Math.max(1, Math.ceil(line.length / Math.max(1, cols - 4)));
      }
    } else if (m.isStreaming) {
      contentHeight += 1;
    }
    height += contentHeight;
    height += 1; // marginBottom={1}
  }
  return height;
}
import { Composer } from './Composer.js';
import { MessageView, type UiMessage, type ToolCallInfo } from './MessageView.js';
import { CommandPalette, type PaletteItem, type PaletteRow } from './CommandPalette.js';
import { ModelPicker, type ModelPickItem } from './ModelPicker.js';
import { DiffReviewer } from '../commands/diff.js';
import { TaskManager } from '../commands/tasks.js';
import { TurnQueueManager } from '../shortcuts/queue.js';
import { TranscriptManager } from '../shortcuts/transcript.js';
import { PermissionLevel, cyclePermissionLevel, getPermissionLabel } from '../shortcuts/permissions.js';
import { createSessionContext, type SessionContext } from '../types.js';
import { buildSlashCommandRouter, formatSlashCommandHelp } from '../commands/registry.js';
import { prepareAttachments, formatBytes } from '../attachments.js';
import {
  ChatSession,
  detectDefaultConnection,
  resolveConnection,
  type ResolvedConnection,
  type UsageInfo,
} from '../engine.js';
import { getRunnableSkills, type RunnableSkill } from '../skills.js';
import { SettingsStorage, type ImageAttachment } from '@superagent/core';
import { saveSession } from '../session_store.js';

/** Generates a resume token of the form `XXXX-XXXX-XXXX-XXXX`. */
function generateSessionId(): string {
  const g = () => Math.random().toString(16).slice(2, 6).padEnd(4, '0').slice(0, 4);
  return `${g()}-${g()}-${g()}-${g()}`;
}

/** Root props for the SuperAgent TUI application. */
export interface AppProps {
  provider?: string;
  model?: string;
  initialPermission?: PermissionLevel;
  initialVerbose?: boolean;
  /** Resume token; reuses a saved session's id instead of generating a new one. */
  sessionId?: string;
  /** Messages restored from a previous session (used with `sessionId`). */
  initialMessages?: UiMessage[];
}

/** Claude-Code-style startup banner: name/version, active model + effort, cwd. */
const Banner: React.FC<{ provider: string; model: string; cwd: string }> = ({ provider, model, cwd }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color="cyan">
      {'  ▟██████▙  '}
    </Text>
    <Text bold color="cyan">
      {'  ███████  '}
    </Text>
    <Text color="cyan">{'  █ SuperAgent Terminal '}</Text>
    <Text dimColor color="gray">{' v0.1.0'}</Text>
    <Box>
      <Text dimColor color="gray">
        {'  '}
        {provider}/{model} · effort xhigh
      </Text>
    </Box>
    <Box>
      <Text dimColor color="gray">
        {'  '}
        {cwd}
      </Text>
    </Box>
  </Box>
);

/**
 * Main SuperAgent Terminal TUI (Claude-Code style): a pinned, bottom-anchored
 * message log, a live streaming assistant pane, a
 * slash-command + skills palette on `/` (arrow-navigable), and an arrow-
 * navigable model picker on `/model`. Real multi-turn chat and tool use are
 * driven by `ChatSession` (which wraps the core `AgentEngine`).
 */
export const App: React.FC<AppProps> = ({
  provider = 'openai',
  model = 'default',
  initialPermission = 'auto',
  initialVerbose = false,
  sessionId,
  initialMessages,
}) => {
  const { exit } = useApp();

  // Stable resume token printed on exit so the user can reopen this session.
  // Reuses a provided id when resuming an existing session.
  const sessionIdRef = useRef<string>(sessionId && sessionId.length > 0 ? sessionId : generateSessionId());



  // Resolve the live default connection (honours an Anthropic-compatible proxy
  // configured via env, e.g. OpenRouter through ANTHROPIC_BASE_URL/_AUTH_TOKEN).
  const initialConn = useRef<ResolvedConnection>(
    detectDefaultConnection(provider, model === 'default' ? undefined : model)
  ).current;

  const [permission, setPermission] = useState<PermissionLevel>(initialPermission);
  const [verbose, setVerbose] = useState<boolean>(initialVerbose);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [lastActiveFile, setLastActiveFile] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [messages, setMessagesState] = useState<UiMessage[]>(() => {
    const conn = initialConn;
    const restored = initialMessages && initialMessages.length > 0 ? initialMessages : [];
    const msgs: UiMessage[] = [...restored];
    msgs.push({
      id: 'sys-welcome',
      role: 'system',
      content: `Welcome to SuperAgent Terminal — ${conn.provider || 'no model'}/${conn.model || 'selected'}. Type a prompt, or / for skills & commands.`,
    });
    if (restored.length > 0) {
      msgs.push({
        id: 'sys-resume',
        role: 'system',
        content: `↺ Resumed session — ${restored.length} previous message${restored.length === 1 ? '' : 's'} restored.`,
      });
    } else if (sessionId && sessionId.length > 0) {
      msgs.push({
        id: 'sys-resume-empty',
        role: 'system',
        content: `↺ No saved history found for session ${sessionId} — starting a new conversation under this id.`,
      });
    }
    const noModel = !conn.provider || !conn.model;
    const noKey = !!conn.provider && !!conn.model && !conn.apiKey;
    if (noModel || noKey) {
      const reason = noModel
        ? 'no model is selected'
        : `no API key is configured for ${conn.provider}`;
      msgs.push({
        id: 'sys-nokey',
        role: 'system',
        content:
          `⚠ ${reason}. The active model is chosen by you, not hardcoded. Run /model to pick a model (or connect a provider with \`/model provider <id> <apiKey>\`). Credentials are stored by the CLI/Core itself — no terminal env needed.`,
      });
    }
    return msgs;
  });
  const [streaming, setStreamingState] = useState<{ content: string; tools: ToolCallInfo[] } | null>(null);
  const [input, setInput] = useState('');
  const [paletteSelected, setPaletteSelected] = useState(0);
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const [picker, setPicker] = useState<{ open: boolean; selected: number }>({ open: false, selected: 0 });
  const [isBusy, setIsBusy] = useState(false);
  const [queuedTurnsCount, setQueuedTurnsCount] = useState(0);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    if (!isBusy) {
      setTipIndex(0);
      setElapsedSecs(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedSecs(Math.round((Date.now() - start) / 1000));
    }, 1000);
    const tipTimer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 6000);
    return () => {
      clearInterval(timer);
      clearInterval(tipTimer);
    };
  }, [isBusy]);

  // ── Refs (read inside the single useInput handler to avoid stale closures) ──
  const messagesRef = useRef<UiMessage[]>(messages);
  const streamingRef = useRef<{ content: string; tools: ToolCallInfo[] }>({ content: '', tools: [] });
  const inputRef = useRef('');
  const isBusyRef = useRef(false);
  const pickerRef = useRef<{ open: boolean; selected: number }>({ open: false, selected: 0 });
  const paletteSelectedRef = useRef(0);
  const paletteDismissedRef = useRef(false);
  const permissionRef = useRef<PermissionLevel>(permission);
  permissionRef.current = permission;
  const pendingAttachmentsRef = useRef<ImageAttachment[]>([]);
  const streamStartRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyPosRef = useRef(0);
  const draftRef = useRef('');

  const setMessages = useCallback((next: UiMessage[]) => {
    messagesRef.current = next;
    setMessagesState(next);
    saveSession(sessionIdRef.current, next);
  }, []);
  const appendMessage = useCallback((msg: UiMessage) => {
    setMessages([...messagesRef.current, msg]);
  }, [setMessages]);

  const setStreaming = useCallback((updater: { content: string; tools: ToolCallInfo[] } | ((s: { content: string; tools: ToolCallInfo[] }) => { content: string; tools: ToolCallInfo[] })) => {
    const next = typeof updater === 'function' ? updater(streamingRef.current) : updater;
    streamingRef.current = next;
    setStreamingState(next);
  }, []);

  // ── Session + slash-command router (single instance) ──
  const sessionRef = useRef<SessionContext>(createSessionContext(initialConn.provider, initialConn.model));
  // Make the detected default the "active" model so /model highlights it.
  sessionRef.current.activeProvider = initialConn.provider;
  sessionRef.current.activeModel = initialConn.model;

  const [router] = useState(() =>
    buildSlashCommandRouter({
      session: sessionRef.current,
      getMessages: () => messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
      setMessages: (ctx) =>
        setMessages(
          ctx.map((m, i) => ({
            id: `c-${i}-${m.role}`,
            role: m.role as UiMessage['role'],
            content: m.content,
          }))
        ),
      diffReviewer: new DiffReviewer(),
      taskManager: new TaskManager(),
      pendingAttachments: pendingAttachmentsRef.current,
      get permission() {
        return permissionRef.current;
      },
      setPermission: (level) => {
        permissionRef.current = level;
        setPermission(level);
        chatRef.current?.setPermission(level);
      },
      startLoop: undefined,
      stopLoop: undefined,
      listLoops: undefined,
      clearLoops: undefined,
    })
  );

  // ── Chat engine (one persistent session) ──
  const chatRef = useRef<ChatSession>(new ChatSession(initialConn, initialPermission));

  // ── Skills (runnable, discovered + built-in) ──
  const allSkills = useRef<RunnableSkill[]>(getRunnableSkills(process.cwd())).current;

  // ── Build the slash-command palette list (router + special controls) ──
  const [allCommands] = useState<PaletteItem[]>(() => {
    const fromRouter: PaletteItem[] = router.getCommands().map((def) => ({
      name: def.name,
      description: def.metadata.description || '',
      aliases: def.metadata.aliases,
      kind: 'command',
    }));
    const extras: PaletteItem[] = [
      { name: 'help', description: 'Show this command list', kind: 'command' },
      { name: 'clear', description: 'Clear the conversation', kind: 'command' },
      { name: 'exit', description: 'Quit the terminal', kind: 'command' },
    ];
    const names = new Set(fromRouter.map((c) => c.name));
    return [...fromRouter, ...extras.filter((e) => !names.has(e.name))];
  });

  /** Filters skills + commands by the current `/`-prefixed query. */
  const getFiltered = useCallback(
    (query: string): { skills: RunnableSkill[]; commands: PaletteItem[] } => {
      const q = query.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
      const matchSkill = (s: RunnableSkill) =>
        !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      const matchCmd = (c: PaletteItem) =>
        !q ||
        c.name.startsWith(q) ||
        c.name.includes(q) ||
        (c.aliases || []).some((a) => a.startsWith(q));
      return {
        skills: allSkills.filter(matchSkill),
        commands: allCommands.filter(matchCmd),
      };
    },
    [allSkills, allCommands]
  );

  /** Builds the render rows (with section headers) and the selectable index
   *  mapping for a given filtered set. */
  const buildPalette = useCallback(
    (query: string): { rows: PaletteRow[]; combined: PaletteItem[]; selectedRow: number } => {
      const { skills, commands } = getFiltered(query);
      const combined: PaletteItem[] = [
        ...skills.map((s) => ({ name: s.id, description: s.description, kind: 'skill' as const })),
        ...commands,
      ];
      const rows: PaletteRow[] = [];
      const rowOf = new Map<number, number>();
      let sel = 0;
      if (skills.length > 0) {
        rows.push({ kind: 'header', label: 'Skills' });
        for (const s of skills) {
          rowOf.set(sel, rows.length);
          rows.push({ kind: 'item', item: { name: s.id, description: s.description, kind: 'skill' } });
          sel++;
        }
      }
      if (commands.length > 0) {
        rows.push({ kind: 'header', label: 'Commands' });
        for (const c of commands) {
          rowOf.set(sel, rows.length);
          rows.push({ kind: 'item', item: c });
          sel++;
        }
      }
      const selectedRow = rowOf.get(Math.min(paletteSelectedRef.current, Math.max(0, combined.length - 1))) ?? 0;
      return { rows, combined, selectedRow };
    },
    [getFiltered]
  );

  // ── Model picker items ──
  const buildModelItems = useCallback((): ModelPickItem[] => {
    const caps = sessionRef.current.capabilityRegistry.getAllCapabilities();
    const items: ModelPickItem[] = caps.map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      contextWindow: c.contextWindow,
      capabilities: [
        c.supportsVision ? 'Vision' : null,
        c.supportsTools ? 'Tools' : null,
        c.supportsReasoning ? 'Reasoning' : null,
      ].filter(Boolean) as string[],
      isCurrent: c.id === chatRef.current.model && c.provider === chatRef.current.provider,
    }));
    if (!items.find((i) => i.id === chatRef.current.model)) {
      items.unshift({
        id: chatRef.current.model,
        name: chatRef.current.model,
        provider: chatRef.current.provider,
        isCurrent: true,
      });
    }
    return items;
  }, []);

  const queueManager = useRef(new TurnQueueManager()).current;
  const transcriptManager = useRef(new TranscriptManager()).current;

  // ── Helpers ──
  const applyModelToChat = useCallback(() => {
    const conn = resolveConnection(sessionRef.current.activeProvider, sessionRef.current.activeModel);
    chatRef.current.setConnection(conn);
  }, []);

  const openModelPicker = useCallback(() => {
    const items = buildModelItems();
    const idx = Math.max(0, items.findIndex((i) => i.isCurrent));
    setPicker({ open: true, selected: idx });
    pickerRef.current = { open: true, selected: idx };
    setInput('');
    inputRef.current = '';
  }, [buildModelItems]);

  const confirmModelPicker = useCallback(() => {
    const items = buildModelItems();
    const sel = items[pickerRef.current.selected] || items[0];
    if (!sel) return;
    const conn = resolveConnection(sel.provider, sel.id);
    chatRef.current.setConnection(conn);
    sessionRef.current.activeProvider = sel.provider;
    sessionRef.current.activeModel = sel.id;
    try {
      SettingsStorage.saveSettings({
        lastUsedModel: { model: sel.id, provider: sel.provider },
      });
    } catch {
      /* ignore */
    }
    appendMessage({
      id: `sys-model-${Date.now()}`,
      role: 'system',
      content: `Active model switched to '${sel.name}' (${sel.id}) [Provider: ${sel.provider}].`,
    });
    setPicker({ open: false, selected: 0 });
    pickerRef.current = { open: false, selected: 0 };
  }, [appendMessage, buildModelItems]);

  const runSlashCommand = useCallback(
    async (text: string) => {
      setIsBusy(true);
      isBusyRef.current = true;
      appendMessage({ id: `u-${Date.now()}`, role: 'user', content: text });
      transcriptManager.addRecord('user', text);
      try {
        const res = await router.execute(text);
        const out = res.success ? res.output ?? '' : `Error: ${res.error ?? 'command failed'}`;
        transcriptManager.addRecord('system', out);
        appendMessage({ id: `s-${Date.now()}`, role: 'system', content: out });
        if (text.replace(/^\//, '').split(/\s+/)[0].toLowerCase() === 'model') {
          applyModelToChat();
        }
      } catch (err: unknown) {
        appendMessage({
          id: `s-${Date.now()}`,
          role: 'system',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setIsBusy(false);
        isBusyRef.current = false;
      }
    },
    [appendMessage, applyModelToChat, router, transcriptManager]
  );

  const showHelp = useCallback(() => {
    appendMessage({ id: `help-${Date.now()}`, role: 'system', content: formatSlashCommandHelp(router) });
  }, [appendMessage, router]);

  const finalizeStreaming = useCallback(() => {
    const s = streamingRef.current;
    if (s.content.trim().length > 0 || s.tools.length > 0) {
      appendMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: s.content,
        tools: s.tools,
        elapsedMs: Date.now() - streamStartRef.current,
      });
    }
    streamingRef.current = { content: '', tools: [] };
    setStreamingState(null);
    setIsBusy(false);
    isBusyRef.current = false;
  }, [appendMessage, setStreamingState]);

  const sendChat = useCallback(
    async (text: string) => {
      setScrollOffset(0);
      const { cleanText, attachments: detected } = await prepareAttachments(text);
      const queued = pendingAttachmentsRef.current.splice(0);
      const attachments = [...queued, ...detected];
      const promptText = cleanText.trim().length > 0 ? cleanText : text;

      setIsBusy(true);
      isBusyRef.current = true;
      appendMessage({ id: `u-${Date.now()}`, role: 'user', content: promptText });
      if (attachments.length > 0) {
        appendMessage({
          id: `uatt-${Date.now()}`,
          role: 'system',
          content: `📎 ${attachments
            .map((a) => `${a.path.split(/[\\/]/).pop()} (${a.mediaType}, ${formatBytes(a.size)})`)
            .join(', ')}`,
        });
      }
      transcriptManager.addRecord('user', promptText);

      streamStartRef.current = Date.now();
      setStreamingState({ content: '', tools: [] });
      streamingRef.current = { content: '', tools: [] };

      await chatRef.current.send(promptText, attachments, {
        onToken: (t) => {
          setScrollOffset(0);
          setStreaming((s) => ({ ...s, content: s.content + t }));
        },
        onUsage: (u) => setUsage(u),
        onToolCall: (name, args) => {
          setScrollOffset(0);
          let originalContent: string | undefined;
          if (name === 'write_file' && typeof args.path === 'string') {
            const filePath = args.path;
            try {
              const fullPath = path.resolve(process.cwd(), filePath);
              if (fs.existsSync(fullPath)) {
                originalContent = fs.readFileSync(fullPath, 'utf8');
              } else {
                originalContent = '';
              }
            } catch {
              originalContent = '';
            }
            setLastActiveFile(path.basename(filePath));
          } else if (name === 'read_file' && typeof args.path === 'string') {
            setLastActiveFile(path.basename(args.path));
          }
          setStreaming((s) => ({ ...s, tools: [...s.tools, { name, args, originalContent }] }));
        },
        onToolResult: (name, result) =>
          setStreaming((s) => {
            const tools = [...s.tools];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === name && tools[i].result === undefined) {
                tools[i] = { ...tools[i], result };
                break;
              }
            }
            return { ...s, tools };
          }),
        onError: (msg) =>
          appendMessage({
            id: `err-${Date.now()}`,
            role: 'system',
            content: `⚠ ${msg}`,
          }),
        onDone: () => finalizeStreaming(),
      });
    },
    [appendMessage, finalizeStreaming, setStreaming, transcriptManager]
  );

  const resetPalette = useCallback(() => {
    setPaletteDismissed(false);
    paletteDismissedRef.current = false;
    setPaletteSelected(0);
    paletteSelectedRef.current = 0;
  }, []);

  const submit = useCallback(() => {
    const text = inputRef.current.trim();
    if (!text) return;
    // Record in history for up/down recall.
    historyRef.current.push(text);
    historyPosRef.current = historyRef.current.length;
    draftRef.current = '';

    setInput('');
    inputRef.current = '';
    resetPalette();

    if (text === '/exit') {
      exit();
      return;
    }
    if (text === '/clear') {
      setMessages([]);
      return;
    }
    if (text === '/help') {
      showHelp();
      return;
    }
    const cmd = text.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
    if (cmd === 'model') {
      const args = text.replace(/^\//, '').split(/\s+/).slice(1);
      if (args.length === 0 || (args.length === 1 && args[0] === 'list')) {
        openModelPicker();
        return;
      }
      void runSlashCommand(text);
      return;
    }
    if (text.startsWith('/')) {
      void runSlashCommand(text);
      return;
    }
    void sendChat(text);
  }, [openModelPicker, runSlashCommand, sendChat, setMessages, showHelp, exit, resetPalette]);

  const queueTurn = useCallback((text: string) => {
    queueManager.enqueue(text);
    setQueuedTurnsCount(queueManager.count());
    transcriptManager.addRecord('system', `Queued turn: ${text}`);
    appendMessage({ id: `q-${Date.now()}`, role: 'system', content: `Queued turn: ${text}` });
  }, [appendMessage, queueManager, transcriptManager]);

  // ── Single global key handler ──
  useInput((char, key) => {
    // Page scrolling (available anytime, even during generation)
    if (key.pageUp) {
      setScrollOffset((prev) => Math.min(messagesRef.current.length - 1, prev + 1));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    // Ctrl+C: abort an in-flight generation, else quit.
    if (key.ctrl && (input === 'c' || input === 'C')) {
      if (isBusyRef.current) {
        chatRef.current.abort();
        return;
      }
      exit();
      return;
    }

    // While generating: lock all input except the abort above.
    if (isBusyRef.current) return;

    // Model picker navigation.
    if (pickerRef.current.open) {
      if (key.upArrow) {
        setPicker((p) => {
          const next = { ...p, selected: Math.max(0, p.selected - 1) };
          pickerRef.current = next;
          return next;
        });
      } else if (key.downArrow) {
        setPicker((p) => {
          const next = { ...p, selected: p.selected + 1 };
          pickerRef.current = next;
          return next;
        });
      } else if (key.return) {
        confirmModelPicker();
      } else if (key.escape) {
        setPicker({ open: false, selected: 0 });
        pickerRef.current = { open: false, selected: 0 };
      }
      return;
    }

    const isPaletteOpen = inputRef.current.startsWith('/') && !paletteDismissedRef.current;

    if (isPaletteOpen) {
      const { combined } = buildPalette(inputRef.current);
      const maxIdx = Math.max(0, combined.length - 1);

      if (key.upArrow) {
        const next = Math.max(0, paletteSelectedRef.current - 1);
        setPaletteSelected(next);
        paletteSelectedRef.current = next;
        return;
      }
      if (key.downArrow) {
        const next = Math.min(maxIdx, paletteSelectedRef.current + 1);
        setPaletteSelected(next);
        paletteSelectedRef.current = next;
        return;
      }
      if (key.escape) {
        setInput('');
        inputRef.current = '';
        setPaletteDismissed(false);
        paletteDismissedRef.current = false;
        setPaletteSelected(0);
        paletteSelectedRef.current = 0;
        return;
      }
      if (key.return) {
        const sel = combined[paletteSelectedRef.current];
        if (!sel) return;
        setInput('');
        inputRef.current = '';
        resetPalette();
        if (sel.kind === 'skill') {
          const skill = allSkills.find((s) => s.id === sel.name);
          if (skill) void sendChat(skill.prompt);
        } else if (sel.name === 'model') {
          openModelPicker();
        } else {
          setInput(`/${sel.name} `);
          inputRef.current = `/${sel.name} `;
          setPaletteDismissed(true);
          paletteDismissedRef.current = true;
        }
        return;
      }
      if (key.backspace || key.delete) {
        const next = inputRef.current.slice(0, -1);
        setInput(next);
        inputRef.current = next;
        setPaletteSelected(0);
        paletteSelectedRef.current = 0;
        setPaletteDismissed(false);
        paletteDismissedRef.current = false;
        return;
      }
      if (key.tab) return; // ignore queue while picking
      if (char && !key.ctrl && !key.meta) {
        const next = inputRef.current + char;
        setInput(next);
        inputRef.current = next;
        setPaletteSelected(0);
        paletteSelectedRef.current = 0;
        setPaletteDismissed(false);
        paletteDismissedRef.current = false;
        return;
      }
      return;
    }

    // Normal editing mode.
    if (key.pageUp || (key.ctrl && key.upArrow)) {
      setScrollOffset((prev) => Math.min(messagesRef.current.length - 1, prev + 3));
      return;
    }
    if (key.pageDown || (key.ctrl && key.downArrow)) {
      setScrollOffset((prev) => Math.max(0, prev - 3));
      return;
    }
    if (key.ctrl && (input === 'o' || input === 'O')) {
      setVerbose((v) => !v);
      return;
    }
    if (key.tab && key.shift) {
      const next = cyclePermissionLevel(permissionRef.current);
      permissionRef.current = next;
      setPermission(next);
      chatRef.current.setPermission(next);
      return;
    }
    if (key.tab) {
      if (inputRef.current.trim().length > 0) queueTurn(inputRef.current.trim());
      return;
    }
    if (key.return) {
      submit();
      return;
    }
    if (key.backspace || key.delete) {
      historyPosRef.current = historyRef.current.length;
      const next = inputRef.current.slice(0, -1);
      setInput(next);
      inputRef.current = next;
      return;
    }
    // Up/Down arrow input history recall (Claude-Code behaviour).
    if (key.upArrow) {
      const hist = historyRef.current;
      if (hist.length === 0) return;
      if (historyPosRef.current === hist.length) draftRef.current = inputRef.current;
      const next = Math.max(0, historyPosRef.current - 1);
      historyPosRef.current = next;
      setInput(hist[next]);
      inputRef.current = hist[next];
      return;
    }
    if (key.downArrow) {
      const hist = historyRef.current;
      if (historyPosRef.current >= hist.length) return;
      const next = historyPosRef.current + 1;
      historyPosRef.current = next;
      const val = next === hist.length ? draftRef.current : hist[next];
      setInput(val);
      inputRef.current = val;
      return;
    }
    if (char && !key.ctrl && !key.meta) {
      // Any printable key returns us to the "draft" position.
      historyPosRef.current = historyRef.current.length;
      const next = inputRef.current + char;
      setInput(next);
      inputRef.current = next;
      return;
    }
  });

  // Keep palette selected within the filtered range when rendering.
  const { rows: paletteRows, combined: paletteCombined, selectedRow } = buildPalette(input);

  const modelItems = picker.open ? buildModelItems() : [];
  const clampedModelSelected = Math.min(picker.selected, Math.max(0, modelItems.length - 1));

  const showPalette =
    input.startsWith('/') && !paletteDismissed && paletteCombined.length > 0;

  const usageText = usage
    ? ` · ${usage.totalTokens.toLocaleString()} tok (${usage.promptTokens.toLocaleString()}↑/${usage.completionTokens.toLocaleString()}↓)`
    : '';

  const { rows: terminalRows, columns: terminalColumns } = useTerminalDimensions();

  // Estimate message heights and slice messages to fit the terminal screen responsive viewport
  let currentHeight = 0;
  let maxHeight = terminalRows - 6; // Leave space for composer (3) + status (2) + spacing (1)

  if (isBusy) {
    maxHeight -= 3; // Leave space for loader and tips
  }

  // If streaming is active and we are at the bottom (scrollOffset === 0), include streaming height
  if (streaming && scrollOffset === 0) {
    const streamingMsg: UiMessage = {
      id: 'streaming',
      role: 'assistant',
      content: streaming.content,
      isStreaming: true,
      tools: streaming.tools,
    };
    currentHeight += estimateMessageHeight(streamingMsg, terminalColumns);
  }

  // Go backwards from messages.length - 1 - scrollOffset
  const endIdx = messages.length - scrollOffset;
  const messagesToRender: UiMessage[] = [];

  for (let i = endIdx - 1; i >= 0; i--) {
    const msgHeight = estimateMessageHeight(messages[i], terminalColumns);
    let nextHeight = currentHeight + msgHeight;
    
    // If we are about to include the first message (welcome text), also add the banner height (6)
    if (i === 0) {
      nextHeight += 6;
    }

    if (nextHeight > maxHeight) {
      if (messagesToRender.length === 0) {
        messagesToRender.unshift(messages[i]);
        if (i === 0) {
          currentHeight = nextHeight;
        }
      }
      break;
    }
    messagesToRender.unshift(messages[i]);
    currentHeight = nextHeight;
  }

  // Mouse click and scroll handlers
  const handleMouseEvent = useCallback((button: number, x: number, y: number, isRelease: boolean) => {
    if (isBusyRef.current) return;

    if (button === 64) {
      // Scroll wheel up
      setScrollOffset((prev) => Math.min(messagesRef.current.length - 1, prev + 1));
      return;
    }
    if (button === 65) {
      // Scroll wheel down
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (button === 0 && !isRelease) {
      // Left click
      const isPaletteOpen = inputRef.current.startsWith('/') && !paletteDismissedRef.current;
      if (isPaletteOpen) {
        const paletteHeight = Math.min(paletteRows.length, 14) + 3;
        const paletteStartY = terminalRows - 5 - paletteHeight;
        const clickOffset = y - paletteStartY - 1; // -1 for border
        if (clickOffset >= 0 && clickOffset < Math.min(paletteRows.length, 14)) {
          const clickedRow = paletteRows[clickOffset];
          if (clickedRow && clickedRow.kind === 'item') {
            const itemIdx = paletteCombined.findIndex(c => c.name === clickedRow.item.name);
            if (itemIdx !== -1) {
              setPaletteSelected(itemIdx);
              paletteSelectedRef.current = itemIdx;
              
              const sel = paletteCombined[itemIdx];
              if (sel) {
                setInput('');
                inputRef.current = '';
                resetPalette();
                if (sel.kind === 'skill') {
                  const skill = allSkills.find((s) => s.id === sel.name);
                  if (skill) void sendChat(skill.prompt);
                } else if (sel.name === 'model') {
                  openModelPicker();
                } else {
                  setInput(`/${sel.name} `);
                  inputRef.current = `/${sel.name} `;
                  setPaletteDismissed(true);
                  paletteDismissedRef.current = true;
                }
              }
            }
          }
        }
      }

      if (pickerRef.current.open) {
        const pickerHeight = Math.min(modelItems.length, 12) + 3;
        const pickerStartY = terminalRows - 5 - pickerHeight;
        const clickOffset = y - pickerStartY - 1; // -1 for border
        if (clickOffset >= 0 && clickOffset < Math.min(modelItems.length, 12)) {
          setPicker((p) => {
            const next = { ...p, selected: clickOffset };
            pickerRef.current = next;
            return next;
          });
          confirmModelPicker();
        }
      }
    }
  }, [paletteRows, paletteCombined, modelItems, terminalRows]);


  return (
    <Box flexDirection="column" height={terminalRows}>
      {/* Conversation log: grows to fill the space and anchors the newest
          content to the bottom so the input line is always at the bottom. */}
      <Box flexGrow={1} flexDirection="column" justifyContent="flex-end">
        {/* Render banner scrollable at the top of messages list if the welcome message is visible in the viewport */}
        {messagesToRender.includes(messages[0]) && (
          <Banner
            key="banner"
            provider={chatRef.current.provider}
            model={chatRef.current.model}
            cwd={process.cwd()}
          />
        )}

        {messagesToRender.map((m: UiMessage) => (
          <MessageView key={m.id} message={m} />
        ))}

        {/* Live streaming assistant pane (dynamic, re-renders per token). */}
        {streaming && scrollOffset === 0 && (
          <MessageView
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streaming.content,
              isStreaming: true,
              tools: streaming.tools,
            }}
          />
        )}

        {/* Spinning forming loader with tips when agent is thinking */}
        {isBusy && (
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            <Box>
              <Spinner />
              <Text color="red" bold> Forming... </Text>
              <Text color="gray">({elapsedSecs}s · thinking with xhigh effort)</Text>
            </Box>
            <Box paddingLeft={2} marginTop={0}>
              <Text color="gray" dimColor>
                L {TIPS[tipIndex]}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Slash-command + skills palette (typing `/`). */}
      {showPalette && (
        <CommandPalette rows={paletteRows} selectedIndex={selectedRow} total={paletteCombined.length} />
      )}

      {/* Model picker (after `/model`). */}
      {picker.open && (
        <ModelPicker items={modelItems} selected={clampedModelSelected} total={modelItems.length} />
      )}

      {/* Input line — always pinned just above the status bar. */}
      <Composer value={input} isBusy={isBusy} />

      {/* Bottom status bar (Claude-Code style). */}
      <Box marginTop={1} paddingX={1}>
        <Text color={permission === 'auto' ? 'green' : permission === 'deny' ? 'red' : 'yellow'} bold>
          {'❯❯ '}
        </Text>
        <Text bold>
          {permission === 'auto' ? 'auto mode on' : permission === 'deny' ? 'auto mode off (deny)' : 'ask mode'}
        </Text>
        <Text dimColor color="gray">
          {` (shift+tab to cycle)`}
          {usageText}
          {queuedTurnsCount > 0 ? ` · queued: ${queuedTurnsCount}` : ''}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor color="gray">
          📄 In {lastActiveFile || path.basename(process.cwd())}
        </Text>
      </Box>

      {verbose && (
        <Box borderStyle="single" borderColor="yellow" marginTop={1} paddingX={1}>
          <Text bold color="yellow">
            --- Verbose ---
          </Text>
          <Text dimColor>{transcriptManager.formatVerboseTranscript() || 'No logs yet.'}</Text>
        </Box>
      )}
    </Box>
  );
};
