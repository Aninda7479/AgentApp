/**
 * SuperAgent Browser Extension — Lightweight Safe Markdown Renderer
 * Converts LLM Markdown responses into beautiful, structured, and sanitized HTML.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" class="md-image" loading="lazy" />');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

  // Bold + Italic: ***text*** or ___text___
  result = result.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  result = result.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic: *text* or _text_
  result = result.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g, '<em>$1</em>');

  // Inline Code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  return result;
}

export function renderMarkdown(raw: string): string {
  if (!raw) return '';

  // Extract <think>...</think> and <thought>...</thought> reasoning blocks first
  const thoughtBlocks: string[] = [];
  let processed = raw.replace(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi, (_match, thought) => {
    const placeholder = `%%THOUGHT_BLOCK_${thoughtBlocks.length}%%`;
    const escapedThought = escapeHtml(thought.trim());
    thoughtBlocks.push(
      `<details class="thought-container"><summary class="thought-summary"><span class="thought-icon">💭</span><span class="thought-title">Thinking Process</span><span class="thought-chevron">▼</span></summary><div class="thought-content">${escapedThought}</div></details>`
    );
    return placeholder;
  });

  // Also handle unclosed <think> tag (e.g. while still streaming)
  processed = processed.replace(/<(?:think|thought)>([\s\S]*)$/i, (_match, thought) => {
    const placeholder = `%%THOUGHT_BLOCK_${thoughtBlocks.length}%%`;
    const escapedThought = escapeHtml(thought.trim());
    thoughtBlocks.push(
      `<details class="thought-container" open><summary class="thought-summary"><span class="thought-icon">💭</span><span class="thought-title">Thinking Process</span><span class="thought-chevron">▼</span></summary><div class="thought-content">${escapedThought}</div></details>`
    );
    return placeholder;
  });

  // Extract fenced code blocks so inner characters aren't touched
  const codeBlocks: string[] = [];
  processed = processed.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const escapedCode = escapeHtml(code.trimEnd());
    const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
    codeBlocks.push(
      `<div class="md-code-container">${langLabel}<pre><code class="md-code-block">${escapedCode}</code></pre></div>`
    );
    return placeholder;
  });

  const lines = processed.split('\n');
  const htmlChunks: string[] = [];

  let inList: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableRows: string[] = [];

  const closeList = () => {
    if (inList) {
      htmlChunks.push(`</${inList}>`);
      inList = null;
    }
  };

  const closeTable = () => {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<div class="md-table-wrapper"><table class="md-table">';
      tableRows.forEach((row, idx) => {
        const cells = row.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (idx === 0) {
          tableHtml += '<thead><tr>' + cells.map((c) => `<th>${renderInline(c)}</th>`).join('') + '</tr></thead><tbody>';
        } else if (idx === 1 && cells.every((c) => /^[-:]+$/.test(c))) {
          // Separator line, skip
        } else {
          tableHtml += '<tr>' + cells.map((c) => `<td>${renderInline(c)}</td>`).join('') + '</tr>';
        }
      });
      tableHtml += '</tbody></table></div>';
      htmlChunks.push(tableHtml);
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block placeholder
    if (/^__CODE_BLOCK_\d+__$/.test(trimmed)) {
      closeList();
      closeTable();
      htmlChunks.push(trimmed);
      continue;
    }

    // Thought block placeholder
    if (/^%%THOUGHT_BLOCK_\d+%%$/.test(trimmed)) {
      closeList();
      closeTable();
      htmlChunks.push(trimmed);
      continue;
    }

    // Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      closeList();
      closeTable();
      htmlChunks.push('<hr class="md-hr" />');
      continue;
    }

    // Markdown Table Row
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|', 1)) {
      closeList();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    } else {
      closeTable();
    }

    // Headings
    if (/^#{1,6}\s+/.test(trimmed)) {
      closeList();
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const headingText = trimmed.replace(/^#+\s+/, '');
      htmlChunks.push(`<h${level} class="md-h${level}">${renderInline(headingText)}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      closeList();
      const quoteText = trimmed.replace(/^>\s*/, '');
      htmlChunks.push(`<blockquote class="md-blockquote">${renderInline(quoteText)}</blockquote>`);
      continue;
    }

    // Unordered List (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        htmlChunks.push('<ul class="md-ul">');
      }
      const content = trimmed.replace(/^[-*]\s+/, '');
      htmlChunks.push(`<li class="md-li">${renderInline(content)}</li>`);
      continue;
    }

    // Ordered List (1. 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        htmlChunks.push('<ol class="md-ol">');
      }
      const content = trimmed.replace(/^\d+\.\s+/, '');
      htmlChunks.push(`<li class="md-li">${renderInline(content)}</li>`);
      continue;
    }

    // Empty Line
    if (trimmed === '') {
      closeList();
      continue;
    }

    // Regular Paragraph
    closeList();
    htmlChunks.push(`<p class="md-p">${renderInline(trimmed)}</p>`);
  }

  closeList();
  closeTable();

  let finalHtml = htmlChunks.join('\n');

  // Put back code blocks
  codeBlocks.forEach((codeBlock, idx) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, codeBlock);
  });

  // Put back thought blocks
  thoughtBlocks.forEach((thoughtBlock, idx) => {
    finalHtml = finalHtml.replace(`%%THOUGHT_BLOCK_${idx}%%`, thoughtBlock);
  });

  return finalHtml;
}
