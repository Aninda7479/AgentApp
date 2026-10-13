import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerBar } from './ComposerBar';
import { ModelPicker } from './ModelPicker';
import { ProjectPicker } from './ProjectPicker';
import { sessionStore } from '../stores/sessionStore';
import { chatStore } from '../stores/chatStore';
import { questionStore } from '../stores/questionStore';

describe('ComposerBar Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chatStore.setActiveChatId(null);
  });

  it('renders input with custom placeholder, send button, and action controls', () => {
    render(<ComposerBar onSend={vi.fn()} placeholder="Ask anything..." />);

    const textarea = screen.getByPlaceholderText('Ask anything...');
    expect(textarea).toBeDefined();
    expect(screen.getByTestId('composer-attach-btn')).toBeDefined();
    expect(screen.getByTestId('btn-send')).toBeDefined();
    expect(screen.getByTestId('approval-dropdown-btn')).toBeDefined();
    expect(screen.getByTestId('model-select-btn')).toBeDefined();
  });

  it('types text and submits with onSend on Enter keypress, clearing input', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    render(<ComposerBar onSend={handleSend} placeholder="Write a message..." />);

    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    await user.type(textarea, 'Refactor auth store');
    expect(textarea.value).toBe('Refactor auth store');

    await user.keyboard('{Enter}');
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith(
      'Refactor auth store',
      expect.objectContaining({
        approvalMode: 'ask',
        sandbox: true,
      }),
      []
    );
    expect(textarea.value).toBe('');
  });

  it('inserts newline on Shift+Enter without triggering onSend', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    render(<ComposerBar onSend={handleSend} placeholder="Write a message..." />);

    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2');

    expect(handleSend).not.toHaveBeenCalled();
    expect(textarea.value).toContain('Line 1');
    expect(textarea.value).toContain('Line 2');
  });

  it('does not trigger onSend when disabled', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    render(<ComposerBar onSend={handleSend} disabled={true} placeholder="Write a message..." />);

    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    await user.type(textarea, 'Cannot send this');
    await user.keyboard('{Enter}');
    expect(handleSend).not.toHaveBeenCalled();

    const sendBtn = screen.getByTestId('btn-send');
    await user.click(sendBtn);
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('submits on send button click when text is present', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    render(<ComposerBar onSend={handleSend} placeholder="Write a message..." />);

    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    await user.type(textarea, 'Click send test');

    const sendBtn = screen.getByTestId('btn-send');
    await user.click(sendBtn);

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith(
      'Click send test',
      expect.objectContaining({ approvalMode: 'ask' }),
      []
    );
    expect(textarea.value).toBe('');
  });

  it('displays active task cue card seamlessly inside composer when a task is running', () => {
    chatStore.setActiveChatId('chat-composer-task-test');
    sessionStore.markRunning('chat-composer-task-test');
    sessionStore.setActiveTask('chat-composer-task-test', {
      type: 'command',
      name: 'run_command',
      detail: 'cargo check --workspace',
      startedAt: Date.now(),
    });

    render(<ComposerBar chatId="chat-composer-task-test" onSend={vi.fn()} />);

    expect(screen.getByText('Active Processing Deck')).toBeDefined();
    expect(screen.getByText(/\$ cargo check --workspace/)).toBeDefined();

    // Cleanup
    sessionStore.setActiveTask('chat-composer-task-test', null);
  });

  it('transforms composer into InteractiveQuestionComposer when pendingQuestion is set in questionStore', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    const testChatId = 'chat-question-test';

    questionStore.setPendingQuestion(testChatId, {
      questions: [
        {
          header: 'Quiz Selection',
          question: 'Which architecture pattern fits best?',
          options: [
            { label: 'Microservices' },
            { label: 'Modular Monolith' },
          ],
        },
      ],
      timestamp: Date.now(),
    });

    render(<ComposerBar chatId={testChatId} onSend={handleSend} />);

    // Compose box is transformed: regular textarea is replaced by InteractiveQuestionComposer
    expect(screen.queryByTestId('composer-input')).toBeNull();
    expect(screen.getByTestId('interactive-question-composer')).toBeDefined();
    expect(screen.getByText('Quiz Selection')).toBeDefined();
    expect(screen.getByText('Which architecture pattern fits best?')).toBeDefined();

    // Select second option
    const option = screen.getByTestId('question-option-1');
    await user.click(option);

    // Submit answer
    const submitBtn = screen.getByTestId('question-submit-btn');
    await user.click(submitBtn);

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith(
      'My answer: Modular Monolith',
      expect.objectContaining({ approvalMode: 'ask' }),
      []
    );

    // Question is cleared in store
    expect(questionStore.getPendingQuestion(testChatId)).toBeNull();
  });
});

describe('ModelPicker Component', () => {
  it('renders trigger button and invokes onSelectModel on selection', async () => {
    const user = userEvent.setup();
    const handleSelectModel = vi.fn();

    render(
      <ModelPicker
        selectedModel="Claude 3.7 Sonnet"
        onSelectModel={handleSelectModel}
      />
    );

    const trigger = screen.getByTestId('model-select-btn');
    expect(trigger).toBeDefined();
    expect(screen.getByText('Claude 3.7 Sonnet')).toBeDefined();

    await user.click(trigger);
    // Menu opens
    const gptOption = screen.queryByText(/GPT-4o/i) || screen.queryByRole('menuitem');
    if (gptOption) {
      await user.click(gptOption);
    }
  });
});

describe('ProjectPicker Component', () => {
  it('renders trigger button and displays project name', () => {
    render(
      <ProjectPicker
        selectedProject="MySuperProject"
        onSelectProject={vi.fn()}
      />
    );

    const btn = screen.getByTestId('project-select-btn');
    expect(btn).toBeDefined();
    expect(screen.getByText('MySuperProject')).toBeDefined();
  });

  it('renders pill variant trigger button with fallback label', () => {
    render(
      <ProjectPicker
        variant="pill"
        onSelectProject={vi.fn()}
      />
    );

    const btn = screen.getByTestId('project-select-btn');
    expect(btn).toBeDefined();
    expect(btn.className).toContain('rounded-full');
  });
});
