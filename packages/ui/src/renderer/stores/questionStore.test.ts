import { describe, it, expect, beforeEach } from 'vitest';
import { questionStore, parseQuestionToolArgs } from './questionStore';

describe('questionStore & parseQuestionToolArgs', () => {
  beforeEach(() => {
    questionStore.clearAll();
  });

  describe('parseQuestionToolArgs', () => {
    it('returns null for null, undefined, or empty payload', () => {
      expect(parseQuestionToolArgs(null)).toBeNull();
      expect(parseQuestionToolArgs(undefined)).toBeNull();
      expect(parseQuestionToolArgs({})).toBeNull();
      expect(parseQuestionToolArgs('invalid json string')).toBeNull();
    });

    it('parses single question with string options', () => {
      const args = {
        header: 'Architecture Choice',
        question: 'Which database do you prefer?',
        options: ['PostgreSQL', 'SQLite', 'MongoDB'],
      };

      const result = parseQuestionToolArgs(args, 'call-1');
      expect(result).not.toBeNull();
      expect(result?.toolCallId).toBe('call-1');
      expect(result?.questions).toHaveLength(1);
      expect(result?.questions[0].header).toBe('Architecture Choice');
      expect(result?.questions[0].question).toBe('Which database do you prefer?');
      expect(result?.questions[0].options).toEqual([
        { label: 'PostgreSQL' },
        { label: 'SQLite' },
        { label: 'MongoDB' },
      ]);
      expect(result?.questions[0].isMultiSelect).toBe(false);
    });

    it('parses multi-question quiz with object options and multi-select', () => {
      const args = {
        questions: [
          {
            header: 'Rust Trivia Q1',
            question: 'Which keyword declares a public function?',
            options: [
              { label: 'pub fn', description: 'Public function in Rust' },
              { label: 'fn', description: 'Private function by default' },
            ],
            is_multi_select: false,
          },
          {
            header: 'Rust Trivia Q2',
            question: 'Select all compound types:',
            choices: [
              { label: 'Tuple', description: 'Fixed length heterogeneous' },
              { label: 'Array', description: 'Fixed length homogeneous' },
              { label: 'i32', description: 'Scalar primitive' },
            ],
            is_multi_select: true,
          },
        ],
      };

      const result = parseQuestionToolArgs(args, 'call-2');
      expect(result).not.toBeNull();
      expect(result?.questions).toHaveLength(2);

      const q1 = result!.questions[0];
      expect(q1.header).toBe('Rust Trivia Q1');
      expect(q1.question).toBe('Which keyword declares a public function?');
      expect(q1.options).toHaveLength(2);
      expect(q1.options[0]).toEqual({ label: 'pub fn', description: 'Public function in Rust' });
      expect(q1.isMultiSelect).toBe(false);

      const q2 = result!.questions[1];
      expect(q2.header).toBe('Rust Trivia Q2');
      expect(q2.options).toHaveLength(3);
      expect(q2.isMultiSelect).toBe(true);
    });

    it('parses JSON string representation of tool args', () => {
      const jsonStr = JSON.stringify({
        question: 'Confirm migration?',
        options: ['Yes', 'No'],
      });

      const result = parseQuestionToolArgs(jsonStr);
      expect(result).not.toBeNull();
      expect(result?.questions[0].question).toBe('Confirm migration?');
      expect(result?.questions[0].options).toEqual([{ label: 'Yes' }, { label: 'No' }]);
    });
  });

  describe('questionStore state management', () => {
    it('manages pending questions by chatId and allows clearing', () => {
      expect(questionStore.getPendingQuestion('chat-123')).toBeNull();

      const sample = {
        questions: [{ question: 'Test question', options: [{ label: 'Option A' }] }],
        timestamp: Date.now(),
      };

      questionStore.setPendingQuestion('chat-123', sample);
      expect(questionStore.getPendingQuestion('chat-123')).toEqual(sample);
      // Handles session- prefix transparently
      expect(questionStore.getPendingQuestion('session-chat-123')).toEqual(sample);

      questionStore.clearPendingQuestion('chat-123');
      expect(questionStore.getPendingQuestion('chat-123')).toBeNull();
      expect(questionStore.getPendingQuestion('session-chat-123')).toBeNull();
    });

    it('clears all pending questions on clearAll', () => {
      questionStore.setPendingQuestion('chat-a', {
        questions: [{ question: 'Q A', options: [] }],
        timestamp: Date.now(),
      });
      questionStore.setPendingQuestion('chat-b', {
        questions: [{ question: 'Q B', options: [] }],
        timestamp: Date.now(),
      });

      expect(questionStore.getPendingQuestion('chat-a')).not.toBeNull();
      expect(questionStore.getPendingQuestion('chat-b')).not.toBeNull();

      questionStore.clearAll();
      expect(questionStore.getPendingQuestion('chat-a')).toBeNull();
      expect(questionStore.getPendingQuestion('chat-b')).toBeNull();
    });
  });
});
