import { describe, it, expect, vi } from 'vitest';
import { ChatTitleService } from './ChatTitleService';
import { AgentOrchestrator } from './AgentOrchestrator';
import { chatStore } from '../stores/chatStore';
import { IpcBridge } from '../core/ipc';
import type { StoredChat } from '../core/types';

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

  describe('cleanModelTitle', () => {
    it('strips surrounding quotes and markdown', () => {
      expect(ChatTitleService.cleanModelTitle('"Python Web Scraper"')).toBe('Python Web Scraper');
      expect(ChatTitleService.cleanModelTitle("'React Form Validation'")).toBe('React Form Validation');
      expect(ChatTitleService.cleanModelTitle('“Deep Learning Model”')).toBe('Deep Learning Model');
      expect(ChatTitleService.cleanModelTitle('**Smart Assistant**')).toBe('Smart Assistant');
    });

    it('strips common model prefixes', () => {
      expect(ChatTitleService.cleanModelTitle('Title: Rust Async Programming.')).toBe('Rust Async Programming');
      expect(ChatTitleService.cleanModelTitle('Chat Title: Fast Fourier Transform')).toBe('Fast Fourier Transform');
      expect(ChatTitleService.cleanModelTitle('Suggested Title: Docker Container Setup')).toBe('Docker Container Setup');
      expect(ChatTitleService.cleanModelTitle('Here is a title: Building APIs')).toBe('Building APIs');
    });

    it('strips thinking blocks from reasoning models', () => {
      expect(
        ChatTitleService.cleanModelTitle('<think>The user wants a script for scraping web data.</think> Title: Web Scraping Script')
      ).toBe('Web Scraping Script');
    });

    it('caps title length cleanly without breaking mid-word', () => {
      const longTitle = 'Comprehensive Architectural Overview for Distributed Cloud Systems and Kubernetes';
      const cleaned = ChatTitleService.cleanModelTitle(longTitle);
      expect(cleaned.length).toBeLessThanOrEqual(32);
      expect(cleaned).toBe('Comprehensive Architectural');
    });

    it('returns empty string for blank or invalid model output', () => {
      expect(ChatTitleService.cleanModelTitle('')).toBe('');
      expect(ChatTitleService.cleanModelTitle('   ')).toBe('');
      expect(ChatTitleService.cleanModelTitle('"."')).toBe('');
    });
  });

  describe('generateTitleWithModel', () => {
    it('uses model title when IpcBridge returns a valid title', async () => {
      vi.spyOn(IpcBridge, 'generateChatTitle').mockResolvedValueOnce({
        title: 'Title: "Autonomous Agent Engine"',
      });

      const title = await ChatTitleService.generateTitleWithModel(
        'build an autonomous agent',
        'Here is the agent code',
        { model: 'big-pickle', provider: 'opencode' }
      );

      expect(title).toBe('Autonomous Agent Engine');
    });

    it('falls back to rule-based generation when model returns null', async () => {
      vi.spyOn(IpcBridge, 'generateChatTitle').mockResolvedValueOnce(null);

      const title = await ChatTitleService.generateTitleWithModel(
        'how do I build a website with react',
        undefined,
        { model: 'gemini-2.5-flash' }
      );

      expect(title).toBe('Website with React');
    });

    it('falls back to rule-based generation when IpcBridge throws', async () => {
      vi.spyOn(IpcBridge, 'generateChatTitle').mockRejectedValueOnce(new Error('Network failure'));

      const title = await ChatTitleService.generateTitleWithModel(
        'can you help me write a python script for scraping'
      );

      expect(title).toBe('Python Script for Scraping');
    });
  });

  describe('Mid-Chat Lockout & First Message Lifecycle', () => {
    it('initializes title on first message of new chat and invokes model on response', async () => {
      vi.spyOn(IpcBridge, 'runAgent').mockResolvedValue({ success: true });
      vi.spyOn(IpcBridge, 'writeStore').mockResolvedValue(undefined);
      const modelSpy = vi.spyOn(ChatTitleService, 'generateTitleWithModel').mockResolvedValue('Python Web Scraper');

      chatStore.setChats([]);
      chatStore.openPanel('draft-chat');

      // First turn sendPrompt
      await AgentOrchestrator.sendPrompt('draft-chat', 'can you write a python web scraper');

      const chatsAfterSend = chatStore.getState().chats;
      expect(chatsAfterSend.length).toBe(1);
      const newChat = chatsAfterSend[0];
      expect(newChat.title).toBe('Python Web Scraper'); // Initial title set

      // Add assistant response to turn 1
      chatStore.setSteps(newChat.id, [
        { id: 'user-1', type: 'user', content: 'can you write a python web scraper' },
        { id: 'asst-1', type: 'assistant', content: 'Here is the beautifulsoup script' },
      ]);

      await AgentOrchestrator.stopRun(newChat.id);

      // Model title generation called for turn 1
      expect(modelSpy).toHaveBeenCalledWith(
        'can you write a python web scraper',
        'Here is the beautifulsoup script',
        expect.any(Object)
      );
    });

    it('strictly locks out title generation in mid-chat (turns 2+)', async () => {
      vi.spyOn(IpcBridge, 'runAgent').mockResolvedValue({ success: true });
      vi.spyOn(IpcBridge, 'writeStore').mockResolvedValue(undefined);
      const modelSpy = vi.spyOn(ChatTitleService, 'generateTitleWithModel');

      const chatId = 'existing-chat-1';
      const establishedChat: StoredChat = {
        id: chatId,
        title: 'Original Great Title',
        project: '',
        model: 'big-pickle',
        timestamp: new Date().toISOString(),
        steps: [
          { id: 'user-1', type: 'user', content: 'first turn prompt' },
          { id: 'asst-1', type: 'assistant', content: 'first turn response' },
        ],
      };
      chatStore.setChats([establishedChat]);
      chatStore.openPanel(chatId);
      chatStore.setSteps(chatId, establishedChat.steps);

      // Turn 2 sendPrompt (mid-chat)
      await AgentOrchestrator.sendPrompt(chatId, 'second turn prompt');

      // Title must not have changed during sendPrompt
      const chatAfterTurn2 = chatStore.getState().chats.find((c) => c.id === chatId);
      expect(chatAfterTurn2?.title).toBe('Original Great Title');

      // Add turn 2 assistant reply (userSteps.length is now 2)
      chatStore.setSteps(chatId, [
        ...establishedChat.steps,
        { id: 'user-2', type: 'user', content: 'second turn prompt' },
        { id: 'asst-2', type: 'assistant', content: 'second turn response' },
      ]);

      modelSpy.mockClear();

      // Terminal event for turn 2 (mid-chat)
      await AgentOrchestrator.stopRun(chatId);

      // generateTitleWithModel MUST NOT be called in mid-chat
      expect(modelSpy).not.toHaveBeenCalled();

      const finalChat = chatStore.getState().chats.find((c) => c.id === chatId);
      expect(finalChat?.title).toBe('Original Great Title');
    });
  });
});
