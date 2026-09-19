/**
 * Composer Bar Component (Pure TailwindCSS)
 * Prompt input composer with slash command autocomplete, @agent mention dispatching, file attachments, and send controls.
 */

import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Plus,
  UserCheck,
  Zap,
  ShieldAlert,
  Check,
  ChevronDown,
  X,
  Terminal,
  Mic,
  MicOff,
  Video,
  Users
} from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { PeekingTaskDeck } from './components/PeekingTaskDeck';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useAgentMentions } from '../hooks/useAgentMentions';
import { TaskRecorderModal } from './TaskRecorderModal';
import type { ComposerOptions, ComposerAttachment } from '../core/types';
import { getIpc } from '../lib/ipc';
import { useLastUsedModel, providerStore } from '../stores/providerStore';
import { readClipboardText } from '../util/clipboard';

interface ComposerBarProps {
  onSend: (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  initialPrompt?: string;
  chatId?: string;
}

// Web Speech API types are not in the standard lib; treat as any.
const SpeechRecognitionCtor: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export const ComposerBar: React.FC<ComposerBarProps> = ({
  onSend,
  disabled,
  placeholder = 'Write a message...',
  initialPrompt,
  chatId,
}) => {
  const [prompt, setPrompt] = useState('');
  const lastUsedModel = useLastUsedModel();
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always' | 'never'>('ask');
  const [isPermissionOpen, setIsPermissionOpen] = useState(false);
  const permissionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sandbox, setSandbox] = useState(true);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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
    if (initialPrompt !== undefined && initialPrompt !== prompt) {
      setPrompt(initialPrompt);
      if (initialPrompt && textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [initialPrompt]);

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

  const adjustTextareaHeight = () => {
    const tx = textareaRef.current;
    if (tx) {
      tx.style.height = 'auto';
      tx.style.height = `${Math.min(tx.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt]);

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      if (permissionRef.current && !permissionRef.current.contains(evt.target as Node)) {
        setIsPermissionOpen(false);
      }
    };
    if (isPermissionOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPermissionOpen]);

  const getApprovalLabel = () => {
    switch (approvalMode) {
      case 'ask':
        return 'Ask for approval';
      case 'always':
        return 'Always approve';
      case 'never':
        return 'Never approve';
    }
  };

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

  const processFiles = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    if (filesArray.length === 0) return;

    const newAtts: ComposerAttachment[] = [];
    for (const f of filesArray) {
      const filePath = (f as unknown as { path?: string }).path;
      if (filePath) {
        newAtts.push({
          filename: f.name,
          fullPath: filePath,
        });
      } else {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(f);
        });

        newAtts.push({
          filename: f.name || `attachment-${Date.now()}.png`,
          fullPath: dataUrl || f.name,
        });
      }
    }

    if (newAtts.length > 0) {
      setAttachments((prev) => [...prev, ...newAtts]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      void processFiles(files);
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRightClickPaste = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, select, option, input:not([type="text"]):not([type="password"])')) {
      return;
    }

    const clipText = await readClipboardText();
    if (!clipText) {
      return;
    }

    e.preventDefault();
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
  };

  return (
    <div
      className="relative w-full max-w-4xl mx-auto"
      onContextMenu={handleRightClickPaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          {attachments.map((att, i) => {
            const isImage =
              att.filename.match(/\.(png|jpe?g|webp|gif|svg)$/i) ||
              (att.fullPath && att.fullPath.startsWith('data:image/'));

            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 text-xs text-slate-300 border border-slate-800 group"
              >
                {isImage && att.fullPath ? (
                  <img
                    src={att.fullPath}
                    alt={att.filename}
                    className="w-4 h-4 object-cover rounded"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Paperclip size={12} className="text-cyan-400 shrink-0" />
                )}
                <span className="truncate max-w-[120px]">{att.filename}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="hover:text-red-400 text-slate-500 hover:bg-slate-800 rounded p-0.5 transition-colors cursor-pointer"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Processing Deck & Queue Peeking Card */}
      <PeekingTaskDeck chatId={chatId} />

      {/* Main Composer Box */}
      <div className="flex flex-col gap-1.5 w-full">
        {/* Capsule Text Bar */}
        <div
          className={`relative w-full min-w-0 flex items-end gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-2xl sm:rounded-[22px] border transition-all duration-200 shadow-lg ${
            isDraggingOver
              ? 'bg-cyan-950/40 border-cyan-500/80 ring-2 ring-cyan-500/30'
              : 'bg-brand-card/90 border-brand-border hover:border-brand-borderStrong focus-within:border-brand-borderStrong focus-within:ring-1 focus-within:ring-brand-borderStrong/30 backdrop-blur-xl'
          }`}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-brand-card/95 rounded-[22px] text-cyan-400 text-xs font-semibold animate-pulse select-none">
              Drop images or files here to attach
            </div>
          )}

          {/* Most Left: Plus Button for file attach */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileAttach}
            className="hidden"
          />
          <button
            type="button"
            data-testid="composer-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files or media"
            aria-label="Attach files or media"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer mb-0.5"
          >
            <Plus size={18} strokeWidth={2} />
          </button>

          {/* Auto-growing Textarea */}
          <textarea
            ref={textareaRef}
            data-testid="composer-input"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setCursorPos(e.target.selectionStart);
              adjustTextareaHeight();
            }}
            onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
            onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className="flex-1 min-w-0 bg-transparent resize-none text-brand-textMain text-sm sm:text-base py-1 px-1 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:shadow-none min-h-[36px] max-h-[220px] leading-relaxed placeholder:text-brand-textMuted/60 scrollbar-thin scrollbar-thumb-neutral-700 font-sans break-words [overflow-wrap:anywhere]"
          />

          {/* Most Right: Voice Dictation (Mic) & Send (Rounded Arrow Button) */}
          <div className="flex items-center gap-1 shrink-0 mb-0.5">
            {workspaceVoiceEnabled && (
              <button
                type="button"
                data-testid="composer-mic-btn"
                onClick={toggleListening}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  listening
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                    : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
                }`}
                title={listening ? 'Stop voice input' : 'Voice input'}
                aria-label={listening ? 'Stop voice input' : 'Voice input'}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            <button
              type="button"
              data-testid="btn-send"
              onClick={handleSend}
              disabled={disabled || (!prompt.trim() && attachments.length === 0)}
              aria-label="Send message"
              title="Send (Enter)"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
                !prompt.trim() && attachments.length === 0
                  ? 'bg-brand-hover text-brand-textMuted/40 cursor-not-allowed border border-brand-border'
                  : 'bg-brand-highlight text-brand-highlightText hover:bg-brand-highlight/90 shadow-md cursor-pointer'
              }`}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Under the text box: Model Select and Permission Mode Level */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-3 px-1.5 sm:px-2 pt-0.5 text-xs select-none">
          {/* Model Select */}
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

            {/* Permission Mode Level Button */}
            <div className="relative inline-block" ref={permissionRef}>
              <button
                type="button"
                data-testid="approval-dropdown-btn"
                onClick={() => setIsPermissionOpen(!isPermissionOpen)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors select-none cursor-pointer ${
                  isPermissionOpen
                    ? 'bg-brand-hover text-brand-textMain'
                    : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
                }`}
                title={`Permission Mode: ${getApprovalLabel()}`}
                aria-label={`Permission Mode: ${getApprovalLabel()}`}
              >
                <span>{getApprovalLabel()}</span>
              </button>

