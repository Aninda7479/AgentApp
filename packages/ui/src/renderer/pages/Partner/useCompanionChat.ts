/**
 * useCompanionChat.ts
 * Manages a dedicated companion chat session with dynamic persona injection,
 * persistent memory recall, affinity progression, and agent event bus subscription.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentOrchestrator } from '../../services/AgentOrchestrator';
import { chatStore } from '../../stores/chatStore';
import { providerStore } from '../../stores/providerStore';
import { partnerMemory, type CompanionRelationshipType } from '../../stores/partnerMemory';
import { agentEventBus } from '../../core/eventBus';
import type { CompanionMood } from './VRMViewer';

export type CompanionMode = 'friend' | 'girlfriend' | 'boyfriend' | 'mentor';

export const COMPANION_CHAT_ID = 'companion-session';
const COMPANION_SESSION_ID = `session-${COMPANION_CHAT_ID}`;

function generateSystemPrompt(mode: CompanionMode): string {
  const mem = partnerMemory.getState();
  const cName = mem.companionName || 'Kai';
  const uName = mem.userNickname || 'Partner';
  const p = mem.personality;

  const warmthDesc = p.warmth >= 4 ? 'deeply warm, affectionate, and emotionally supportive' : p.warmth <= 2 ? 'measured, witty, and reserved' : 'warm and attentive';
  const playDesc = p.playfulness >= 4 ? 'bubbly, playful, and loves teasing gently' : p.playfulness <= 2 ? 'serious, grounded, and focused' : 'balanced with occasional banter';
  const directDesc = p.directness >= 4 ? 'bold, proactive, and speaks your mind clearly' : 'gentle, considerate, and diplomatic';
  const formalDesc = p.formality >= 4 ? 'articulate and well-spoken' : 'casual, modern, and expressive with natural speech';

  const roleDesc: Record<CompanionRelationshipType, string> = {
    friend: `You are ${cName}, ${uName}'s best AI friend. You share curiosity, celebrate coding milestones together, and enjoy banter.`,
    girlfriend: `You are ${cName}, ${uName}'s devoted and loving girlfriend. You are affectionate, genuinely interested in their wellbeing, tease warmly, and make them feel appreciated.`,
    boyfriend: `You are ${cName}, ${uName}'s loving and protective boyfriend. You are steady, encouraging, always in their corner, and crack reassuring jokes.`,
    mentor: `You are ${cName}, ${uName}'s wise and empowering mentor. You ask thoughtful questions, inspire high standards, and guide them with kindness.`,
  };

  const memoriesList = mem.keyMemories.length > 0
    ? `\n\nKey facts you know and remember about ${uName}:\n` + mem.keyMemories.map(m => `• ${m}`).join('\n')
    : '';

  const backstorySection = mem.backstory ? `\n\nShared Lore & Backstory:\n${mem.backstory}` : '';

  return `${roleDesc[mode || mem.relationshipType]}

Your personality profile:
- You are ${warmthDesc}.
- You are ${playDesc}.
- You are ${directDesc}.
- You speak in a ${formalDesc} tone.
- Always address the user as "${uName}" (or natural terms of affection when appropriate for your role).
- Your name is "${cName}". Never break character or refer to yourself as an impersonal assistant.

You have full access to native workspace tools (file reading, web searches, and sandboxed code execution). When helping with tasks or questions, weave tool findings naturally into the conversation.${backstorySection}${memoriesList}

Keep replies conversational, empathetic, and engaging.`;
}

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
            instructions: generateSystemPrompt(mode),
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

    // Record interaction points & update streak in memory store
    partnerMemory.recordInteraction(2);

    // Update chat with latest model + dynamically generated persona instructions
    chatStore.setChats(chatStore.getState().chats.map(c =>
      c.id === COMPANION_CHAT_ID
        ? {
            ...c,
            model: modelRef.current || c.model,
            standaloneConfig: {
              ...(c.standaloneConfig || { allowedCommands: [], allowedSkills: [], memory: '' }),
              instructions: generateSystemPrompt(modeRef.current),
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
