import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests the orchestrated, bridge-aware completion path end-to-end with NO
 * network calls. We stub the adapter factory so a vision model returns a
 * description and a text-only target returns the final answer, then assert that
 * AgentEngine.runOrchestrated bridges an image attachment and surfaces the
 * handoff as a 'thought' event. Also covers buildRouterPool (settings -> pool).
 */

const calls: Record<string, any[]> = {};
const fakeAdapters: Record<string, { complete: (r: any) => Promise<any> }> = {};

vi.mock('../providers/models.js', async (importActual) => {
  const actual = await importActual<typeof import('../providers/models.js')>();
  return {
    ...actual,
    createProviderAdapter: (config: { provider: string }) => {
      const a = fakeAdapters[config.provider];
      if (!a) throw new Error(`no fake adapter for ${config.provider}`);
      return a;
    }
  };
});

import { AgentEngine, buildRouterPool, buildBridgeRequest } from './ai-engine.js';
import { BYOKProviderManager } from './byok.js';
import { SettingsStorage } from '../storage/settings-store.js';
import type { AgentEngineConfig, RouterModel, ImageAttachment, ModelSettings } from '../types/agent.js';

const visionModel: RouterModel = { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, supportsVision: true, supportsTools: true };
const textModel: RouterModel = { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true, supportsVision: false, supportsTools: true };

function cfg(provider: string, model = 'm', apiKey = 'k'): any {
  return { provider: provider as any, apiKey, model, baseUrl: '' };
}
function mgrWith(...configs: any[]): BYOKProviderManager {
  const m = new BYOKProviderManager();
  for (const c of configs) m.registerKey(c);
  return m;
}
const imgAttachment: ImageAttachment = { path: '/tmp/x.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,AAAA', size: 4 };

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(fakeAdapters)) delete fakeAdapters[k];
  fakeAdapters['openai'] = { complete: async (r: any) => { (calls.openai ||= []).push(r); return { content: 'a cat on a chair', usage: {} }; } };
  fakeAdapters['deepseek'] = { complete: async (r: any) => { (calls.deepseek ||= []).push(r); return { content: 'final answer', usage: {} }; } };
  SettingsStorage.saveSettings({ models: [], modelGov: { enabledModels: [], categoryOverrides: {}, optimizationGoal: 'quality' } });
  SettingsStorage.clearCache();
});

describe('buildRouterPool', () => {
  it('derives supportsVision from ModelGovStorage scores (consistent with model-gov)', () => {
    const models: ModelSettings[] = [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, inputModalities: ['text', 'image'] },
      { id: 'deepseek-chat', name: 'DeepSeek', providerId: 'deepseek', enabled: true, inputModalities: ['text'] }
    ];
    const pool = buildRouterPool(models);
    expect(pool[0].supportsVision).toBe(true); // gpt-4o vision score >= 75
    expect(pool[1].supportsVision).toBe(false); // deepseek vision score < 75
    expect(pool[0].inputModalities).toEqual(['text', 'image']);
  });
});

describe('buildBridgeRequest', () => {
  it('encodes image attachments as image_url blocks', () => {
    const req = buildBridgeRequest('what is this?', [imgAttachment]);
    const blocks = req.messages[0].content as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === 'image_url')).toBe(true);
  });
  it('is text-only with no attachments', () => {
    const req = buildBridgeRequest('hello');
    const blocks = req.messages[0].content as Array<{ type: string }>;
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('AgentEngine.runOrchestrated', () => {
  const config: AgentEngineConfig = { provider: 'deepseek', apiKey: 'k', model: 'deepseek-chat' };

  it('bridges an image attachment via a vision model and surfaces the handoff', async () => {
    const events: any[] = [];
    await AgentEngine.runOrchestrated(
      'what is in this picture?',
      (e) => events.push(e),
      { config, attachments: [imgAttachment], pool: [visionModel, textModel], byokManager: mgrWith(cfg('openai'), cfg('deepseek')) }
    );

    // Handoff surfaced as a 'thought' event.
    const thought = events.find((e) => e.type === 'thought');
    expect(thought).toBeDefined();
    expect(thought.content).toMatch(/\[Orchestrator\]/);
    expect(thought.content).toMatch(/bridging/i);

    // Final answer delivered.
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    const token = events.find((e) => e.type === 'token');
    expect(token.content).toBe('final answer');

    // Bridge (vision) called once; target (deepseek) called once.
    expect((calls.openai || []).length).toBe(1);
    expect((calls.deepseek || []).length).toBe(1);
    // Target received text-only (no image block).
    const targetBlocks = calls.deepseek[0].messages[0].content;
    expect(Array.isArray(targetBlocks) ? targetBlocks.every((b: any) => b.type === 'text') : true).toBe(true);
  });

  it('does NOT bridge when the configured provider is vision-capable', async () => {
    const visionConfig: AgentEngineConfig = { provider: 'openai', apiKey: 'k', model: 'gpt-4o' };
    const events: any[] = [];
    await AgentEngine.runOrchestrated(
      'what is in this picture?',
      (e) => events.push(e),
      { config: visionConfig, attachments: [imgAttachment], pool: [visionModel, textModel], byokManager: mgrWith(cfg('openai'), cfg('deepseek')) }
    );

    expect(events.find((e) => e.type === 'thought')).toBeUndefined(); // no bridge
    expect((calls.openai || []).length).toBe(1); // target (openai) called directly
    expect((calls.deepseek || [])).toHaveLength(0);
  });
});
