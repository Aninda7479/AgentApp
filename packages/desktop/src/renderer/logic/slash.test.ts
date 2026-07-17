import { describe, it, expect, vi } from 'vitest';
import { SlashRouter } from './slash';
import { hasCapableProvider } from './capabilities';
import type { AppContext, ComposerOptions, ModelConfig, ProviderConnection } from './types';
import type { SlashDeps } from './slash';

const mkProvider = (id: string, apiKey = 'k'): ProviderConnection => ({
  id,
  name: id,
  type: 'key',
  apiKey,
  baseUrl: ''
});

const mkModel = (
  id: string,
  providerId: string,
  enabled: boolean,
  mods?: Partial<ModelConfig>
): ModelConfig => ({
  id,
  name: id,
  providerId,
  enabled,
  inputModalities: ['text'],
  outputModalities: ['text'],
  ...mods
});

/**
 * Builds a minimal AppContext sufficient for the capability-command branches:
 * the catalog + providers are plain closures, and tab/category/toast are spied
 * so we can assert the no-provider path navigates + warns instead of seeding.
 */
function makeCtx(providers: ProviderConnection[], models: ModelConfig[]) {
  const state = { activeTab: '', settingsCategory: '' };
  const toast = vi.fn();
  const ctx = {
    ipc: null,
    getConnectedProviders: () => providers,
    getModelsCatalog: () => models,
    setActiveTab: (v: string) => {
      state.activeTab = v;
    },
    setSettingsCategory: (v: string) => {
      state.settingsCategory = v;
    },
    triggerToast: toast
  } as unknown as AppContext;
  return { ctx, state, toast };
}

const mkDeps = (over: Partial<SlashDeps> = {}): SlashDeps => ({
  skills: [],
  sendPrompt: vi.fn(),
  openConfigureProject: vi.fn(),
  openDoctor: vi.fn(),
  openSearch: vi.fn(),
  openShortcuts: vi.fn(),
  openCreateProject: vi.fn(),
  seedComposer: vi.fn(),
  ...over
});

const run = (ctx: AppContext, raw: string, deps: SlashDeps) =>
  SlashRouter.dispatch(ctx, SlashRouter.parse(raw), {} as ComposerOptions, deps);

describe('hasCapableProvider', () => {
  it('is false when no model exposes the media modality', () => {
    const ctx = makeCtx([mkProvider('openai')], [mkModel('openai-gpt4', 'openai', true)]).ctx;
    expect(hasCapableProvider(ctx, 'image')).toBe(false);
    expect(hasCapableProvider(ctx, 'video')).toBe(false);
    expect(hasCapableProvider(ctx, 'audio')).toBe(false);
  });

  it('is true when an enabled model outputs the media modality', () => {
    const ctx = makeCtx(
      [mkProvider('openai')],
      [mkModel('openai-dall-e-3', 'openai', true, { outputModalities: ['image'] })]
    ).ctx;
    expect(hasCapableProvider(ctx, 'image')).toBe(true);
  });

  it('counts a keyless/local provider (ollama) with a media model as capable', () => {
    const ctx = makeCtx(
      [mkProvider('ollama', '')],
      [mkModel('ollama-sd', 'ollama', true, { outputModalities: ['image'] })]
    ).ctx;
    expect(hasCapableProvider(ctx, 'image')).toBe(true);
  });

  it('treats an enabled-only-but-unusable provider (keyed model, no key) as not capable', () => {
    const ctx = makeCtx(
      [mkProvider('openai', '')],
      [mkModel('openai-dall-e-3', 'openai', true, { outputModalities: ['image'] })]
    ).ctx;
    expect(hasCapableProvider(ctx, 'image')).toBe(false);
  });

  it('pdf needs any usable provider; 3d needs the feature flag + a provider', () => {
    const none = makeCtx([], []).ctx;
    expect(hasCapableProvider(none, 'pdf')).toBe(false);
    expect(hasCapableProvider(none, '3d', { is3dEnabled: true })).toBe(false);

    const withProv = makeCtx([mkProvider('openai')], []).ctx;
    expect(hasCapableProvider(withProv, 'pdf')).toBe(true);
    expect(hasCapableProvider(withProv, '3d', { is3dEnabled: false })).toBe(false);
    expect(hasCapableProvider(withProv, '3d', { is3dEnabled: true })).toBe(true);
  });
});

