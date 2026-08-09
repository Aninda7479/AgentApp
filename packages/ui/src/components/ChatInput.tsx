import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Mic, StopCircle } from 'lucide-react';
import { ModelOption } from '../types.js';
import { ModelSelector } from './ModelSelector.js';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  onStopStreaming?: () => void;
  selectedModel: ModelOption;
  onSelectModel: (model: ModelOption) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  selectedModel,
  onSelectModel
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800">
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 focus-within:border-indigo-500/80 rounded-2xl p-2.5 shadow-lg transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask SuperAgent to write code, search codebase, or run tasks..."
          rows={1}
          className="w-full bg-transparent text-slate-100 placeholder-slate-400 text-xs sm:text-sm resize-none focus:outline-none px-2 py-1 max-h-44"
        />

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-1">
          {/* Model Dropdown Selector */}
          <ModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />

          {/* Action Buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Attach File"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md transition-colors"
                title="Stop Response Generation"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className={`p-2 rounded-xl text-white shadow-md transition-colors ${
                  input.trim()
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
                title="Send Message (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
