import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'javascript',
  filename,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <div className={`ui-card overflow-hidden flex flex-col w-full ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between bg-brand-sidebar border-b border-brand-border/60 px-3.5 py-2 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-border" />
          <span className="font-mono text-[10px] font-semibold text-brand-textMuted tracking-wider uppercase">
            {filename || language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 bg-brand-card hover:bg-brand-hover border border-brand-border text-[10px] font-semibold text-brand-textMuted hover:text-white px-2 py-1 rounded-md transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={11} className="text-[color:var(--neon-constructive)]" />
              <span className="text-[color:var(--neon-constructive)]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <pre className="m-0 p-4 overflow-auto bg-brand-bg font-mono text-xs leading-relaxed text-brand-textMain scrollbar-thin">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
};
