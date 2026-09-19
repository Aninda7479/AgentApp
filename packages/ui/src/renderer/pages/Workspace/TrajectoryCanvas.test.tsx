import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrajectoryCanvas, WorkedHeader, ToolCallCard } from './TrajectoryCanvas';
import type { TrajectoryStep } from './TrajectoryCanvas';

describe('WorkedHeader Component', () => {
  it('renders Thinking... when isWorking is true and displays children', () => {
    const html = renderToStaticMarkup(
      <WorkedHeader duration="2s" isWorking={true}>
        <div data-testid="child-content">Executing task</div>
      </WorkedHeader>
    );

    expect(html).toContain('Thinking...');
    expect(html).toContain('child-content');
  });

  it('renders collapsed Worked for label when isWorking is false', () => {
    const html = renderToStaticMarkup(
      <WorkedHeader duration="3s" isWorking={false}>
        <div data-testid="child-content">Hidden details</div>
      </WorkedHeader>
    );

    expect(html).toContain('Worked for 3s');
    expect(html).not.toContain('child-content');
  });

  it('renders Thought for label when isThoughtOnly is true', () => {
    const html = renderToStaticMarkup(
      <WorkedHeader duration="1s" isWorking={false} isThoughtOnly={true}>
        <div data-testid="thought-content">Reasoning details</div>
      </WorkedHeader>
    );

    expect(html).toContain('Thought for 1s');
  });
});

describe('ToolCallCard Component', () => {
  it('renders tool call card with command details', () => {
    const step: TrajectoryStep = {
      id: 'step-1',
      type: 'tool_call',
      content: 'run_command({"command": "date"})',
      status: 'success',
      toolName: 'run_command',
      metadata: {
        toolInput: { command: 'date' }
      }
    };

    const html = renderToStaticMarkup(
      <ToolCallCard step={step} />
    );

    expect(html).toContain('Ran');
    expect(html).toContain('date');
  });
});

describe('TrajectoryCanvas Component', () => {
  it('renders empty state when no steps exist', () => {
    const html = renderToStaticMarkup(
      <TrajectoryCanvas steps={[]} />
    );

    expect(html).toContain('trajectory-canvas');
    expect(html).toContain('No agent execution trajectory yet');
  });

  it('renders user prompt and agent response turns', () => {
    const steps: TrajectoryStep[] = [
      {
        id: 'u-1',
        type: 'user',
        content: 'What is today\'s date?'
      },
      {
        id: 'a-1',
        type: 'assistant',
        content: 'Today is Friday, September 18, 2026.'
      }
    ];

    const html = renderToStaticMarkup(
      <TrajectoryCanvas steps={steps} />
    );

    expect(html).toContain('What is today&#x27;s date?');
    expect(html).toContain('Today is Friday, September 18, 2026.');
  });

  it('renders markdown tables properly in table design with thead and tbody instead of raw text pipes', () => {
    const tableMarkdown = `Here are the tools I have access to:

| Tool | Description |
|---|---|
| bash | Execute shell commands (PowerShell) |
| glob | Find files by pattern (e.g. \`**/*.rs\` ) |
| todowrite | Track multi-step task progress |

How can I help you?`;

    const steps: TrajectoryStep[] = [
      {
        id: 'u-1',
        type: 'user',
        content: 'What tools do you have access to?'
      },
      {
        id: 'a-1',
        type: 'assistant',
        content: tableMarkdown
      }
    ];

    const html = renderToStaticMarkup(
      <TrajectoryCanvas steps={steps} />
    );

    // Verify structured table elements exist
    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toContain('<th');
    expect(html).toContain('Tool');
    expect(html).toContain('Description');
    expect(html).toContain('bash');
    expect(html).toContain('Execute shell commands (PowerShell)');
    expect(html).toContain('todowrite');
    expect(html).toContain('3 items');

    // Inline code in table cell
    expect(html).toContain('<code');
    expect(html).toContain('**/*.rs');

    // Paragraphs before and after the table
    expect(html).toContain('Here are the tools I have access to:');
    expect(html).toContain('How can I help you?');

    // The raw delimiter |---|---| should not be rendered as text
    expect(html).not.toContain('|---|---|');
  });
});

