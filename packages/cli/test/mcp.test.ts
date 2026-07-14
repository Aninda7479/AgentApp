import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { MCPConfigStore, registerMCPCommand, SlashCommandRouter } from '../src/index.js';

const TMP = join(process.cwd(), 'tmp', 'mcp_test_dir');

describe('MCPConfigStore (/mcp)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns empty list for a missing config', () => {
    const doc = MCPConfigStore.load(TMP);
    expect(doc.mcpServers).toEqual([]);
  });

  it('adds, lists, and removes stdio servers', () => {
    MCPConfigStore.upsert(
      { name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
      TMP
    );
    const doc = MCPConfigStore.load(TMP);
    expect(doc.mcpServers).toHaveLength(1);
    expect(doc.mcpServers[0].name).toBe('fs');
    expect(doc.mcpServers[0].enabled).toBe(true);

    const text = MCPConfigStore.formatList(doc);
    expect(text).toContain('MCP Servers');
    expect(text).toContain('@modelcontextprotocol/server-filesystem');

    expect(MCPConfigStore.remove('fs', TMP)).toBe(true);
    expect(MCPConfigStore.load(TMP).mcpServers).toHaveLength(0);
  });

  it('replaces a server with the same name', () => {
    MCPConfigStore.upsert({ name: 'dup', transport: 'stdio', command: 'v1' }, TMP);
    MCPConfigStore.upsert({ name: 'dup', transport: 'stdio', command: 'v2' }, TMP);
    const doc = MCPConfigStore.load(TMP);
    expect(doc.mcpServers).toHaveLength(1);
    expect(doc.mcpServers[0].command).toBe('v2');
  });

  it('exposes /mcp subcommands through the router', async () => {
    mkdirSync(TMP, { recursive: true });
    // Seed a server via the store (forces load from the TMP override dir).
    MCPConfigStore.upsert({ name: 'git', transport: 'stdio', command: 'mcp-git' }, TMP);

    const router = new SlashCommandRouter();
    registerMCPCommand(router, TMP);

    const list = await router.execute('/mcp list');
    expect(list.output).toContain('git');

    // sse server with a URL
    const added = await router.execute('/mcp add remote --sse -- https://example.com/mcp');
    expect(added.success).toBe(true);
    expect(added.output).toContain('sse');

    const got = await router.execute('/mcp get git');
    expect(got.success).toBe(true);
    expect(got.output).toContain('git');

    const missing = await router.execute('/mcp get nope');
    expect(missing.success).toBe(false);

    const removed = await router.execute('/mcp remove git');
    expect(removed.success).toBe(true);
    const removedRemote = await router.execute('/mcp remove remote');
    expect(removedRemote.success).toBe(true);
    const after = await router.execute('/mcp list');
    expect(after.output).toContain('No MCP servers');
  });

  it('rejects sse/http add without a valid URL', async () => {
    const router = new SlashCommandRouter();
    registerMCPCommand(router, TMP);
    const bad = await router.execute('/mcp add broken --sse -- not-a-url');
    expect(bad.success).toBe(false);
    expect(bad.error).toContain('URL');
  });
});
