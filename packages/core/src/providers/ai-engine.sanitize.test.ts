import { describe, it, expect } from 'vitest';
import { sanitizeSchemaForGemini } from './ai-engine.js';

describe('sanitizeSchemaForGemini', () => {
  it('strips additionalProperties at the top level', () => {
    const input = {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false
    };
    const out = sanitizeSchemaForGemini(input);
    expect(out).not.toHaveProperty('additionalProperties');
    expect(out.type).toBe('object');
    expect(out.required).toEqual(['path']);
    expect(out.properties.path.type).toBe('string');
  });

  it('strips unsupported keywords recursively in nested schemas', () => {
    const input = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string', additionalProperties: false }
            }
          }
        }
      },
      additionalProperties: false
    };
    const out = sanitizeSchemaForGemini(input);
    expect(out).not.toHaveProperty('additionalProperties');
    expect(out.properties.nested).not.toHaveProperty('additionalProperties');
    expect(out.properties.nested).not.toHaveProperty('$schema');
    expect(out.properties.nested.properties.items.items).not.toHaveProperty('additionalProperties');
    // Supported keywords preserved
    expect(out.properties.nested.properties.items.type).toBe('array');
    expect(out.properties.nested.properties.items.items.type).toBe('string');
  });

  it('preserves enum, description, and format', () => {
    const input = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['move', 'click'], description: 'the action' },
        when: { type: 'string', format: 'date-time' }
      },
      required: ['action'],
      additionalProperties: false,
      strict: true
    };
    const out = sanitizeSchemaForGemini(input);
    expect(out).not.toHaveProperty('strict');
    expect(out.properties.action.enum).toEqual(['move', 'click']);
    expect(out.properties.action.description).toBe('the action');
    expect(out.properties.when.format).toBe('date-time');
  });

  it('does not mutate the original schema', () => {
    const input = { type: 'object', additionalProperties: false };
    sanitizeSchemaForGemini(input);
    expect(input).toHaveProperty('additionalProperties', false);
  });

  it('handles primitives and empty schemas', () => {
    expect(sanitizeSchemaForGemini({ type: 'object', properties: {}, additionalProperties: false }))
      .toEqual({ type: 'object', properties: {} });
    expect(sanitizeSchemaForGemini(null)).toBeNull();
  });
});
