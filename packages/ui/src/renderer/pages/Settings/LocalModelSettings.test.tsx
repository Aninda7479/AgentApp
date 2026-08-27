import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalModelSettings } from './LocalModelSettings';
import { normalizeSystemInfo } from '../../logic/systemInfo';
import { rankModels } from '../../logic/ollama-catalog';

describe('LocalModelSettings - System Info Normalization', () => {
  it('safely normalizes empty/partial IPC system-info payload', () => {
    const normalizedFromNull = normalizeSystemInfo(null);
    expect(normalizedFromNull.gpus).toEqual([]);
    expect(normalizedFromNull.storage.length).toBeGreaterThan(0);
    expect(normalizedFromNull.ramGB).toBeGreaterThan(0);

    const normalizedFromRustPayload = normalizeSystemInfo({
      os_name: 'Windows 11',
      total_memory_mb: 16384,
      used_memory_mb: 8192,
      cpu_count: 12,
    });
    expect(normalizedFromRustPayload.ramGB).toBe(16);
    expect(normalizedFromRustPayload.ramFreeGB).toBe(8);
    expect(normalizedFromRustPayload.cpuCores).toBe(12);
    expect(normalizedFromRustPayload.gpus).toEqual([]);
  });

  it('ranks models safely without throwing on partial systemInfo', () => {
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
    ];

    const partialSysInfo = normalizeSystemInfo({
      total_memory_mb: 8192,
      used_memory_mb: 4096,
    });

    const ranked = rankModels(sampleCatalog, partialSysInfo);
    expect(ranked.length).toBe(1);
    expect(ranked[0].fit).toBeDefined();
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
    expect(html).toContain('Local Models');
    expect(html).toContain('Ollama');
  });
});