              {isPermissionOpen && (
                <div
                  data-testid="approval-dropdown-menu"
                  className="absolute bottom-full right-0 mb-2 w-72 max-w-[calc(100vw-1.5rem)] bg-brand-popover/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-mono text-brand-textMuted/70 uppercase tracking-wider">
                    Permission Level
                  </div>
                  
                  <button
                    type="button"
                    data-testid="approval-option-ask"
                    onClick={() => {
                      setApprovalMode('ask');
                      setIsPermissionOpen(false);
                    }}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                      approvalMode === 'ask' ? 'bg-brand-hoverStrong text-brand-textMain font-medium' : 'hover:bg-brand-hover text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <UserCheck size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-brand-textMain">Ask for approval</div>
                      <div className="text-[11px] text-brand-textMuted leading-tight mt-0.5">
                        Confirm commands and file edits before execution.
                      </div>
                    </div>
                    {approvalMode === 'ask' && <Check size={14} className="text-brand-accent shrink-0 mt-0.5 ml-1" />}
                  </button>

                  <button
                    type="button"
                    data-testid="approval-option-always"
                    onClick={() => {
                      setApprovalMode('always');
                      setIsPermissionOpen(false);
                    }}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                      approvalMode === 'always' ? 'bg-brand-hoverStrong text-brand-textMain font-medium' : 'hover:bg-brand-hover text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <Zap size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-brand-textMain">Always approve</div>
                      <div className="text-[11px] text-brand-textMuted leading-tight mt-0.5">
                        Execute actions autonomously without interruption.
                      </div>
                    </div>
                    {approvalMode === 'always' && <Check size={14} className="text-brand-accent shrink-0 mt-0.5 ml-1" />}
                  </button>

                  <button
                    type="button"
                    data-testid="approval-option-never"
                    onClick={() => {
                      setApprovalMode('never');
                      setIsPermissionOpen(false);
                    }}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                      approvalMode === 'never' ? 'bg-brand-hoverStrong text-brand-textMain font-medium' : 'hover:bg-brand-hover text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-brand-textMain">Never approve</div>
                      <div className="text-[11px] text-brand-textMuted leading-tight mt-0.5">
                        Read-only safety mode; block all execution requests.
                      </div>
                    </div>
                    {approvalMode === 'never' && <Check size={14} className="text-brand-accent shrink-0 mt-0.5 ml-1" />}
                  </button>
                </div>
              )}
            </div>
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
