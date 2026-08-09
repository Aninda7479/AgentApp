import React, { useState } from 'react';
import { Sparkles, Save, Check } from 'lucide-react';

interface StudioViewProps {
  systemPrompt: string;
  onSaveSystemPrompt: (prompt: string) => void;
}

export const StudioView: React.FC<StudioViewProps> = ({ systemPrompt, onSaveSystemPrompt }) => {
  const [prompt, setPrompt] = useState(systemPrompt);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSaveSystemPrompt(prompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Agent Studio & System Prompts</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Customize the system prompt instructions, rules, and behaviors enforced during agent runs.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
        >
          {saved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Saved!' : 'Save System Instructions'}</span>
        </button>
      </div>

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <label className="text-xs font-semibold text-slate-200 block">System Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="You are SuperAgent, an autonomous AI assistant..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-y"
        />
      </div>
    </div>
  );
};
