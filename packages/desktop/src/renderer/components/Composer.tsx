import React, { useState, KeyboardEvent } from 'react';
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
  onPromptChange
}) => {
  const [localPrompt, setLocalPrompt] = useState('');
  const prompt = promptValue !== undefined ? promptValue : localPrompt;
  const setPrompt = onPromptChange !== undefined ? onPromptChange : setLocalPrompt;

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [approvalMode, setApprovalMode] = useState<'always' | 'never' | 'ask'>('ask');
  const [showApprovalDropdown, setShowApprovalDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

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
      className="px-6 md:px-10 pt-4 pb-7 max-w-[980px] w-full mx-auto flex flex-col gap-3 box-border relative z-10"
    >
      {/* The main input composer card */}
      <div className="glass-panel rounded-xl p-5 flex flex-col shadow-md relative transition-all duration-300 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/10">
        <textarea
          data-testid="composer-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Do anything"
          disabled={disabled || isGenerating}
          rows={1}
          className="bg-transparent border-none outline-none text-brand-textMain text-base resize-none w-full min-h-[78px] leading-relaxed placeholder-brand-textMuted/55 font-sans"
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
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="text-brand-textMuted hover:text-brand-textMain px-3 py-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{selectedModel}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {showModelDropdown && (
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
                disabled={disabled || !prompt.trim()}
                className={`rounded-full w-8 h-8 flex items-center justify-center transition-all duration-150 ${
                  !prompt.trim() || disabled
                    ? 'bg-brand-popover text-brand-textMuted/40 cursor-not-allowed border border-brand-border'
                    : 'bg-violet-600 hover:bg-violet-500 hover:shadow-[0_0_12px_rgba(139,92,246,0.32)] text-white cursor-pointer active:scale-[0.92] border border-violet-500'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Under-composer badge row: Folder, Work locally, main branch */}
      <div
        data-testid="composer-badges-row"
        className="flex gap-2.5 px-1 items-center flex-wrap"
      >
        {/* Project Folder Badge */}
        <div
          data-testid="badge-project"
          className="bg-brand-card border border-brand-border rounded-full text-brand-textMain px-3.5 py-2 text-[11px] font-semibold flex items-center gap-1.5 select-none shadow-sm"
        >
          <Folder className="w-3.5 h-3.5 text-indigo-400" />
          <span>{activeProject}</span>
        </div>

        {/* Work Locally Badge */}
        <div
          data-testid="badge-work-locally"
          onClick={onLocallyClick}
          className="bg-brand-card border border-brand-border hover:border-violet-500/35 hover:bg-brand-popover rounded-full text-brand-textMain px-3.5 py-2 text-[11px] font-semibold flex items-center gap-1.5 select-none cursor-pointer transition-all duration-150 active:scale-[0.98] shadow-sm"
        >
          <Laptop className="w-3.5 h-3.5 text-teal-400" />
          <span>Work locally</span>
          <ChevronDown className="w-2.5 h-2.5 text-brand-textMuted" />
        </div>

        {/* Git Branch Badge */}
        <div
          data-testid="badge-branch"
          onClick={onBranchClick}
          className="bg-brand-card border border-brand-border hover:border-violet-500/35 hover:bg-brand-popover rounded-full text-brand-textMain px-3.5 py-2 text-[11px] font-semibold flex items-center gap-1.5 select-none cursor-pointer transition-all duration-150 active:scale-[0.98] shadow-sm"
        >
          <GitBranch className="w-3.5 h-3.5 text-purple-400" />
          <span>main</span>
          <ChevronDown className="w-2.5 h-2.5 text-brand-textMuted" />
        </div>
      </div>
    </div>
  );
};
