import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration test for modality bridging with NO network calls — we stub the
 * adapter factory so a vision model returns a description and a text-only target
 * returns the final answer. This exercises the real completeWithBridge two-stage
 * path (vision model first, then the augmented text-only target call) and
 * asserts the handoff is visible via onBridge and that the target never sees the
 * raw image block.
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

import { ModelRouter } from './router.js';
import { BYOKProviderManager } from './byok.js';
import type { BYOKConfig, CompletionRequest, RouterModel } from '../types/agent.js';
import type { ModalityBridgePlan } from './modality-bridge.js';

const visionModel: RouterModel = { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, supportsVision: true, supportsTools: true };
const textModel: RouterModel = { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true, supportsVision: false, supportsTools: true };

function cfg(provider: string, model = 'm', apiKey = 'k'): BYOKConfig {
  return { provider: provider as any, apiKey, model, baseUrl: '' } as BYOKConfig;
}
function mgrWith(...configs: BYOKConfig[]): BYOKProviderManager {
  const m = new BYOKProviderManager();
  for (const c of configs) m.registerKey(c);
  return m;
}
function imgRequest(): CompletionRequest {
  return {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'what is in this picture?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
      ]
    }]
  };
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(fakeAdapters)) delete fakeAdapters[k];
  fakeAdapters['openai'] = { complete: async (r: any) => { (calls.openai ||= []).push(r); return { content: 'a cat on a chair', usage: {} }; } };
  fakeAdapters['deepseek'] = { complete: async (r: any) => { (calls.deepseek ||= []).push(r); return { content: 'final answer', usage: {} }; } };
});

describe('ModelRouter.completeWithBridge', () => {
  it('bridges a non-vision target via a vision model, then answers', async () => {
    const router = new ModelRouter();
    let plan: ModalityBridgePlan | undefined;
    const res = await router.completeWithBridge(
      imgRequest(),
      mgrWith(cfg('openai'), cfg('deepseek')),
      [visionModel, textModel],
      { overrideProvider: 'deepseek', onBridge: (p) => { plan = p; } }
    );

    expect(res.content).toBe('final answer');
    expect(plan?.needsBridge).toBe(true);
    expect(plan?.bridgeType).toBe('vision');
    expect(plan?.reason).toMatch(/bridging/i);

    // Bridge (vision) called once; target (deepseek) called once.
    expect((calls.openai || []).length).toBe(1);
    expect((calls.deepseek || []).length).toBe(1);

    // Target received a text-only request with the description, no image block.
    const targetReq = calls.deepseek[0];
    const blocks = targetReq.messages[0].content;
    const isTextOnly = Array.isArray(blocks) ? blocks.every((b: any) => b.type === 'text') : true;
    expect(isTextOnly).toBe(true);
    const text = Array.isArray(blocks) ? blocks.map((b: any) => b.text).join(' ') : blocks;
    expect(text).toContain('a cat on a chair');
    expect(text).toContain('Image description');
  });

  it('does NOT bridge when the forced target is vision-capable', async () => {
    const router = new ModelRouter();
    let plan: ModalityBridgePlan | undefined;
    const res = await router.completeWithBridge(
      imgRequest(),
      mgrWith(cfg('openai'), cfg('deepseek')),
      [visionModel, textModel],
      { overrideProvider: 'openai', onBridge: (p) => { plan = p; } }
    );

    expect(res.content).toBe('a cat on a chair'); // openai is the target; returns its description directly
    expect(plan?.needsBridge).toBe(false);
    expect((calls.openai || []).length).toBe(1); // target called once
    expect((calls.deepseek || [])).toHaveLength(0); // no bridge invoked
  });
});
