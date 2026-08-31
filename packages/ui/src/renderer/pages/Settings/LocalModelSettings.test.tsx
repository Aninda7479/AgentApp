import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalModelSettings } from './LocalModelSettings';
import { SettingsLoadingProgressBar } from '../../components/SettingsLoadingProgressBar';
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

  it('differentiates small in-memory models (runnable) from large models (quantized VRAM overflow) and oversized models (memory overflow)', () => {
    const sampleCatalog = [
      {
        name: 'llama3.2:3b',
        family: 'Llama 3.2',
        params: '3B',
        diskGB: 2.0,
        contextK: 128,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Small 3B model',
        tags: ['chat' as const],
      },
      {
        name: 'qwen2.5-coder:7b',
        family: 'Qwen 2.5 Coder',
        params: '7B',
        diskGB: 4.7,
        contextK: 32,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Medium 7B code model',
        tags: ['code' as const],
      },
      {
        name: 'llama3.3:70b',
        family: 'Llama 3.3',
        params: '70B',
        diskGB: 42.0,
        contextK: 128,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Large 70B model',
        tags: ['chat' as const],
      },
    ];

    // Hardware setup: 4GB VRAM GPU, 16GB Total RAM (8GB free)
    const pc4GbGpu = normalizeSystemInfo({
      os_name: 'Windows 11',
      total_memory_mb: 16384,
      used_memory_mb: 8192,
      gpus: [{ model: 'NVIDIA GeForce GTX 1650', vramGB: 4 }],
      vram_budget_gb: 4,
    });

    const ranked = rankModels(sampleCatalog, pc4GbGpu);

    // 1. Small model fits in 4GB VRAM -> best / runnable
    const smallModel = ranked.find((r) => r.model.name === 'llama3.2:3b');
    expect(smallModel?.fit).toBe('best');
    expect(smallModel?.reason).toContain('GPU');

    // 2. 7B model exceeds 4GB VRAM but fits in RAM -> quantized (VRAM Overflow)
    const mediumModel = ranked.find((r) => r.model.name === 'qwen2.5-coder:7b');
    expect(mediumModel?.fit).toBe('quantized');
    expect(mediumModel?.reason).toContain('VRAM Overflow');

    // 3. 70B model exceeds 16GB total RAM -> too-large (Memory Overflow)
    const largeModel = ranked.find((r) => r.model.name === 'llama3.3:70b');
    expect(largeModel?.fit).toBe('too-large');
    expect(largeModel?.reason).toContain('Memory Overflow');
  });

  it('provides default Ollama settings with configurable parameters', () => {
    expect(DEFAULT_OLLAMA_SETTINGS.baseUrl).toBe('http://localhost:11434');
    expect(DEFAULT_OLLAMA_SETTINGS.defaultContextLimit).toBe('8k');
    expect(DEFAULT_OLLAMA_SETTINGS.defaultTemperature).toBe(0.7);
    expect(DEFAULT_OLLAMA_SETTINGS.keepAlive).toBe('5m');
  });

  it('renders LocalModelSettings loading progress bar and hides details while loading', () => {
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
    expect(html).toContain('settings-loading-progress-bar');
    expect(html).toContain('Loading Local AI Models &amp; Hardware Profile...');
    // While loading, detail sections must be hidden
    expect(html).not.toContain('Ollama is not installed on this system');
    expect(html).not.toContain('Hardware &amp; Inference Budget');
  });

  it('reliably returns catalog models across multiple domains without CORS failure', async () => {
    const { fetchLiveCatalog } = await import('../../logic/ollama-catalog');
    const catalog = await fetchLiveCatalog();
    expect(catalog.length).toBeGreaterThan(60);
    const names = catalog.map((c) => c.name);
    expect(names).toContain('llama3.2:1b');
    expect(names).toContain('deepseek-r1:7b');
    expect(names).toContain('qwen2.5-coder:7b');
    expect(names).toContain('codellama:7b');
    expect(names).toContain('mixtral:8x7b');
    expect(names).toContain('starcoder2:7b');
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

  it('correctly formats sizes in MB, GB, and TB with fmtSizeGB', async () => {
    const { fmtSizeGB } = await import('./LocalModelSettings');
    expect(fmtSizeGB(0.3)).toBe('307 MB');
    expect(fmtSizeGB(4.7)).toBe('4.7 GB');
    expect(fmtSizeGB(14.0)).toBe('14 GB');
    expect(fmtSizeGB(1331.2)).toBe('1.3 TB');
  });

  it('accurately evaluates massive TB models and prevents false 1.2GB memory ratings', () => {
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
        name: 'cogito-2.1:671b',
        family: 'Cogito 2.1',
        params: '671B',
        diskGB: 1331.2, // 1.3 TB
        contextK: 160,
        inputModalities: ['text'],
        outputModalities: ['text'],
        description: 'Ultra massive 671B model',
        tags: ['chat' as const],
      },
      {
        name: 'mistral-large-3:675b-cloud',
        family: 'Mistral Large 3',
        params: '675B',
        diskGB: 0,
        contextK: 256,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        description: 'Cloud hosted flagship endpoint',
        tags: ['chat' as const, 'tools' as const],
        isCloud: true,
      },
    ];

    const macM5 = normalizeSystemInfo({
      os_name: 'macOS',
      cpu_brand: 'Apple M5',
      total_memory_mb: 16384,
      used_memory_mb: 8192,
      is_unified_memory: true,
    });

    const ranked = rankModels(sampleCatalog, macM5);

    // 1. Local best match should be the realistic 3B model, NOT the 671B or cloud model
    expect(ranked[0].model.name).toBe('llama3.2:3b');
    expect(ranked[0].fit).toBe('best');
    expect(ranked[0].isHardwareRecommended).toBe(true);

    // 2. The 1.3 TB 671B model must be marked too-large and require > 1000 GB
    const cogito = ranked.find((r) => r.model.name === 'cogito-2.1:671b');
    expect(cogito?.fit).toBe('too-large');
    expect(cogito?.needGB).toBeGreaterThan(1300);
    expect(cogito?.reason).toContain('1.3TB');
    expect(cogito?.isHardwareRecommended).toBeFalsy();

    // 3. Cloud model must NOT be marked as local Apple Silicon hardware match
    const cloudModel = ranked.find((r) => r.model.name === 'mistral-large-3:675b-cloud');
    expect(cloudModel?.fit).toBe('runnable');
    expect(cloudModel?.needGB).toBe(0);
    expect(cloudModel?.reason).toContain('Cloud');
    expect(cloudModel?.isHardwareRecommended).toBe(false);
  });
});

describe('SettingsLoadingProgressBar Component', () => {
  it('renders loading progress bar with default title and description', () => {
    const html = renderToStaticMarkup(
      <SettingsLoadingProgressBar />
    );
    expect(html).toContain('data-testid="settings-loading-progress-bar"');
    expect(html).toContain('Loading Local AI Model Settings...');
    expect(html).toContain('animate-settings-progress');
    expect(html).toContain('Scanning hardware &amp; runtime');
  });

  it('renders refreshing state when isRefreshing is true', () => {
    const html = renderToStaticMarkup(
      <SettingsLoadingProgressBar
        isRefreshing={true}
        title="Refreshing Local AI Models..."
        iconType="text"
      />
    );
    expect(html).toContain('Refreshing Local AI Models...');
    expect(html).toContain('Refreshing...');
  });

  it('supports image model icon and custom descriptions', () => {
    const html = renderToStaticMarkup(
      <SettingsLoadingProgressBar
        title="Loading Image Engine & Hardware Budget..."
        description="Scanning stable-diffusion.cpp binaries..."
        iconType="image"
      />
    );
    expect(html).toContain('Loading Image Engine &amp; Hardware Budget...');
    expect(html).toContain('Scanning stable-diffusion.cpp binaries...');
  });
});