describe('SlashRouter capability commands — provider gate', () => {
  it('/image with no capable provider warns + navigates to Providers, does NOT seed', async () => {
    const { ctx, state, toast } = makeCtx([mkProvider('openai')], [mkModel('openai-gpt4', 'openai', true)]);
    const seed = vi.fn();
    const consumed = await run(ctx, '/image', mkDeps({ seedComposer: seed }));

    expect(consumed).toBe(true);
    expect(seed).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('No image-capable provider'), 'error');
    expect(state.activeTab).toBe('settings');
    expect(state.settingsCategory).toBe('providers');
  });

  it('/image with a capable provider seeds the composer with an editable prompt', async () => {
    const { ctx, state, toast } = makeCtx(
      [mkProvider('openai')],
      [mkModel('openai-dall-e-3', 'openai', true, { outputModalities: ['image'] })]
    );
    const seed = vi.fn();
    await run(ctx, '/image a cat', mkDeps({ seedComposer: seed }));

    expect(seed).toHaveBeenCalledWith('Generate an image of a cat');
    expect(toast).not.toHaveBeenCalled();
    expect(state.activeTab).toBe('');
  });

  it('/video and /audio follow the same gate', async () => {
    const { ctx } = makeCtx([mkProvider('openai')], [mkModel('openai-gpt4', 'openai', true)]);
    const seed = vi.fn();
    const toast = vi.fn();
    const ctx2 = { ...ctx, triggerToast: toast } as unknown as AppContext;

    await run(ctx2, '/video', mkDeps({ seedComposer: seed }));
    await run(ctx2, '/audio', mkDeps({ seedComposer: seed }));
    expect(toast).toHaveBeenCalledTimes(2);
    expect(seed).not.toHaveBeenCalled();
  });

  it('/pdf with no provider warns + navigates; with a provider seeds', async () => {
    const none = makeCtx([], []);
    const seedNone = vi.fn();
    const consumed = await run(none.ctx, '/pdf', mkDeps({ seedComposer: seedNone }));
    expect(consumed).toBe(true);
    expect(seedNone).not.toHaveBeenCalled();
    expect(none.toast).toHaveBeenCalledWith(expect.stringContaining('No pdf-capable provider'), 'error');
    expect(none.state.activeTab).toBe('settings');

    const ok = makeCtx([mkProvider('openai')], []);
    const seedOk = vi.fn();
    await run(ok.ctx, '/pdf report', mkDeps({ seedComposer: seedOk }));
    expect(seedOk).toHaveBeenCalledWith('Create a PDF about report');
  });

  it('/3d without the studio enabled and no provider warns + navigates to 3D settings', async () => {
    const { ctx, state, toast } = makeCtx([], []);
    const seed = vi.fn();
    await run(ctx, '/3d', mkDeps({ seedComposer: seed, is3dEnabled: false }));

    expect(seed).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('3D generation'), 'error');
    expect(state.activeTab).toBe('settings');
    expect(state.settingsCategory).toBe('3d');
  });

  it('/3d with studio enabled + provider opens the studio', async () => {
    const { ctx, state, toast } = makeCtx([mkProvider('openai')], []);
    const seed = vi.fn();
    await run(ctx, '/3d', mkDeps({ seedComposer: seed, is3dEnabled: true }));

    expect(seed).not.toHaveBeenCalled();
    expect(state.activeTab).toBe('studio');
    expect(toast).toHaveBeenCalledWith('Opened the 3D Studio — describe a model to generate');
  });
});
