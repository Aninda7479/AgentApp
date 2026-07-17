import { describe, it, expect } from 'vitest';
import {
  detectInputModalities,
  planModalityBridge,
  augmentRequestForBridge,
  withBridgeInstruction,
  bridgeInstruction,
  modelSupportsInput
} from './modality-bridge.js';
import type { RouterModel } from './router.js';
import type { CompletionRequest } from '../types/agent.js';

const visionModel: RouterModel = { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, supportsVision: true, supportsTools: true };
const textModel: RouterModel = { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true, supportsVision: false, supportsTools: true };

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
function textRequest(): CompletionRequest {
  return { messages: [{ role: 'user', content: 'write a function' }] };
}

describe('detectInputModalities', () => {
  it('detects image from image_url blocks', () => {
    expect(detectInputModalities(imgRequest())).toEqual(['image']);
  });
  it('returns [] for text-only requests', () => {
    expect(detectInputModalities(textRequest())).toEqual([]);
  });
  it('merges explicit modalities (e.g. audio seen by the engine)', () => {
    expect(detectInputModalities(textRequest(), ['audio'])).toEqual(['audio']);
  });
});

describe('modelSupportsInput', () => {
  it('maps image to supportsVision', () => {
    expect(modelSupportsInput(visionModel, 'image')).toBe(true);
    expect(modelSupportsInput(textModel, 'image')).toBe(false);
  });
});

describe('planModalityBridge', () => {
  it('no bridge when the target already supports the modality', () => {
    const plan = planModalityBridge({ requiredModalities: ['image'], targetModel: visionModel, pool: [visionModel, textModel] });
    expect(plan.needsBridge).toBe(false);
    expect(plan.bridgeModel).toBeUndefined();
  });
  it('bridges to a vision model when the target lacks vision but the pool has one', () => {
    const plan = planModalityBridge({ requiredModalities: ['image'], targetModel: textModel, pool: [visionModel, textModel] });
    expect(plan.needsBridge).toBe(true);
    expect(plan.bridgeType).toBe('vision');
    expect(plan.bridgeModel?.id).toBe('gpt-4o');
    expect(plan.reason).toMatch(/bridging/i);
  });
  it('no bridge when no capable bridge model exists in the pool', () => {
    const plan = planModalityBridge({ requiredModalities: ['image'], targetModel: textModel, pool: [textModel] });
    expect(plan.needsBridge).toBe(false);
    expect(plan.reason).toMatch(/no available bridge model/i);
  });
  it('skips an unavailable (rate_limited) bridge model', () => {
    const downVision: RouterModel = { ...visionModel, accessStatus: 'rate_limited' };
    const plan = planModalityBridge({ requiredModalities: ['image'], targetModel: textModel, pool: [downVision, textModel] });
    expect(plan.needsBridge).toBe(false);
  });
});

describe('withBridgeInstruction / augmentRequestForBridge', () => {
  it('withBridgeInstruction keeps the image block and prepends the instruction', () => {
    const out = withBridgeInstruction(imgRequest(), 'Describe this image.');
    const blocks = out.messages[0].content as Array<{ type: string; text?: string }>;
    expect(blocks.some((b) => b.type === 'image_url')).toBe(true);
    const textBlock = blocks.find((b) => b.type === 'text');
    expect(textBlock?.text?.startsWith('Describe this image.')).toBe(true);
  });
  it('augmentRequestForBridge strips images and prepends the transcription', () => {
    const out = augmentRequestForBridge(imgRequest(), 'a cat on a chair', 'Image description');
    const blocks = out.messages[0].content as Array<{ type: string; text?: string }>;
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
    expect(blocks[0].text).toContain('a cat on a chair');
    expect(blocks[0].text).toContain('Image description');
  });
});

describe('bridgeInstruction', () => {
  it('returns a vision and a transcription prompt', () => {
    expect(bridgeInstruction('vision')).toMatch(/describe this image/i);
    expect(bridgeInstruction('transcription')).toMatch(/transcribe/i);
  });
});
