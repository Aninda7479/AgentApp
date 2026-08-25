/**
 * CompanionPage.tsx
 * Full-screen AI companion page: 3D VRM model on the left,
 * live streaming chat on the right. Uses the same AgentOrchestrator
 * + chatStore as the main workspace. Supports file reading, web
 * search, and sandboxed code execution via existing tool pipeline.
 */
import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  Send, Mic, MicOff, Trash2, Settings2, ChevronDown,
  Globe, FolderOpen, Terminal, Shield, RefreshCw,
  Heart, Users, BookOpen, Briefcase,
} from 'lucide-react';
import { VRMViewer, type VRMViewerHandle, type CompanionMood } from './VRMViewer';
import { useCompanionChat, type CompanionMode } from './useCompanionChat';
import { providerStore } from '../../stores/providerStore';

// ── Asset URL ─────────────────────────────────────────────────────────────────
const VRM_URL = 'assets/models/avatar_companion.vrm';

// ── Mode config ───────────────────────────────────────────────────────────────
const MODES: { id: CompanionMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'friend',    label: 'Friend',    icon: <Users size={14} />,    desc: 'Casual & curious' },
  { id: 'girlfriend',label: 'Girlfriend',icon: <Heart size={14} />,    desc: 'Warm & playful' },
  { id: 'boyfriend', label: 'Boyfriend', icon: <Shield size={14} />,   desc: 'Chill & supportive' },
  { id: 'mentor',    label: 'Mentor',    icon: <BookOpen size={14} />, desc: 'Wise & goal-focused' },
];

// ── Camera angle options ──────────────────────────────────────────────────────
type CameraAngle = 'portrait' | 'half' | 'full';
const ANGLES: { id: CameraAngle; label: string }[] = [
  { id: 'portrait', label: 'Face' },
  { id: 'half',     label: 'Half' },
  { id: 'full',     label: 'Full' },
];

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full bg-slate-400"
          style={{ animation: `typing-dot 1.2s ${i * 0.2}s infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ role, text, streaming }: { role: 'user' | 'assistant'; text: string; streaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1.5`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-slate-800/80 border border-slate-700/60 text-slate-100 rounded-bl-sm'
          }`}
      >
        {text}
        {streaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-current opacity-60 animate-pulse align-middle" />
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
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('half');
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('companion-model') || providerStore.getState().lastUsedModel || '';
  });
  const [inputText, setInputText]     = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const vrmRef       = useRef<VRMViewerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const sttRef       = useRef<SpeechRecognition | null>(null);

  // ── Chat hook ──────────────────────────────────────────────────────────────
  const { messages, sendMessage, isGenerating, currentMood, clearHistory } =
    useCompanionChat(mode, selectedModel);

  // ── Available models (from providerStore) ──────────────────────────────────
  const models = providerStore.getState().models.filter(m => m.enabled);

  // ── Sync VRM mood ──────────────────────────────────────────────────────────
  useEffect(() => {
    vrmRef.current?.setMood(currentMood);
  }, [currentMood]);

  // ── TTS + lip-sync on new assistant messages ───────────────────────────────
  const lastSpokenId = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.streaming) return;
    if (last.id === lastSpokenId.current) return;
    lastSpokenId.current = last.id;

    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(last.text);
    utt.rate  = 1.05;
    utt.pitch = 1.1;
    utt.onstart    = () => vrmRef.current?.startLipSync();
    utt.onend      = () => vrmRef.current?.stopLipSync();
    utt.onerror    = () => vrmRef.current?.stopLipSync();
    window.speechSynthesis.speak(utt);
  }, [messages]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Persist mode & model prefs ─────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('companion-mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('companion-model', selectedModel); }, [selectedModel]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
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
    rec.continuous      = false;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden select-none">

      {/* ── LEFT: 3D VRM Panel ───────────────────────────────────────────── */}
      <div
        className="relative flex flex-col items-center justify-end"
        style={{ width: '42%', minWidth: 280, background: 'radial-gradient(ellipse at 50% 30%, #1e1b3a 0%, #0a0a14 100%)' }}
      >
        {/* Camera angle toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-slate-900/70 border border-slate-700/50 rounded-xl p-1 backdrop-blur-sm">
          {ANGLES.map(a => (
            <button
              key={a.id}
              onClick={() => setCameraAngle(a.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer
                ${cameraAngle === a.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* VRM Canvas — fills available height */}
        <VRMViewer
          ref={vrmRef}
          vrmUrl={VRM_URL}
          mood={currentMood as CompanionMood}
          angle={cameraAngle}
          className="w-full flex-1"
        />

        {/* Subtle ground gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: 80, background: 'linear-gradient(to top, #0a0a14 0%, transparent 100%)' }}
        />

        {/* Mood indicator pill */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/50 rounded-full px-3 py-1 backdrop-blur-sm">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: {
                idle: '#94a3b8', thinking: '#60a5fa', working: '#34d399',
                celebrate: '#facc15', happy: '#facc15', sad: '#f87171',
                angry: '#f87171', surprised: '#c084fc',
              }[currentMood] || '#94a3b8',
              boxShadow: '0 0 6px currentColor',
            }}
          />
          <span className="text-[11px] text-slate-300 font-medium capitalize">{currentMood}</span>
        </div>
      </div>

      {/* ── RIGHT: Chat Panel ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-l border-slate-800/60">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-bold text-slate-100">AI Companion</h1>
              <p className="text-[11px] text-slate-400">
                {MODES.find(m => m.id === mode)?.desc ?? ''} · {selectedModel || 'No model'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Capability badges */}
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
              <Globe size={10} /> Web
            </span>
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold">
              <FolderOpen size={10} /> Files
            </span>
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
              <Terminal size={10} /> Sandbox
            </span>

            <button
              onClick={() => setShowSettings(s => !s)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings2 size={16} />
            </button>
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Settings panel (collapsible) */}
        {showSettings && (
          <div className="flex-shrink-0 border-b border-slate-800/60 bg-slate-900/40 px-4 py-3 flex flex-wrap gap-4 items-start">
            {/* Mode selector */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Relationship</p>
              <div className="flex gap-1">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    title={m.desc}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer
                      ${mode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector */}
            {models.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">AI Model</p>
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="text-4xl">🌸</div>
              <p className="text-slate-400 text-sm max-w-xs">
                Say hello! Your companion can read files on your PC, search the web, and run sandboxed code — all while keeping you company.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {["What's on my Desktop?", "Search for today's news", "Tell me something interesting", "Help me with my code"].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
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
              <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-bl-sm">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 border-t border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-3">
          <div className="flex items-end gap-2 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-3 py-2 focus-within:border-indigo-500/60 transition-colors">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your companion… (Shift+Enter for newline)"
              rows={1}
              disabled={isGenerating}
              className="flex-1 bg-transparent text-slate-100 text-sm placeholder-slate-500 resize-none focus:outline-none min-h-[24px] max-h-[120px] py-0.5"
              style={{ lineHeight: '1.5' }}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleMic}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer
                  ${isListening ? 'text-red-400 bg-red-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isGenerating}
                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                title="Send"
              >
                {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center">
            Can read your files · Search the web · Run sandboxed code · Approval required for system commands
          </p>
        </div>
      </div>

      {/* Typing-dot keyframe injected once */}
      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CompanionPage;
