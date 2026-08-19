import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/shared/markdown.js';

describe('Browser Extension Markdown Renderer', () => {
  it('renders headings cleanly', () => {
    const input = '# Main Heading\n## Sub Heading\n### Section Heading';
    const output = renderMarkdown(input);
    expect(output).toContain('<h1 class="md-h1">Main Heading</h1>');
    expect(output).toContain('<h2 class="md-h2">Sub Heading</h2>');
    expect(output).toContain('<h3 class="md-h3">Section Heading</h3>');
  });

  it('renders bold, italic, and inline code formatting', () => {
    const input = 'This is **bold** text, *italic* word, and `const x = 10;` code.';
    const output = renderMarkdown(input);
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('<em>italic</em>');
    expect(output).toContain('<code class="md-inline-code">const x = 10;</code>');
  });

  it('renders unordered and ordered lists', () => {
    const input = '* First item\n* **Second item:** detail\n\n1. Step one\n2. Step two';
    const output = renderMarkdown(input);
    expect(output).toContain('<ul class="md-ul">');
    expect(output).toContain('<li class="md-li">First item</li>');
    expect(output).toContain('<li class="md-li"><strong>Second item:</strong> detail</li>');
    expect(output).toContain('<ol class="md-ol">');
    expect(output).toContain('<li class="md-li">Step one</li>');
  });

  it('renders code blocks safely without escaping issues', () => {
    const input = '```typescript\nconst greet = (name: string) => `Hello ${name}`;\n```';
    const output = renderMarkdown(input);
    expect(output).toContain('<div class="md-code-container">');
    expect(output).toContain('typescript');
    expect(output).toContain('const greet = (name: string) =&gt; `Hello ${name}`;');
  });

  it('renders links and images properly', () => {
    const input = 'Check out [Oracle Cloud](https://oracle.com) and ![Badge](https://img.shields.io/badge)';
    const output = renderMarkdown(input);
    expect(output).toContain('<a href="https://oracle.com" target="_blank" rel="noopener noreferrer" class="md-link">Oracle Cloud</a>');
    expect(output).toContain('<img src="https://img.shields.io/badge" alt="Badge" class="md-image" loading="lazy" />');
  });

  it('separates <think> tags into a collapsible thought container', () => {
    const input = '<think>\nAnalyze the question step by step.\n1. Push negation inward.\n</think>\n\nThe solution is **Ex[Ay[(P(x)^~R(x,y))]]**';
    const output = renderMarkdown(input);
    expect(output).toContain('<details class="thought-container">');
    expect(output).toContain('Thinking Process');
    expect(output).toContain('Analyze the question step by step.');
    expect(output).toContain('<strong>Ex[Ay[(P(x)^~R(x,y))]]</strong>');
    expect(output).not.toContain('<think>');
    expect(output).not.toContain('</think>');
  });
});
