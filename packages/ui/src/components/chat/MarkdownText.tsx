import React, { useMemo } from 'react';

export const StreamingCursor = () => (
  <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[color:var(--brand-text-main)] animate-pulse" />
);

interface MarkdownTextProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, isStreaming }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    
    let key = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('# ')) {
        elements.push(<h1 key={key++} className="text-xl font-bold mt-4 mb-2 text-[color:var(--brand-text-main)]">{renderInline(line.substring(2))}</h1>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={key++} className="text-lg font-bold mt-3 mb-2 text-[color:var(--brand-text-main)]">{renderInline(line.substring(3))}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={key++} className="text-md font-bold mt-2 mb-1 text-[color:var(--brand-text-main)]">{renderInline(line.substring(4))}</h3>);
      } else if (line === '---') {
        elements.push(<hr key={key++} className="my-4 border-[color:var(--brand-border)]" />);
      } else if (line.trim() === '') {
        elements.push(<div key={key++} className="h-2" />);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <ul key={key++} className="list-disc pl-5 mb-1 text-[color:var(--brand-text-main)]">
            <li>{renderInline(line.substring(2))}</li>
          </ul>
        );
      } else if (/^\d+\.\s/.test(line)) {
        const text = line.replace(/^\d+\.\s/, '');
        elements.push(
          <ol key={key++} className="list-decimal pl-5 mb-1 text-[color:var(--brand-text-main)]">
            <li>{renderInline(text)}</li>
          </ol>
        );
      } else {
        elements.push(<p key={key++} className="mb-1 text-[color:var(--brand-text-main)] leading-relaxed">{renderInline(line)}</p>);
      }
    }
    
    return elements;
  }, [content]);

  function renderInline(text: string): React.ReactNode[] {
    const parts = [];
    let current = '';
    let i = 0;
    let key = 0;
    
    while (i < text.length) {
      if (text.substring(i, i + 2) === '**') {
        if (current) parts.push(<React.Fragment key={key++}>{current}</React.Fragment>);
        current = '';
        i += 2;
        let boldText = '';
        while (i < text.length && text.substring(i, i + 2) !== '**') {
          boldText += text[i];
          i++;
        }
        parts.push(<strong key={key++} className="font-semibold text-[color:var(--brand-text-main)]">{boldText}</strong>);
        i += 2;
      } else if (text[i] === '`') {
        if (current) parts.push(<React.Fragment key={key++}>{current}</React.Fragment>);
        current = '';
        i++;
        let codeText = '';
        while (i < text.length && text[i] !== '`') {
          codeText += text[i];
          i++;
        }
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded text-sm font-mono bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] text-[color:var(--brand-text-main)]">
            {codeText}
          </code>
        );
        i++;
      } else {
        current += text[i];
        i++;
      }
    }
    if (current) parts.push(<React.Fragment key={key++}>{current}</React.Fragment>);
    return parts;
  }

  return (
    <div className="markdown-container text-sm">
      {renderedContent}
      {isStreaming && <StreamingCursor />}
    </div>
  );
};
