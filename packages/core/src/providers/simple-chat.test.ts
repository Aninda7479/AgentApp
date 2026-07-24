import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { sendChatMessageDirect, type SimpleChatConfig } from './simple-chat.js';
import { getChatJsonPath } from '../storage/conversation-paths.js';
import { getUserDataDirectory } from '../storage/locations.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendChatMessageDirect — simplified conversation flow', () => {
  it('correctly appends user and assistant steps, calls the endpoint, and persists to chat.json', async () => {
    const mockApiResponse = {
      choices: [
        {
          message: {
            content: "Hello! I am a simple assistant response. Happy to help."
          }
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          async json() {
            return mockApiResponse;
          }
        } as any;
      })
    );

    const testUserDir = path.resolve(process.cwd(), 'temp-test-user-dir-' + Date.now());
    
    const config: SimpleChatConfig = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key-123',
      baseUrl: 'https://api.openai.com/v1',
      userDataDir: testUserDir
    };

    const chatId = 'test-chat-session-simple';
    const userPrompt = 'Hello there, how are you?';

    const reply = await sendChatMessageDirect(chatId, userPrompt, config);
    expect(reply).toBe("Hello! I am a simple assistant response. Happy to help.");

    // Check if the chat.json file was written to disk and has user & assistant steps
    const expectedFilePath = getChatJsonPath(testUserDir, chatId);
    expect(fs.existsSync(expectedFilePath)).toBe(true);

    const raw = fs.readFileSync(expectedFilePath, 'utf8');
    const parsed = JSON.parse(raw);

    expect(parsed.id).toBe(chatId);
    expect(parsed.steps.length).toBe(2);
    expect(parsed.steps[0].type).toBe('user');
    expect(parsed.steps[0].content).toBe(userPrompt);
    expect(parsed.steps[1].type).toBe('assistant');
    expect(parsed.steps[1].content).toBe(reply);

    // Clean up temporary test directory
    await fsp.rm(testUserDir, { recursive: true, force: true });
  });
});
