import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { Select } from './ui';
import {
  Plus,
  Cpu,
  Mic,
  ArrowUp,
  Folder,
  ChevronDown,
  UserCheck,
  Check,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

/** Options returned by the Composer when a prompt is submitted. */
export interface ComposerOptions {
  model: string;
  mode: 'auto' | 'plan' | 'bypass';
  attachments: string[];
}

/** A file attachment queued in the composer. */
export interface AttachmentItem {
  filename: string;
  sourcePath?: string;
  buffer?: number[];
}

interface ProjectRef {
  name: string;
}

/** Props for the Composer prompt input component. */
export interface ComposerProps {
  onSend: (prompt: string, options: ComposerOptions) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  onStop?: () => void;
  availableModels?: string[];
  defaultModel?: string;
  /** Called whenever the user changes the selected model in the dropdown. */
  onModelChange?: (model: string) => void;
  activeProject?: string;
  onAttachClick?: () => void;
  promptValue?: string;
  onPromptChange?: (val: string) => void;
  onAttachPastedFiles?: (files: FileList) => void;
  attachments?: AttachmentItem[];
  onRemoveAttachment?: (index: number) => void;

  // ── Real, functional extras (no filler) ──
  /** Projects available for the context pill's switcher. */
  projects?: ProjectRef[];
  /** Switch the active project from the composer context pill. */
  onSelectProject?: (name: string) => void;
  /** Sandbox / full-access execution mode (bound to real settings). */
  sandbox?: boolean;
  onSandboxChange?: (value: boolean) => void;
  /** Invoked when the browser/Electron lacks the Web Speech API. */
  onMicUnavailable?: () => void;
}

// Web Speech API types are not in the standard lib; treat as any.
const SpeechRecognitionCtor: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

/** Main prompt composer with model selector, approval mode, voice dictation, and context controls. */
export const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  isGenerating = false,
  onStop,
  availableModels = ['5.5 Medium', 'o3-mini', 'gpt-4o', 'claude-3-5-sonnet'],
  defaultModel = '5.5 Medium',
  activeProject = '',
  onAttachClick,
  promptValue,
  onPromptChange,
  onAttachPastedFiles,
  attachments = [],
  onRemoveAttachment,
  onModelChange,
  projects = [],
  onSelectProject,
  sandbox = true,
  onSandboxChange,
  onMicUnavailable,
}) => {
  const [localPrompt, setLocalPrompt] = useState('');
  const prompt = promptValue !== undefined ? promptValue : localPrompt;
  const setPrompt = onPromptChange !== undefined ? onPromptChange : setLocalPrompt;

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [approvalMode, setApprovalMode] = useState<'always' | 'never' | 'ask'>('ask');
  const [showApprovalDropdown, setShowApprovalDropdown] = useState(false);


  // Voice dictation
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');

  // Project switcher popover
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const tx = textareaRef.current;
    if (tx) {
      tx.style.height = 'auto';
      tx.style.height = `${Math.min(tx.scrollHeight, 180)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      if (onAttachPastedFiles) {
        onAttachPastedFiles(files);
      }
    }
  };

  const hasModels = availableModels && availableModels.length > 0;

  useEffect(() => {
    if (hasModels) {
      if (!availableModels.includes(selectedModel)) {
        setSelectedModel(availableModels[0] || defaultModel);
      }
    }
  }, [availableModels, defaultModel, hasModels, selectedModel]);

  useEffect(() => {
    if (defaultModel && availableModels.includes(defaultModel)) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel]);

  const toggleDictation = () => {
    if (!SpeechRecognitionCtor) {
      onMicUnavailable?.();
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
      setPrompt(base + (base && !base.endsWith(' ') && text ? ' ' : '') + text);
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
    if (!prompt.trim() || disabled || isGenerating) return;
    onSend(prompt, {
      model: selectedModel,
      mode: approvalMode === 'always' ? 'auto' : approvalMode === 'never' ? 'bypass' : 'plan',
      attachments: [],
    });
    setPrompt('');
    basePromptRef.current = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getApprovalLabel = () => {
    if (approvalMode === 'always') return 'Always approve';
    if (approvalMode === 'never') return 'Never approve';
    return 'Ask for approval';
  };

  return (
    <div
      data-testid="composer-container"
      className="px-4 pt-2 pb-4 max-w-[940px] w-full mx-auto flex flex-col gap-2 box-border relative z-10"
    >
      {/* The main input composer card */}
      <div className="glass-panel rounded-xl p-3 flex flex-col shadow-sm relative transition-all duration-300 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/10">
        {/* Composer Attachments Queue Row */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-brand-border/40 select-none">
            {attachments.map((file, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-brand-card hover:bg-brand-card/85 border border-brand-border px-2.5 py-1 rounded-lg text-xs text-brand-textMain animate-fade-in group transition-colors">
                <span className="text-brand-textMuted text-[10px]">📎</span>
                <span className="truncate max-w-[140px] font-medium font-sans">{file.filename}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment && onRemoveAttachment(idx)}
                  className="text-brand-textMuted hover:text-brand-textMain font-bold ml-1 rounded hover:bg-white/5 w-4 h-4 flex items-center justify-center transition-colors cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          data-testid="composer-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={hasModels ? "Do anything" : "No models are connected yet. Please go to Settings to connect a provider."}
          disabled={disabled}
          rows={1}
          className="bg-transparent border-none outline-none text-brand-textMain text-sm resize-none w-full min-h-[44px] leading-relaxed placeholder-brand-textMuted/55 font-sans disabled:opacity-50"
        />

        {/* Toolbar row inside box */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-t border-brand-border/60 pt-4 mt-4">
          {/* Left toolbar elements */}
          <div className="flex items-center gap-2 relative">
            {/* Plus / attach button */}
            <button
              data-testid="composer-attach-btn"
              onClick={() => onAttachClick?.()}
              className="text-brand-textMuted hover:text-brand-textMain p-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Ask for Approval Dropdown Pill */}
            <div className="relative">
              <button
                data-testid="approval-dropdown-btn"
                onClick={() => setShowApprovalDropdown(!showApprovalDropdown)}
                className="bg-brand-popover border border-brand-border hover:border-violet-500/35 hover:bg-brand-card text-brand-textMain px-3 sm:px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none active:scale-[0.98] shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5 text-brand-textMuted" />
                <span className="hidden sm:inline">{getApprovalLabel()}</span>
                <ChevronDown className="w-3 h-3 text-brand-textMuted" />
              </button>

              {showApprovalDropdown && (
                <div
                  data-testid="approval-dropdown-menu"
                  className="absolute bottom-full left-0 mb-2 glass-panel rounded-lg shadow-lg z-50 w-[190px] overflow-hidden"
                >
                  <div
                    data-testid="approval-option-ask"
                    onClick={() => {
                      setApprovalMode('ask');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-purple-500/15 cursor-pointer transition-colors"
                  >
                    Ask for approval
                  </div>
                  <div
                    data-testid="approval-option-always"
                    onClick={() => {
                      setApprovalMode('always');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-purple-500/15 cursor-pointer transition-colors"
                  >
                    Always approve
                  </div>
                  <div
                    data-testid="approval-option-never"
                    onClick={() => {
                      setApprovalMode('never');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-purple-500/15 cursor-pointer transition-colors"
                  >
                    Never approve
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right toolbar elements */}
          <div className="flex items-center gap-2.5">
            {/* Model Badge */}
            <div className="relative">
              <Select
                options={availableModels.map((model) => ({ value: model, label: model }))}
                value={selectedModel}
                onChange={(model) => {
                  setSelectedModel(model);
                  onModelChange?.(model);
                }}
                placeholder={hasModels ? 'Select model...' : 'No models connected'}
                direction="up"
                className="w-[180px] sm:w-[220px]"
              />
            </div>

            {/* Mic / voice dictation */}
            <button
              data-testid="composer-mic-btn"
              onClick={toggleDictation}
              title={!SpeechRecognitionCtor ? 'Voice input not supported here' : listening ? 'Stop dictation' : 'Dictate with your voice'}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                listening
                  ? 'bg-red-500/15 border-red-500/40 text-red-400'
                  : 'bg-brand-popover/60 hover:bg-brand-popover border-brand-border text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} />
            </button>

            {/* Submit / Stop */}
            {isGenerating ? (
              <button
                data-testid="btn-stop"
                onClick={onStop}
                className="bg-red-600 hover:bg-red-500 hover:shadow-[0_0_12px_rgba(239,68,68,0.45)] text-white rounded-full w-8 h-8 flex items-center justify-center font-bold cursor-pointer transition-all duration-150 active:scale-[0.92]"
              >
                <span className="text-[10px] leading-none">⏹</span>
              </button>
            ) : (
              <button
                data-testid="btn-send"
                onClick={handleSend}
                disabled={disabled || !prompt.trim() || !hasModels}
                className={`rounded-full w-8 h-8 flex items-center justify-center transition-all duration-150 ${
                  !prompt.trim() || disabled || !hasModels
                    ? 'bg-brand-popover text-brand-textMuted/40 cursor-not-allowed border border-brand-border'
                    : 'bg-amber-400 hover:bg-amber-300 hover:shadow-[0_0_12px_rgba(251,191,36,0.45)] text-brand-bg cursor-pointer active:scale-[0.92] border border-amber-300'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dictation indicator */}
        {listening && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-semibold animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Listening…
          </div>
        )}
      </div>

      {/* Under-composer context row: project switcher + sandbox mode */}
      <div data-testid="composer-badges-row" className="flex gap-2 px-1 items-center flex-wrap">
        {/* Project context pill + switcher */}
        {activeProject && (
          <div className="relative">
            <button
              data-testid="badge-project"
              onClick={() => projects.length > 0 && setProjectMenuOpen((v) => !v)}
              className={`bg-brand-card border border-brand-border rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm transition-all duration-150 active:scale-[0.98] ${
                projects.length > 0 ? 'cursor-pointer hover:border-violet-500/35 hover:bg-brand-popover' : 'cursor-default'
              }`}
            >
              <Folder className="w-3 h-3 text-indigo-400" />
              <span className="max-w-[120px] truncate">{activeProject}</span>
              {projects.length > 0 && <ChevronDown className="w-2 h-2 text-brand-textMuted" />}
            </button>

            {projectMenuOpen && projects.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 ui-popover w-56 p-1.5 z-50 max-h-[50vh] overflow-y-auto">
                <div className="ui-menu-label">Switch project</div>
                {projects.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      onSelectProject?.(p.name);
                      setProjectMenuOpen(false);
                    }}
                    className={`ui-popover-item ${p.name === activeProject ? 'active' : ''}`}
                  >
                    <Folder className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="truncate">{p.name}</span>
                    {p.name === activeProject && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sandbox / full-access toggle */}
        <button
          data-testid="badge-sandbox"
          onClick={() => onSandboxChange?.(!sandbox)}
          title={sandbox ? 'Running sandboxed — toggle for full access' : 'Full system access enabled — click to sandbox'}
          className={`rounded-full px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm border transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            sandbox
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/15'
          }`}
        >
          {sandbox ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
          <span>{sandbox ? 'Sandboxed' : 'Full access'}</span>
        </button>
      </div>
    </div>
  );
};
