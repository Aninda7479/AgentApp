/**
 * CompanionPage.tsx
 * Full-screen AI companion page with ultra-lifelike 3D VRM movements,
 * compact side chatpanel, interactive action triggers (Dance, Stretch, Wave, Heart, Neko, Peace, Bow),
 * real-time voice lip-sync, and full tool capabilities (read files, web search, sandboxed execution).
 */
import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  Send, Mic, MicOff, Trash2, Settings2, ChevronDown,
  Globe, FolderOpen, Terminal, Shield, RefreshCw,
  Heart, Users, BookOpen, Sparkles, Activity,
  Play, StopCircle, Smile,
} from 'lucide-react';
import { VRMViewer, type VRMViewerHandle, type CompanionMood, type CompanionAction } from './VRMViewer';
import { useCompanionChat, type CompanionMode } from './useCompanionChat';
import { providerStore } from '../../stores/providerStore';

const VRM_URL = 'assets/models/avatar_companion.vrm';

// ── Relationship Modes ────────────────────────────────────────────────────────
const MODES: { id: CompanionMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'friend',     label: 'Friend',     icon: <Users size={14} />,    desc: 'Casual, friendly & curious' },
  { id: 'girlfriend', label: 'Girlfriend', icon: <Heart size={14} />,    desc: 'Warm, affectionate & playful' },
  { id: 'boyfriend',  label: 'Boyfriend',  icon: <Shield size={14} />,   desc: 'Chill, protective & supportive' },
  { id: 'mentor',     label: 'Mentor',     icon: <BookOpen size={14} />, desc: 'Wise & goal-oriented' },
];

// ── Camera Angle Presets ──────────────────────────────────────────────────────
type CameraAngle = 'portrait' | 'half' | 'full';
const ANGLES: { id: CameraAngle; label: string }[] = [
  { id: 'portrait', label: 'Face' },
  { id: 'half',     label: 'Half' },
  { id: 'full',     label: 'Full' },
];

