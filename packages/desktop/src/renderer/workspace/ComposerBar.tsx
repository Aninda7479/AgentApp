/**
 * Composer Bar Component (Pure TailwindCSS)
 * Prompt input composer with slash command autocomplete, file attachments, and send controls.
 */

import React, { useState, KeyboardEvent, useRef } from 'react';
import { Send, Paperclip, ShieldCheck, X, Sparkles, Terminal } from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { useSlashCommands } from '../hooks/useSlashCommands';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

interface ComposerBarProps {
  onSend: (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => void;
  disabled?: boolean;
}

export const ComposerBar: React.FC<ComposerBarProps> = ({ onSend, disabled }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always' | 'never'>('ask');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isOpen: isSlashOpen, suggestions: slashSuggestions } = useSlashCommands(prompt);

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

    onSend(
      trimmed,
      {
        model: selectedModel,
        approvalMode,
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
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3 shadow-2xl backdrop-blur-xl transition-all focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/20">
        {/* Attachment Chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-mono"
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
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask SuperAgent anything, paste code, or type / for commands..."
          rows={2}
          className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm resize-none focus:outline-none scrollbar-thin scrollbar-thumb-slate-800"
        />

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 select-none">
          <div className="flex items-center gap-2">
            <ModelPicker selectedModel={selectedModel} onSelectModel={setSelectedModel} />

            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs cursor-pointer border border-slate-800 transition-colors">
              <Paperclip size={14} />
              <span>Attach</span>
              <input type="file" multiple onChange={handleFileAttach} className="hidden" />
            </label>

            {/* Permissions Mode */}
            <select
              value={approvalMode}
              onChange={(e) => setApprovalMode(e.target.value as 'ask' | 'always' | 'never')}
              className="bg-slate-900 text-slate-300 border border-slate-800 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
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
