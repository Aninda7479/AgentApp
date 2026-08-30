import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalModelSettings } from './LocalModelSettings';
import { normalizeSystemInfo } from '../../logic/systemInfo';
import { rankModels } from '../../logic/ollama-catalog';
import { DEFAULT_OLLAMA_SETTINGS } from '../../logic/ollama-manager';

describe('LocalModelSettings - System Info Normalization', () => {
  it('safely normalizes empty/partial IPC system-info payload', () => {
    const normalizedFromNull = normalizeSystemInfo(null);
    expect(normalizedFromNull.gpus).toEqual([]);
    expect(normalizedFromNull.storage.length).toBeGreaterThan(0);
    expect(normalizedFromNull.ramGB).toBeGreaterThan(0);
    expect(normalizedFromNull.ollama?.installed).toBe(false);

    const normalizedFromRustPayload = normalizeSystemInfo({
      os_name: 'Windows 11',
      total_memory_mb: 16384,
      used_memory_mb: 8192,
      cpu_count: 12,
      ollama: { installed: true, running: true, version: '0.5.7' }
    });
    expect(normalizedFromRustPayload.ramGB).toBe(16);
    expect(normalizedFromRustPayload.ramFreeGB).toBe(8);
    expect(normalizedFromRustPayload.cpuCores).toBe(12);
    expect(normalizedFromRustPayload.ollama?.installed).toBe(true);
    expect(normalizedFromRustPayload.ollama?.running).toBe(true);
  });

  it('ranks models adaptively for Apple Silicon Unified Memory', () => {
    const sampleCatalog = [
      {
        name: 'llama3.2:3b',
        family: 'Llama 3.2',
        params: '3B',
        diskGB: 2.0,
        contextK: 128,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Lightweight Llama 3.2',
        tags: ['chat' as const],
      },
      {
        name: 'llama3.1:70b',
        family: 'Llama 3.1',
        params: '70B',
        diskGB: 40.0,
        contextK: 128,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Heavyweight Llama 3.1 70B',
        tags: ['chat' as const],
      },
    ];

    const macM1 = normalizeSystemInfo({
      os_name: 'macOS',
      cpu_brand: 'Apple M1 Max',
      total_memory_mb: 32768,
      used_memory_mb: 16384,
      is_unified_memory: true,
    });

    const ranked = rankModels(sampleCatalog, macM1);
    expect(ranked.length).toBe(2);
    expect(ranked[0].model.name).toBe('llama3.2:3b');
    expect(ranked[0].fit).toBe('best');
    expect(ranked[0].isHardwareRecommended).toBe(true);
    expect(ranked[1].model.name).toBe('llama3.1:70b');
    expect(ranked[1].fit).toBe('too-large');
  });

  it('ranks models adaptively for Windows Discrete GPU with VRAM', () => {
    const sampleCatalog = [
      {
        name: 'qwen2.5-coder:7b',
        family: 'Qwen 2.5 Coder',
        params: '7B',
        diskGB: 4.5,
        contextK: 32,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Code specialist',
        tags: ['code' as const],
      },
    ];

    const winGpu = normalizeSystemInfo({
      os_name: 'Windows 11',
      total_memory_mb: 32768,
      used_memory_mb: 8192,
      gpus: [{ model: 'NVIDIA GeForce RTX 4070', vramGB: 12 }],
      vram_budget_gb: 12,
    });

    const ranked = rankModels(sampleCatalog, winGpu);
    expect(ranked[0].fit).toBe('best');
    expect(ranked[0].reason).toContain('GPU');
  });

  it('provides default Ollama settings with configurable parameters', () => {
    expect(DEFAULT_OLLAMA_SETTINGS.baseUrl).toBe('http://localhost:11434');
    expect(DEFAULT_OLLAMA_SETTINGS.defaultContextLimit).toBe('8k');
    expect(DEFAULT_OLLAMA_SETTINGS.defaultTemperature).toBe(0.7);
    expect(DEFAULT_OLLAMA_SETTINGS.keepAlive).toBe('5m');
  });

  it('renders LocalModelSettings component without crashing when systemInfo is empty', () => {
    const html = renderToStaticMarkup(
      <LocalModelSettings
        connectedProviders={[]}
        modelsCatalog={[]}
        onConnectProvider={vi.fn()}
        enrichModel={vi.fn()}
        onToast={vi.fn()}
      />
    );
    expect(html).toContain('Local AI Models');
    expect(html).toContain('Ollama');
    expect(html).toContain('Explore &amp; Download Models');
  });

  it('reliably returns catalog models across multiple domains without CORS failure', async () => {
    const { fetchLiveCatalog } = await import('../../logic/ollama-catalog');
    const catalog = await fetchLiveCatalog();
    expect(catalog.length).toBeGreaterThan(15);
    const names = catalog.map((c) => c.name);
    expect(names).toContain('llama3.2:1b');
    expect(names).toContain('deepseek-r1:7b');
    expect(names).toContain('qwen2.5-coder:7b');
  });

  it('correctly associates Embedding, Vision, Tools, Thinking tags with models', async () => {
    const { fetchLiveCatalog } = await import('../../logic/ollama-catalog');
    const catalog = await fetchLiveCatalog();
    
    const embedModel = catalog.find((c) => c.name.includes('embed'));
    expect(embedModel?.tags).toContain('embedding');

    const visionModel = catalog.find((c) => c.name.includes('vision') || c.name.includes('llava'));
    expect(visionModel?.tags).toContain('vision');

    const thinkingModel = catalog.find((c) => c.name.includes('r1'));
    expect(thinkingModel?.tags).toContain('thinking');

    const toolsModel = catalog.find((c) => c.name === 'llama3.2:3b' || c.name === 'qwen2.5-coder:7b');
    expect(toolsModel?.tags).toContain('tools');
  });
});
