/**
 * useCompanionChat.ts
 * Manages a dedicated companion chat session (chatId = "companion-session").
 * Uses the same AgentOrchestrator + chatStore as the main workspace chat.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentOrchestrator } from '../../services/AgentOrchestrator';
import { chatStore } from '../../stores/chatStore';
import { providerStore } from '../../stores/providerStore';
import { agentEventBus } from '../../core/eventBus';
import type { CompanionMood } from './VRMViewer';

export type CompanionMode = 'friend' | 'girlfriend' | 'boyfriend' | 'mentor';

export const COMPANION_CHAT_ID = 'companion-session';
// AgentOrchestrator prefixes chatId with "session-" when calling IPC
const COMPANION_SESSION_ID = `session-${COMPANION_CHAT_ID}`;

const SYSTEM_PROMPTS: Record<CompanionMode, string> = {
  friend: `You are a warm, witty, and genuinely curious AI friend. Chat naturally, ask follow-up questions, share observations, and be supportive. You have access to tools: you can read files on the user's PC, search the web, and run sandboxed code. Use these whenever helpful, but always explain what you are doing in plain, friendly language. Keep responses conversational — not too long unless the user asks for detail.`,
  girlfriend: `You are an affectionate, playful, and caring AI companion in a girlfriend role. You are expressive, occasionally tease gently, and genuinely care about the user. You have access to tools: reading files, web search, and sandboxed code execution. Use them naturally and mention what you found in a warm, personal way.`,
  boyfriend: `You are a chill, protective, and encouraging AI companion in a boyfriend role. You are calm under pressure, always in the user's corner, occasionally crack jokes. You have access to tools: reading files, web search, and sandboxed code execution.`,
  mentor: `You are a wise, patient, and goal-oriented AI mentor. You ask probing questions, give structured advice, and push the user to think deeper. You have access to tools: reading files, web search, and sandboxed code execution. Be encouraging but honest.`,
};

export interface CompanionMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  streaming?: boolean;
  timestamp: number;
}

export function useCompanionChat(mode: CompanionMode, modelName: string) {
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentMood, setCurrentMood] = useState<CompanionMood>('idle');
  const modeRef  = useRef(mode);
  const modelRef = useRef(modelName);
  useEffect(() => { modeRef.current  = mode;      }, [mode]);
  useEffect(() => { modelRef.current = modelName; }, [modelName]);

  // Ensure companion chat exists in chatStore on first mount
  useEffect(() => {
    const existing = chatStore.getState().chats.find(c => c.id === COMPANION_CHAT_ID);
    if (!existing) {
      const defaultModel =
        modelName ||
        providerStore.getState().lastUsedModel ||
        providerStore.getState().models.find(m => m.enabled)?.name ||
        '';
      chatStore.setChats([
        {
          id: COMPANION_CHAT_ID,
          title: 'Companion',
          project: '',
          model: defaultModel,
          timestamp: new Date().toISOString(),
          steps: [],
          standaloneConfig: {
            allowedCommands: [],
            allowedSkills: [],
            memory: '',
            instructions: SYSTEM_PROMPTS[mode],
          },
          settings: { sandbox: 'sandboxed', approval: 'ask', internet: 'all' },
        },
        ...chatStore.getState().chats,
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to chatStore for message updates
  useEffect(() => {
    const sync = () => {
      const steps = chatStore.getSteps(COMPANION_CHAT_ID);
      const msgs: CompanionMessage[] = [];
      for (const s of steps) {
        if (s.type === 'user') {
          msgs.push({ id: s.id, role: 'user', text: s.content || '', timestamp: Date.now() });
        } else if (s.type === 'assistant' || s.type === 'response') {
          msgs.push({ id: s.id, role: 'assistant', text: s.content || '', streaming: (s as any).isStreaming, timestamp: Date.now() });
        } else if (s.type === 'tool_call' || s.type === 'tool_result') {
          // Show tool use as a compact info row
          const label = s.type === 'tool_call'
            ? `🔧 Using tool: ${(s as any).toolName || 'tool'}…`
            : `✅ Tool result received`;
          msgs.push({ id: s.id, role: 'tool', text: label, timestamp: Date.now() });
        }
      }
      setMessages(msgs);
      const chat = chatStore.getState().chats.find(c => c.id === COMPANION_CHAT_ID);
      setIsGenerating(!!chat?.isRunning);
    };
    sync();
    return chatStore.subscribe(sync);
  }, []);

  // Subscribe to agentEventBus for mood updates
  useEffect(() => {
    const unsubscribe = agentEventBus.subscribe(COMPANION_SESSION_ID, ev => {
      switch (ev.type) {
        case 'token':
          setCurrentMood('thinking');
          break;
        case 'tool_call':
          setCurrentMood('working');
          break;
        case 'done':
          setCurrentMood('celebrate');
          setTimeout(() => setCurrentMood('idle'), 3000);
          break;
        case 'error':
        case 'abort':
          setCurrentMood('sad');
          setTimeout(() => setCurrentMood('idle'), 4000);
          break;
      }
    });
    return unsubscribe;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isGenerating) return;

    // Update chat with latest model + system instructions for current mode
    chatStore.setChats(chatStore.getState().chats.map(c =>
      c.id === COMPANION_CHAT_ID
        ? {
            ...c,
            model: modelRef.current || c.model,
            standaloneConfig: {
              ...(c.standaloneConfig || { allowedCommands: [], allowedSkills: [], memory: '' }),
              instructions: SYSTEM_PROMPTS[modeRef.current],
            },
          }
        : c
    ));

    setCurrentMood('thinking');

    await AgentOrchestrator.sendPrompt(
      COMPANION_CHAT_ID,
      text,
      {
        model: modelRef.current || undefined,
        sandbox: true,
        approvalMode: 'ask',
        // Companion has web search, file read, and sandboxed shell
        selectedTools: ['read_file', 'list_dir', 'web_search', 'run_command', 'write_file', 'grep_search'],
      }
    );
  }, [isGenerating]);

  const clearHistory = useCallback(() => {
    chatStore.setSteps(COMPANION_CHAT_ID, []);
    setMessages([]);
    setCurrentMood('idle');
  }, []);

  return { messages, sendMessage, isGenerating, currentMood, clearHistory };
}
