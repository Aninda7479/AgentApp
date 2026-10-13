import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteractiveQuestionComposer } from './InteractiveQuestionComposer';
import type { PendingQuestion } from '../stores/questionStore';

describe('InteractiveQuestionComposer Component', () => {
  it('renders single question with options and submits selected choice', () => {
    const pendingQuestion: PendingQuestion = {
      questions: [
        {
          header: 'Database Setup',
          question: 'Which database do you prefer for this project?',
          options: [
            { label: 'PostgreSQL', description: 'Robust relational database' },
            { label: 'SQLite', description: 'Lightweight local database' },
          ],
          isMultiSelect: false,
        },
      ],
      timestamp: Date.now(),
    };

    const onSubmit = vi.fn();
    const onDismiss = vi.fn();

    render(
      <InteractiveQuestionComposer
        pendingQuestion={pendingQuestion}
        onSubmit={onSubmit}
        onDismiss={onDismiss}
      />
    );

    // Header and question text
    expect(screen.getByText('Database Setup')).toBeDefined();
    expect(screen.getByText('Which database do you prefer for this project?')).toBeDefined();
    expect(screen.getByText('PostgreSQL')).toBeDefined();
    expect(screen.getByText('Robust relational database')).toBeDefined();
    expect(screen.getByText('SQLite')).toBeDefined();

    // Select second option
    const sqliteOption = screen.getByTestId('question-option-1');
    fireEvent.click(sqliteOption);

    // Submit answer
    const submitBtn = screen.getByTestId('question-submit-btn');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith('My answer: SQLite');
  });

  it('renders multi-question stepper and allows navigating next/back and submitting all', () => {
    const pendingQuestion: PendingQuestion = {
      questions: [
        {
          header: 'Trivia Q1',
          question: 'What is the capital of France?',
          options: [{ label: 'Paris' }, { label: 'Rome' }],
        },
        {
          header: 'Trivia Q2',
          question: 'What is 2 + 2?',
          options: [{ label: '3' }, { label: '4' }],
        },
      ],
      timestamp: Date.now(),
    };

    const onSubmit = vi.fn();
    const onDismiss = vi.fn();

    render(
      <InteractiveQuestionComposer
        pendingQuestion={pendingQuestion}
        onSubmit={onSubmit}
        onDismiss={onDismiss}
      />
    );

    // First question displayed
    expect(screen.getByText('Trivia Q1')).toBeDefined();
    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(screen.getByText('What is the capital of France?')).toBeDefined();

    // Select Paris (option 0)
    fireEvent.click(screen.getByTestId('question-option-0'));

    // Click Next
    const nextBtn = screen.getByTestId('question-next-btn');
    fireEvent.click(nextBtn);

    // Second question displayed
    expect(screen.getByText('Trivia Q2')).toBeDefined();
    expect(screen.getByText('2 / 2')).toBeDefined();
    expect(screen.getByText('What is 2 + 2?')).toBeDefined();

    // Select 4 (option 1)
    fireEvent.click(screen.getByTestId('question-option-1'));

    // Submit all
    const submitAllBtn = screen.getByTestId('question-submit-btn');
    fireEvent.click(submitAllBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedText = onSubmit.mock.calls[0][0];
    expect(submittedText).toContain('Here are my answers:');
    expect(submittedText).toContain('1. [Trivia Q1] What is the capital of France?: Paris');
    expect(submittedText).toContain('2. [Trivia Q2] What is 2 + 2?: 4');
  });

  it('triggers onDismiss when dismiss button is clicked', () => {
    const pendingQuestion: PendingQuestion = {
      questions: [{ question: 'Quick question?', options: [{ label: 'Yes' }] }],
      timestamp: Date.now(),
    };

    const onSubmit = vi.fn();
    const onDismiss = vi.fn();

    render(
      <InteractiveQuestionComposer
        pendingQuestion={pendingQuestion}
        onSubmit={onSubmit}
        onDismiss={onDismiss}
      />
    );

    const dismissBtn = screen.getByTestId('dismiss-question-btn');
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
