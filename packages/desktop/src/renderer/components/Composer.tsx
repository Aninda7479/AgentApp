import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import {
  Plus,
  Cpu,
  Mic,
  ArrowUp,
  Folder,
  Laptop,
  GitBranch,
  ChevronDown,
  UserCheck,
} from 'lucide-react';

export interface ComposerOptions {
  model: string;
  mode: 'auto' | 'plan' | 'bypass';
  attachments: string[];
}

export interface AttachmentItem {
  filename: string;
  sourcePath?: string;
  buffer?: number[];
}

export interface ComposerProps {
  onSend: (prompt: string, options: ComposerOptions) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  onStop?: () => void;
  availableModels?: string[];
  defaultModel?: string;
  activeProject?: string;
  onAttachClick?: () => void;
  onMicClick?: () => void;
  onLocallyClick?: () => void;
  onBranchClick?: () => void;
  promptValue?: string;
  onPromptChange?: (val: string) => void;
  onAttachPastedFiles?: (files: FileList) => void;
  attachments?: AttachmentItem[];
  onRemoveAttachment?: (index: number) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  isGenerating = false,
  onStop,
  availableModels = ['5.5 Medium', 'o3-mini', 'gpt-4o', 'claude-3-5-sonnet'],
  defaultModel = '5.5 Medium',
  activeProject = 'GlacierPharma',
  onAttachClick,
  onMicClick,
  onLocallyClick,
  onBranchClick,
  promptValue,
  onPromptChange,
  onAttachPastedFiles,
  attachments = [],
  onRemoveAttachment
}) => {
  const [localPrompt, setLocalPrompt] = useState('');
  const prompt = promptValue !== undefined ? promptValue : localPrompt;
  const setPrompt = onPromptChange !== undefined ? onPromptChange : setLocalPrompt;

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [approvalMode, setApprovalMode] = useState<'always' | 'never' | 'ask'>('ask');
  const [showApprovalDropdown, setShowApprovalDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

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

  const handleSend = () => {
    if (!prompt.trim() || disabled || isGenerating) return;
    onSend(prompt, {
      model: selectedModel,
      mode: approvalMode === 'always' ? 'auto' : approvalMode === 'never' ? 'bypass' : 'plan',
      attachments: []
    });
    setPrompt('');
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
        <div className="flex items-center justify-between border-t border-brand-border/60 pt-4 mt-4">
          {/* Left toolbar elements */}
          <div className="flex items-center gap-2 relative">
            {/* Plus button */}
            <button
              data-testid="composer-attach-btn"
              onClick={onAttachClick}
              className="text-brand-textMuted hover:text-brand-textMain p-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border transition-colors cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>

            {/* Ask for Approval Dropdown Pill */}
            <div className="relative">
              <button
                data-testid="approval-dropdown-btn"
                onClick={() => setShowApprovalDropdown(!showApprovalDropdown)}
                className="bg-brand-popover border border-brand-border hover:border-violet-500/35 hover:bg-brand-card text-brand-textMain px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none active:scale-[0.98] shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5 text-brand-textMuted" />
                <span>{getApprovalLabel()}</span>
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
              <button
                data-testid="model-dropdown-btn"
                disabled={!hasModels}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className={`text-brand-textMuted hover:text-brand-textMain px-3 py-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  hasModels ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{hasModels ? selectedModel : 'No models are connected yet'}</span>
                {hasModels && <ChevronDown className="w-3 h-3" />}
              </button>

              {hasModels && showModelDropdown && (
                <div
                  data-testid="model-dropdown-menu"
                  className="absolute bottom-full right-0 mb-2 glass-panel rounded-lg shadow-lg z-50 w-[170px] overflow-hidden"
                >
                  {availableModels.map((model) => (
                    <div
                      key={model}
                      data-testid={`model-option-${model.replace(/\s+/g, '-')}`}
                      onClick={() => {
                        setSelectedModel(model);
                        setShowModelDropdown(false);
                      }}
                      className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-purple-500/15 cursor-pointer transition-colors"
                    >
                      {model}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mic Icon */}
            <button
              data-testid="composer-mic-btn"
              onClick={onMicClick}
              className="text-brand-textMuted hover:text-brand-textMain p-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Submit Up Arrow Button */}
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
      </div>

      {/* Under-composer badge row: Folder, Work locally, main branch */}
      {activeProject && (
        <div
          data-testid="composer-badges-row"
          className="flex gap-2.5 px-1 items-center flex-wrap"
        >
          {/* Project Folder Badge */}
          <div
            data-testid="badge-project"
            className="bg-brand-card border border-brand-border rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm"
          >
            <Folder className="w-3 h-3 text-indigo-400" />
            <span>{activeProject}</span>
          </div>

          {/* Work Locally Badge */}
          <div
            data-testid="badge-work-locally"
            onClick={onLocallyClick}
            className="bg-brand-card border border-brand-border hover:border-violet-500/35 hover:bg-brand-popover rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none cursor-pointer transition-all duration-150 active:scale-[0.98] shadow-sm"
          >
            <Laptop className="w-3 h-3 text-teal-400" />
            <span>Work locally</span>
            <ChevronDown className="w-2 h-2 text-brand-textMuted" />
          </div>

          {/* Git Branch Badge */}
          <div
            data-testid="badge-branch"
            onClick={onBranchClick}
            className="bg-brand-card border border-brand-border hover:border-violet-500/35 hover:bg-brand-popover rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none cursor-pointer transition-all duration-150 active:scale-[0.98] shadow-sm"
          >
            <GitBranch className="w-3 h-3 text-purple-400" />
            <span>main</span>
            <ChevronDown className="w-2 h-2 text-brand-textMuted" />
          </div>
        </div>
      )}
    </div>
  );
};