// ── Interactive Movement Routines ─────────────────────────────────────────────
const ACTIONS: { id: CompanionAction; label: string; emoji: string; desc: string }[] = [
  { id: 'wave',    label: 'Wave',    emoji: '👋', desc: 'Friendly wave hello' },
  { id: 'salute',  label: 'Salute',  emoji: '🫡', desc: 'Respectful salute' },
  { id: 'dance',   label: 'Dance',   emoji: '💃', desc: 'Groove & rhythm dance' },
  { id: 'stretch', label: 'Stretch', emoji: '🤸', desc: 'Gymnastics & deep stretch' },
  { id: 'heart',   label: 'Heart',   emoji: '💖', desc: 'Cute heart gesture' },
  { id: 'peace',   label: 'Peace',   emoji: '✌️', desc: 'Playful peace sign' },
  { id: 'neko',    label: 'Neko',    emoji: '🐱', desc: 'Cat paws roll' },
  { id: 'bow',     label: 'Bow',     emoji: '🙇', desc: 'Polite greeting bow' },
  { id: 'cheer',   label: 'Cheer',   emoji: '🎉', desc: 'Double fist pump cheer' },
];

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full bg-indigo-400"
          style={{ animation: `typing-dot 1.2s ${i * 0.2}s infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ role, text, streaming }: { role: 'user' | 'assistant' | 'tool'; text: string; streaming?: boolean }) {
  if (role === 'tool') {
    return (
      <div className="flex w-full justify-start px-4 py-1">
        <div className="flex items-center gap-2 rounded-xl px-3 py-1.5 bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
          <Activity size={12} className="text-cyan-400 animate-spin" />
          <span>{text}</span>
        </div>
      </div>
    );
  }

  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1.5`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm
          ${isUser
            ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-br-sm'
            : 'bg-slate-900/90 border border-slate-800/90 text-slate-100 rounded-bl-sm backdrop-blur-md'
          }`}
      >
        {text}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 ml-1 bg-cyan-400 opacity-80 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export interface CompanionPageProps {
  onBack?: () => void;
}

export const CompanionPage: React.FC<CompanionPageProps> = ({ onBack }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<CompanionMode>(() => {
    return (localStorage.getItem('companion-mode') as CompanionMode) || 'friend';
  });
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('full');
  const [currentAction, setCurrentAction] = useState<CompanionAction>('idle');
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('companion-model') || providerStore.getState().lastUsedModel || '';
  });
  const [inputText, setInputText]     = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActionsBar, setShowActionsBar] = useState(true);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const vrmRef         = useRef<VRMViewerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const sttRef         = useRef<SpeechRecognition | null>(null);

  // ── Chat hook ──────────────────────────────────────────────────────────────
  const { messages, sendMessage, isGenerating, currentMood, clearHistory } =
    useCompanionChat(mode, selectedModel);

  const models = providerStore.getState().models.filter(m => m.enabled);

  // ── Sync VRM mood & action ─────────────────────────────────────────────────
  useEffect(() => {
    vrmRef.current?.setMood(currentMood);
    if (currentMood === 'celebrate') {
      vrmRef.current?.playAction('cheer');
    }
  }, [currentMood]);

  // ── Trigger action on prompt keywords ──────────────────────────────────────
  const triggerActionByPrompt = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('dance') || lower.includes('groove')) {
      handleTriggerAction('dance');
    } else if (lower.includes('stretch') || lower.includes('gymnastic') || lower.includes('exercise')) {
      handleTriggerAction('stretch');
    } else if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey') || lower.includes('wave')) {
      handleTriggerAction('wave');
    } else if (lower.includes('salute') || lower.includes('respect') || lower.includes('captain')) {
      handleTriggerAction('salute');
    } else if (lower.includes('love') || lower.includes('heart') || lower.includes('cute')) {
      handleTriggerAction('heart');
    } else if (lower.includes('peace') || lower.includes('victory')) {
      handleTriggerAction('peace');
    } else if (lower.includes('cat') || lower.includes('neko') || lower.includes('meow')) {
      handleTriggerAction('neko');
    } else if (lower.includes('bow') || lower.includes('thank')) {
      handleTriggerAction('bow');
    }
  };

  // ── TTS + lip-sync ─────────────────────────────────────────────────────────
  const lastSpokenId = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.streaming) return;
    if (last.id === lastSpokenId.current) return;
    lastSpokenId.current = last.id;

    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(last.text);
    utt.rate  = 1.02;
    utt.pitch = 1.08;
    utt.onstart = () => vrmRef.current?.startLipSync();
    utt.onend   = () => vrmRef.current?.stopLipSync();
    utt.onerror = () => vrmRef.current?.stopLipSync();
    window.speechSynthesis.speak(utt);
  }, [messages]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { localStorage.setItem('companion-mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('companion-model', selectedModel); }, [selectedModel]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    triggerActionByPrompt(text);
    setInputText('');
    sendMessage(text);
  }, [inputText, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Voice input (STT) ─────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) {
      sttRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SR() as SpeechRecognition;
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setInputText(t);
    };
    rec.onend   = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    sttRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isListening]);

  const handleTriggerAction = (actId: CompanionAction) => {
    setCurrentAction(actId);
    vrmRef.current?.playAction(actId);
  };

  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden select-none">

      {/* ── LEFT: 3D Stage (Prominent Full-Height Canvas) ─────────────────── */}
      <div
        className="relative flex-1 h-full overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, #151428 0%, #06060f 100%)',
        }}
      >
        {/* Top Controls: Camera Angle Selector */}
        <div className="absolute top-3 left-4 z-20 flex gap-1 bg-slate-900/80 border border-slate-700/60 rounded-2xl p-1 backdrop-blur-md shadow-lg">
          {ANGLES.map(a => (
            <button
              key={a.id}
              onClick={() => setCameraAngle(a.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer
                ${cameraAngle === a.id
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Action Bar Toggle */}
        <div className="absolute top-3 right-4 z-20">
          <button
            onClick={() => setShowActionsBar(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-2xl text-xs font-semibold border backdrop-blur-md transition-all cursor-pointer
              ${showActionsBar
                ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:text-white'}`}
          >
            <Sparkles size={13} className="text-amber-400" />
            <span>Animations</span>
          </button>
        </div>

        {/* Quick Action Bar Overlay */}
        {showActionsBar && (
          <div className="absolute top-13 left-4 right-4 z-20 flex flex-wrap gap-1.5 justify-center bg-slate-900/85 border border-slate-800/90 rounded-2xl p-2 backdrop-blur-md shadow-xl animate-fade-in">
            {ACTIONS.map(act => (
              <button
                key={act.id}
                onClick={() => handleTriggerAction(act.id)}
                title={act.desc}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer
                  ${currentAction === act.id
                    ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
              >
                <span>{act.emoji}</span>
                <span>{act.label}</span>
              </button>
            ))}
            {currentAction !== 'idle' && (
              <button
                onClick={() => handleTriggerAction('idle')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-all cursor-pointer"
              >
                <StopCircle size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        )}

        {/* 3D VRM Canvas fills 100% of the stage */}
        <div className="absolute inset-0 w-full h-full">
          <VRMViewer
            ref={vrmRef}
            vrmUrl={VRM_URL}
            mood={currentMood as CompanionMood}
            action={currentAction}
            angle={cameraAngle}
            className="w-full h-full"
            onActionEnd={() => setCurrentAction('idle')}
          />
        </div>

        {/* Bottom Stage Ambient Glow */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: 60, background: 'linear-gradient(to top, #06060f 0%, transparent 100%)' }}
        />

        {/* Live Status Pill */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-full px-3.5 py-1 backdrop-blur-md shadow-lg">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
            style={{
              background: {
                idle: '#10b981', thinking: '#38bdf8', working: '#a855f7',
                celebrate: '#f59e0b', happy: '#f59e0b', sad: '#f43f5e',
                angry: '#f43f5e', surprised: '#ec4899',
              }[currentMood] || '#10b981',
              boxShadow: '0 0 8px currentColor',
            }}
          />
          <span className="text-[11px] text-slate-200 font-medium capitalize">
            {currentAction !== 'idle' ? `${currentAction}…` : currentMood}
          </span>
        </div>
      </div>

      {/* ── RIGHT: Compact Side Chatpanel (Width 360px - 400px) ───────────── */}
      <div className="w-[360px] lg:w-[390px] xl:w-[420px] flex-shrink-0 flex flex-col h-full border-l border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex-shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold text-slate-100">AI Companion</h1>
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[9px] font-semibold uppercase tracking-wider">
                {mode}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate max-w-[190px]">
              {selectedModel || 'Default Model'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(s => !s)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings2 size={15} />
            </button>
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Collapsible Settings */}
        {showSettings && (
          <div className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 p-3 flex flex-col gap-3 animate-fade-in text-xs">
            {/* Relationship Mode */}
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-1.5">Relationship</p>
              <div className="grid grid-cols-2 gap-1">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer
                      ${mode === m.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'}`}
                  >
                    {m.icon} <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selector */}
            {models.length > 0 && (
              <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-1.5">AI Model</p>
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full appearance-none bg-slate-800/90 border border-slate-700 text-slate-200 text-xs rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Tool badges */}
            <div className="flex items-center gap-1 pt-1 border-t border-slate-800/60">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px]">
                <Globe size={10} /> Web
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px]">
                <FolderOpen size={10} /> Files
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px]">
                <Terminal size={10} /> Sandbox
              </span>
            </div>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-1" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl shadow-md">
                🌸
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-100 mb-0.5">Your AI Companion</h3>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Ask questions, request dances or movements, read files, or search the web!
                </p>
              </div>
              <div className="flex flex-col gap-1.5 w-full mt-1">
                {[
                  "Hi! Wave at me! 👋",
                  "Show me a dance! 💃",
                  "Can you do a stretch? 🤸",
                  "What's on my Desktop? 📂",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      triggerActionByPrompt(s);
                      sendMessage(s);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} role={msg.role} text={msg.text} streaming={msg.streaming} />
          ))}

          {isGenerating && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start px-4">
              <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl rounded-bl-sm">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="flex-shrink-0 border-t border-slate-800/80 bg-slate-900/40 p-3">
          <div className="flex items-end gap-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl px-3 py-2 focus-within:border-indigo-500/70 shadow-md transition-all">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your companion..."
              rows={1}
              disabled={isGenerating}
              className="flex-1 bg-transparent text-slate-100 text-xs placeholder-slate-500 resize-none focus:outline-none min-h-[22px] max-h-[100px] py-0.5"
              style={{ lineHeight: '1.4' }}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleMic}
                className={`p-1.5 rounded-lg transition-all cursor-pointer
                  ${isListening ? 'text-red-400 bg-red-500/15 ring-1 ring-red-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isGenerating}
                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all cursor-pointer"
                title="Send"
              >
                {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CompanionPage;
