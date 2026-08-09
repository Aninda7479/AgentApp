import React from 'react';
import { Bot, User, Terminal, FileText, Search, Copy, Check, AlertCircle } from 'lucide-react';
import { ChatMessage, ContentBlock } from '../types.js';

interface ChatViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onCopyText: (text: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ messages, isStreaming, onCopyText }) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    onCopyText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-14 h-14 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20 flex items-center justify-center mb-4 shadow-inner">
          <Bot className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-2">SuperAgent Core v2</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Autonomous AI Coding & Workspace Automation Agent. Enter a prompt to search code, edit files, or execute shell commands.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="font-semibold text-slate-200 block mb-1">🔍 Search Codebase</span>
            <span className="text-slate-400">"Find all occurrences of API endpoints in src"</span>
          </div>
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="font-semibold text-slate-200 block mb-1">⚡ Run Tests & Commands</span>
            <span className="text-slate-400">"Run cargo check and fix any compiler warnings"</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex space-x-3 max-w-4xl mx-auto ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {message.role !== 'user' && (
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-4 h-4" />
            </div>
          )}

          <div
            className={`flex-1 rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-sm ${
              message.role === 'user'
                ? 'bg-indigo-600 text-white max-w-2xl ml-auto'
                : 'bg-slate-900 text-slate-100 border border-slate-800'
            }`}
          >
            {message.content.map((block, idx) => (
              <div key={idx} className="space-y-2">
                {block.type === 'text' && (
                  <div className="whitespace-pre-wrap font-sans">{block.text}</div>
                )}

                {block.type === 'tool_use' && (
                  <div className="my-2 p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-xs">
                    <div className="flex items-center space-x-2 text-indigo-400 font-semibold">
                      <Terminal className="w-4 h-4" />
                      <span>Executing Tool: {block.name}</span>
                    </div>
                    <pre className="p-2 bg-slate-900 rounded-lg text-slate-300 overflow-x-auto text-[11px]">
                      {JSON.stringify(block.input, null, 2)}
                    </pre>
                  </div>
                )}

                {block.type === 'tool_result' && (
                  <div
                    className={`my-2 p-3 rounded-xl border font-mono text-xs ${
                      block.is_error
                        ? 'bg-red-950/40 border-red-800/60 text-red-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-semibold mb-1">
                      {block.is_error ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Check className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>Tool Output</span>
                    </div>
                    <pre className="p-2 bg-slate-900 rounded-lg overflow-x-auto text-[11px] max-h-48 whitespace-pre-wrap">
                      {block.content}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {message.role !== 'user' && (
              <div className="mt-2 pt-2 border-t border-slate-800/60 flex justify-end">
                <button
                  onClick={() =>
                    handleCopy(
                      message.id,
                      message.content
                        .map((b) => (b.type === 'text' ? b.text : ''))
                        .join('\n')
                    )
                  }
                  className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors"
                  title="Copy response"
                >
                  {copiedId === message.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {message.role === 'user' && (
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <User className="w-4 h-4" />
            </div>
          )}
        </div>
      ))}

      {isStreaming && (
        <div className="flex space-x-3 max-w-4xl mx-auto items-center">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span>SuperAgent is generating response...</span>
          </div>
        </div>
      )}
    </div>
  );
};
