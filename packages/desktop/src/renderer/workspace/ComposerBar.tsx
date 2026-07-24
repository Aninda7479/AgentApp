/**
 * Composer Bar Component (Pure TailwindCSS)
 * Prompt input composer with slash command autocomplete, file attachments, and send controls.
 */

import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Paperclip, ShieldCheck, X, Sparkles, Terminal, Mic, MicOff } from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { useSlashCommands } from '../hooks/useSlashCommands';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

interface ComposerBarProps {
  onSend: (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => void;
  disabled?: boolean;
}

// Web Speech API types are not in the standard lib; treat as any.
const SpeechRecognitionCtor: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export const ComposerBar: React.FC<ComposerBarProps> = ({ onSend, disabled }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always' | 'never'>('ask');
  const [sandbox, setSandbox] = useState(true);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice dictation
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');

  const { isOpen: isSlashOpen, suggestions: slashSuggestions } = useSlashCommands(prompt);

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) {
      alert('Voice input (Speech Recognition) is not supported in this browser/environment.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    basePromptRef.current = prompt;

    rec.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      const base = basePromptRef.current;
      setPrompt(base + (base && !base.endsWith(' ') ? ' ' : '') + text);
    };

    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

    onSend(
      trimmed,
      {
        model: selectedModel,
        approvalMode,
        sandbox,
      },
      attachments
    );

    setPrompt('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newAtts: ComposerAttachment[] = filesArray.map((f) => ({
        filename: f.name,
        fullPath: (f as unknown as { path?: string }).path || f.name,
      }));
      setAttachments((prev) => [...prev, ...newAtts]);
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto p-3">
      {/* Slash Suggestions Menu */}
      {isSlashOpen && (
        <div className="absolute bottom-full mb-2 left-4 right-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-1.5 z-50">
          <div className="px-3 py-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider">Slash Commands</div>
          {slashSuggestions.map((item) => (
            <div
              key={item.name}
              onClick={() => {
                setPrompt(`/${item.name} `);
                textareaRef.current?.focus();
              }}
              className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/80 cursor-pointer text-xs transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-cyan-400" />
                <span className="font-semibold text-cyan-300">/{item.name}</span>
              </div>
              <span className="text-slate-400 text-[11px] truncate max-w-xs">{item.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div className="bg-brand-card/90 border border-brand-border rounded-2xl p-3 shadow-2xl backdrop-blur-xl transition-all focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/20">
        {/* Attachment Chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-bg/85 border border-brand-border text-xs text-brand-textMain font-mono"
              >
                <Paperclip size={12} className="text-cyan-400" />
                <span className="truncate max-w-[120px]">{att.filename}</span>
                <button
                  onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                  className="hover:text-red-400 transition-colors ml-1"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area Input */}
        <div className="relative flex items-center">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? "Listening... Speak clearly." : "Ask SuperAgent anything, paste code, or type / for commands..."}
            rows={2}
            className="w-full bg-transparent text-brand-textMain placeholder-brand-textMuted/60 text-sm resize-none focus:outline-none pr-10 scrollbar-thin scrollbar-thumb-brand-border"
          />
          {/* Inline Speech dictation button */}
          {SpeechRecognitionCtor && (
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-2 top-2 p-2 rounded-xl transition-all hover:bg-brand-bg/85 cursor-pointer ${
                listening
                  ? 'text-red-500 bg-red-500/10 animate-pulse border border-red-500/25'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
              title={listening ? "Listening (click to stop)" : "Voice to Text"}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-brand-border select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <ModelPicker selectedModel={selectedModel} onSelectModel={setSelectedModel} />

            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-bg/80 text-brand-textMuted hover:text-brand-textMain text-xs cursor-pointer border border-brand-border transition-colors">
              <Paperclip size={14} />
              <span>Attach</span>
              <input type="file" multiple onChange={handleFileAttach} className="hidden" />
            </label>

            {/* Sandbox Toggle */}
            <button
              type="button"
              onClick={() => setSandbox(!sandbox)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                sandbox
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
              }`}
              title={sandbox ? 'Sandbox mode active: execution is restricted. Click to request full access.' : 'Full access active: commands run unrestricted. Click to sandbox.'}
            >
              <ShieldCheck size={14} />
              <span>{sandbox ? 'Sandboxed' : 'Full Access'}</span>
            </button>

            {/* Permissions Mode */}
            <select
              value={approvalMode}
              onChange={(e) => setApprovalMode(e.target.value as 'ask' | 'always' | 'never')}
              className="bg-brand-bg text-brand-textMain border border-brand-border text-xs rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="ask">Ask Approval</option>
              <option value="always">Auto Approve</option>
              <option value="never">Strict Readonly</option>
            </select>
          </div>

          <button
            onClick={handleSend}
            disabled={disabled || (!prompt.trim() && attachments.length === 0)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <span>Send</span>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
