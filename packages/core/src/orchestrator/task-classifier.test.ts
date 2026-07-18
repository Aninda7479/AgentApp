import { describe, it, expect } from 'vitest';
import { classifyTask, buildRequest } from './task-classifier.js';
import type { CompletionRequest } from '../types/agent.js';

function req(text: string, attachments?: string[]): CompletionRequest {
  return buildRequest(text, attachments);
}

describe('classifyTask — domain flags', () => {
  it('flags a coding prompt as coding, not creative', () => {
    const c = classifyTask(req('write a function to parse json'));
    expect(c.isCoding).toBe(true);
    expect(c.isCreative).toBe(false);
    expect(c.isVision).toBe(false);
  });

  it('does NOT flag "write a poem" as coding (regression: creative vs code)', () => {
    const c = classifyTask(req('write a poem about the sea'));
    expect(c.isCreative).toBe(true);
    expect(c.isCoding).toBe(false);
    expect(c.isReasoning).toBe(false);
  });

  it('flags a reasoning prompt', () => {
    const c = classifyTask(req('analyze the logic and prove this theorem step by step'));
    expect(c.isReasoning).toBe(true);
  });

  it('flags a vision prompt from text cues', () => {
    const c = classifyTask(req('describe this image and screenshot'));
    expect(c.isVision).toBe(true);
  });

  it('flags BOTH coding and vision for a mixed "write code to draw a diagram" task', () => {
    // This combination is what makes selectCandidateModels require a model that
    // is BOTH vision- and tool-capable (only gemini-3 in the shared test pool).
    const c = classifyTask(req('write code to draw a diagram'));
    expect(c.isCoding).toBe(true);
    expect(c.isVision).toBe(true);
  });

  it('flags an audio task from text', () => {
    const c = classifyTask(req('transcribe this audio recording'));
    expect(c.isAudio).toBe(true);
  });

  it('flags a 3D task from text', () => {
    const c = classifyTask(req('render a 3d model and export the stl'));
    expect(c.is3D).toBe(true);
  });
});

describe('classifyTask — modality awareness', () => {
  it('detects an image attachment as a required modality even with no vision keywords', () => {
    const r: CompletionRequest = {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'what is in this picture?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
        ]
      }]
    };
    const c = classifyTask(r);
    expect(c.requiredModalities).toContain('image');
    expect(c.isVision).toBe(true);
  });

  it('does not invent a required modality for a pure-text prompt', () => {
    const c = classifyTask(req('summarize this article'));
    expect(c.requiredModalities).not.toContain('image');
    expect(c.requiredModalities).not.toContain('audio');
  });
});

describe('classifyTask — difficulty + goal hint', () => {
  it('estimates a high-difficulty task', () => {
    const c = classifyTask(req('Design a complex, scalable, production-ready distributed system architecture with multiple services.'));
    expect(c.difficulty).toBe('high');
  });

  it('estimates a low-difficulty task', () => {
    const c = classifyTask(req('hi'));
    expect(c.difficulty).toBe('low');
  });

  it('surfaces a latency preference', () => {
    const c = classifyTask(req('give me a quick short answer'));
    expect(c.goalHint).toBe('latency');
  });

  it('surfaces a quality preference', () => {
    const c = classifyTask(req('please be thorough and detailed in your expert analysis'));
    expect(c.goalHint).toBe('quality');
  });

  it('surfaces a cost preference', () => {
    const c = classifyTask(req('use the cheapest small model option'));
    expect(c.goalHint).toBe('cost');
  });
});

describe('buildRequest', () => {
  it('maps attachments to image_url content blocks', () => {
    const r = buildRequest('look at this', ['data:image/png;base64,AAAA']);
    const content = r.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content.some((b) => b.type === 'image_url')).toBe(true);
      expect(content.some((b) => b.type === 'text' && b.text === 'look at this')).toBe(true);
    }
  });

  it('keeps a plain prompt as a string content', () => {
    const r = buildRequest('hello');
    expect(r.messages[0].content).toBe('hello');
  });
});
