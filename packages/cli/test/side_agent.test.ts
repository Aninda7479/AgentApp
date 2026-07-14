import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { SlashCommandRouter, registerSideCommand, SideChatManager, registerAgentCommand, AgentRegistry } from '../src/index.js';

const TMP = join(process.cwd(), 'tmp', 'side_agent_dir');

describe('SideChatManager (/side)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('creates, appends, and lists side chats', () => {
    const a = SideChatManager.append('scratch', 'user', 'what is 2+2?', TMP);
    expect(a.messages).toHaveLength(1);
    const b = SideChatManager.append('scratch', 'assistant', '4', TMP);
    expect(b.messages).toHaveLength(2);

    const doc = SideChatManager.load(TMP);
    expect(doc.sides).toHaveLength(1);
    expect(doc.sides[0].name).toBe('scratch');
  });

  it('removes a side chat', () => {
    SideChatManager.append('tmp', 'user', 'hi', TMP);
    expect(SideChatManager.remove('tmp', TMP)).toBe(true);
    expect(SideChatManager.load(TMP).sides).toHaveLength(0);
  });

  it('exposes /side through the router', async () => {
    const router = new SlashCommandRouter();
    registerSideCommand(router);

    const list = await router.execute('/side list');
    expect(list.output).toContain('No side chats');

    const add = await router.execute('/side idea brainstorm a name');
    expect(add.success).toBe(true);

    const view = await router.execute('/side idea');
    expect(view.output).toContain('brainstorm a name');

    const rm = await router.execute('/side remove idea');
    expect(rm.success).toBe(true);
  });
});

describe('AgentRegistry (/agent)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('seeds defaults and selects an active agent', () => {
    const doc = AgentRegistry.load(TMP);
    expect(doc.agents.length).toBeGreaterThanOrEqual(4);
    expect(doc.active).toBe('general');

    const set = AgentRegistry.setActive('coder', TMP);
    expect(set?.active).toBe('coder');
  });

  it('returns null for unknown agent', () => {
    expect(AgentRegistry.setActive('nope', TMP)).toBeNull();
  });

  it('exposes /agent through the router', async () => {
    const router = new SlashCommandRouter();
    registerAgentCommand(router);

    const list = await router.execute('/agent list');
    expect(list.output).toContain('Agents');
    expect(list.output).toContain('general');

    const set = await router.execute('/agent set reviewer');
    expect(set.success).toBe(true);
    expect(set.output).toContain('reviewer');

    const bad = await router.execute('/agent set ghost');
    expect(bad.success).toBe(false);
  });
});
