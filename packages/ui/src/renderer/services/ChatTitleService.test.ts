import { describe, it, expect } from 'vitest';
import { ChatTitleService } from './ChatTitleService';

describe('ChatTitleService', () => {
  describe('isPlaceholderTitle', () => {
    it('identifies default placeholder titles', () => {
      expect(ChatTitleService.isPlaceholderTitle('Standalone Chat')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('New Chat')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('Chat in DemoProject')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('New chat in MyProject')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('Agent 1')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('Chat 42')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle('')).toBe(true);
      expect(ChatTitleService.isPlaceholderTitle(null)).toBe(true);
    });

    it('identifies custom meaningful titles', () => {
      expect(ChatTitleService.isPlaceholderTitle('Greeting')).toBe(false);
      expect(ChatTitleService.isPlaceholderTitle('Rust Axum REST API')).toBe(false);
      expect(ChatTitleService.isPlaceholderTitle('Fix Python Bug')).toBe(false);
    });
  });

  describe('generateTitle', () => {
    it('generates Greeting for short casual greetings', () => {
      expect(ChatTitleService.generateTitle('he')).toBe('Greeting');
      expect(ChatTitleService.generateTitle('hello')).toBe('Greeting');
      expect(ChatTitleService.generateTitle('hi')).toBe('Greeting');
      expect(ChatTitleService.generateTitle('hey!')).toBe('Greeting');
    });

    it('refines greeting title if response offers assistance', () => {
      const response = "Hello! I see you've sent 'he' a couple of times. Is there something I can help you with today? I'm here to assist!";
      expect(ChatTitleService.generateTitle('he', response)).toBe('Greeting & Assistance');
    });

    it('strips conversational boilerplate and capitalizes properly', () => {
      expect(ChatTitleService.generateTitle('can you help me write a python script for scraping')).toBe('Python Script for Scraping');
      expect(ChatTitleService.generateTitle('how do I build a website with react')).toBe('Website with React');
      expect(ChatTitleService.generateTitle('what is quantum computing')).toBe('Quantum Computing');
      expect(ChatTitleService.generateTitle('please explain how async await works in javascript')).toBe('How Async Await Works');
    });

    it('strips code fences and slash commands', () => {
      expect(ChatTitleService.generateTitle('/ask write a quicksort algorithm in C++')).toBe('Quicksort Algorithm in C++');
      expect(ChatTitleService.generateTitle('fix this code ```js console.log("error") ``` in my script')).toBe('Fix This Code in My Script');
    });

    it('caps title length to avoid UI overflow', () => {
      const title = ChatTitleService.generateTitle('a very extremely long prompt with lots and lots and lots of words that should definitely be shortened');
      expect(title.length).toBeLessThanOrEqual(35);
    });

    it('returns New Chat for empty prompt', () => {
      expect(ChatTitleService.generateTitle('')).toBe('New Chat');
      expect(ChatTitleService.generateTitle('   ')).toBe('New Chat');
    });
  });
});
