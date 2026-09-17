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
});
