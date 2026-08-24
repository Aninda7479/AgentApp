/**
 * Composer Bar Component (Pure TailwindCSS)
 * Prompt input composer with slash command autocomplete, @agent mention dispatching, file attachments, and send controls.
 */

import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Paperclip, ShieldCheck, X, Sparkles, Terminal, Mic, MicOff, Video, Bot, Users } from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useAgentMentions } from '../hooks/useAgentMentions';
import { TaskRecorderModal } from './TaskRecorderModal';
import type { ComposerOptions, ComposerAttachment } from '../core/types';
import { getIpc } from '../lib/ipc';
import { useLastUsedModel, providerStore } from '../stores/providerStore';

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
  const lastUsedModel = useLastUsedModel();
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always' | 'never'>('ask');
  const [sandbox, setSandbox] = useState(true);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Workspace Voice Typing setting
  const [workspaceVoiceEnabled, setWorkspaceVoiceEnabled] = useState<boolean>(true);
  const [orchestratorEnabled, setOrchestratorEnabled] = useState<boolean>(true);

  // Voice dictation
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');

  const { isOpen: isSlashOpen, suggestions: slashSuggestions } = useSlashCommands(prompt);
  const {
    isOpen: isMentionOpen,
    filteredPersonas,
    selectedIndex: mentionIndex,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
  } = useAgentMentions(prompt, cursorPos);

  useEffect(() => {
    const ipcRenderer = getIpc();
    if (!ipcRenderer) return;
    let active = true;

    const applySettings = (settings: any) => {
      if (!active) return;

      const voice = settings?.voice || {};
      const tTarget = voice.typingTarget;
      const tEnabled = voice.typingEnabled;
      let voiceEnabled = true;
      if (tTarget !== undefined) {
        voiceEnabled = tTarget === 'both' || tTarget === 'composer';
      } else if (tEnabled !== undefined) {
        voiceEnabled = Boolean(tEnabled);
      } else {
        voiceEnabled = true;
      }
      setWorkspaceVoiceEnabled(voiceEnabled);

      const gov = settings?.orchestrator || settings?.modelGov || {};
      const orchEnabled = gov.enabled !== undefined ? !!gov.enabled : true;
      setOrchestratorEnabled(orchEnabled);
    };

    ipcRenderer.invoke('settings-read').then(applySettings).catch(() => {});

    const onSettingsChanged = (_e: any, settings: any) => {
      applySettings(settings);
    };
    ipcRenderer.on('settings-changed', onSettingsChanged);

    return () => {
      active = false;
      ipcRenderer.removeListener('settings-changed', onSettingsChanged);
    };
  }, []);

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
        model: lastUsedModel,
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
    // Handle @agent mention navigation first
    if (isMentionOpen) {
      const handled = handleMentionKeyDown(e, prompt, setPrompt, (pos) => {
        setCursorPos(pos);
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      });
      if (handled) return;
    }

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

  const handleRightClickPaste = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, select, option, input:not([type="text"]):not([type="password"])')) {
      return;
    }

    e.preventDefault();
    navigator.clipboard
      .readText()
      .then((clipText) => {
        if (!clipText) return;

        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart ?? textarea.value.length;
          const end = textarea.selectionEnd ?? textarea.value.length;
          const text = textarea.value;
          const before = text.substring(0, start);
          const after = text.substring(end, text.length);
          const newText = before + clipText + after;

          setPrompt(newText);

          const newCursorPos = start + clipText.length;
          requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
          });
        } else {
          setPrompt(prompt + clipText);
        }
      })
      .catch((err) => {
        console.error('Failed to read clipboard text on right click:', err);
      });
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto" onContextMenu={handleRightClickPaste}>
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
                <span className="font-semibold text-slate-200">/{item.name}</span>
                <span className="text-slate-400 text-[11px]">{item.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* @agent Mention Autocomplete Popover */}
      {isMentionOpen && (
        <div className="absolute bottom-full mb-2 left-4 right-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-1.5 z-50 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="px-3 py-1 text-[10px] font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users size={12} />
            <span>Delegate to Digital Employee Persona</span>
          </div>
          {filteredPersonas.map((persona, idx) => (
            <div
              key={persona.id}
              onClick={() => {
                applyMention(persona, prompt, setPrompt, (pos) => {
                  setCursorPos(pos);
                  if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(pos, pos);
                  }
                });
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                idx === mentionIndex ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'hover:bg-slate-800/80 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{persona.avatarEmoji || '🤖'}</span>
                <div>
                  <div className="font-bold text-slate-100 flex items-center gap-1.5">
                    <span>{persona.name}</span>
                    <span className="text-[11px] font-mono text-cyan-400 font-normal">@{persona.id}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{persona.roleTitle}</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-950">
                {persona.capabilityTier.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Attachments Preview Pill Bar */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 bg-slate-900/90 border-t border-x border-slate-800 rounded-t-2xl">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 text-xs text-slate-300 border border-slate-800"
            >
              <Paperclip size={12} className="text-cyan-400" />
              <span className="truncate max-w-[120px]">{att.filename}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="hover:text-red-400 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div className="bg-slate-950/85 backdrop-blur-2xl border border-slate-800 rounded-3xl p-3 shadow-2xl flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setCursorPos(e.target.selectionStart);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
          onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question, instruct your AI workforce, or type @ to delegate to a specialist..."
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent resize-none text-slate-100 placeholder:text-slate-500 text-xs sm:text-sm px-2 py-1.5 focus:outline-none scrollbar-thin scrollbar-thumb-slate-800"
        />

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
          <div className="flex items-center gap-2">
            <ModelPicker
              selectedModel={lastUsedModel}
              onSelectModel={(model) => {
                providerStore.setLastUsedModel(model);
                const ipc = getIpc();
                if (ipc) {
                  ipc.invoke('settings-read').then((s: any) => {
                    const next = { ...(s || {}), lastUsedModel: { model } };
                    return ipc.invoke('settings-save', next);
                  }).catch(() => {});
                }
              }}
              orchestratorEnabled={orchestratorEnabled}
            />

            {/* Teach a Task Button */}
            <button
              type="button"
              onClick={() => setIsRecorderOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-semibold transition-colors cursor-pointer"
              title="Teach a Task (Demonstration Workflow Recorder)"
            >
              <Video size={13} />
              <span className="hidden sm:inline">Teach Task</span>
            </button>

            {/* File Attachment */}
            <label className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors">
              <Paperclip size={15} />
              <input type="file" multiple onChange={handleFileAttach} className="hidden" />
            </label>

            {/* Voice Dictation */}
            {workspaceVoiceEnabled && (
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  listening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                    : 'hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
                title="Voice Input"
              >
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || (!prompt.trim() && attachments.length === 0)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Send</span>
            <Send size={13} />
          </button>
        </div>
      </div>

      {/* Teach a Task Modal */}
      <TaskRecorderModal
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
      />
    </div>
  );
};

export default ComposerBar;
