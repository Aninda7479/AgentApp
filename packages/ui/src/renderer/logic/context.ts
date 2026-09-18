import type { TrajectoryStep, StoredChat } from './types';

/** A context-window usage snapshot shown by the workspace gauge. */
export interface ContextUsage {
  /** Estimated tokens currently used. */
  used: number;
  /** Context-window size of the effective model (tokens). */
  limit: number;
  /** used / limit as a percentage (0..100). */
  pct: number;
}

export interface SubagentExecutionItem {
  id: string;
  name: string;
  personaId: string;
  prompt: string;
  status: 'running' | 'success' | 'error' | 'idle';
  startedAt?: string | number;
  duration?: string;
  output?: string;
  error?: string;
  tokens: { prompt: number; completion: number; total: number };
  cost: number;
  stepId: string;
}

export interface ChatAttachmentItem {
  id: string;
  name: string;
  path: string;
  mediaType: 'image' | 'pdf' | 'ppt' | 'audio' | 'video' | 'code' | 'file';
  size?: number;
  formattedSize?: string;
  source: 'user' | 'tool' | 'generated';
  stepId?: string;
  timestamp?: string;
}

export interface ChatModelInfo {
  distinctModels: string[];
  isAdaptive: boolean;
  displayLabel: string;
}

export interface ChatContextStats {
  usedTokens: number;
  limitTokens: number;
  pct: number;
  formattedTokens: string;
  formattedLimit: string;
  breakdown: {
    user: number;
    assistant: number;
    tools: number;
    system: number;
    subagents: number;
  };
  totalCost: number;
  mainChatCost: number;
  subagentsCost: number;
  isFreeModel: boolean;
  pricingRates: { inputPrice: number; outputPrice: number };
  totalSizeBytes: number;
  formattedSize: string;
  transcriptBytes: number;
  attachmentsBytes: number;
  models: ChatModelInfo;
  subagents: SubagentExecutionItem[];
  attachments: ChatAttachmentItem[];
}

/**
 * Parses a human context-window limit (e.g. `"128k"`, `"2M"`, `"1.5m"`,
 * `"200000"`) into a numeric token count. Returns `undefined` for unparseable
 * input. Kept self-contained so the renderer bundle doesn't pull in core.
 */
export function parseContextLimit(str?: string | null): number | undefined {
  if (!str) return undefined;
  const s = String(str).trim().toLowerCase().replace(/,/g, '');
  const withUnit = s.match(/^([\d.]+)\s*([km])?b?$/);
  if (withUnit) {
    let n = parseFloat(withUnit[1]);
    if (withUnit[2] === 'k') n *= 1_000;
    else if (withUnit[2] === 'm') n *= 1_000_000;
    return Math.round(n);
  }
  const plain = s.match(/^([\d.]+)$/);
  if (plain) return Math.round(parseFloat(plain[1]));
  return undefined;
}

/** Format number of tokens into human-friendly representation (e.g. 1.2k, 128k, 2M) */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
  }
  return tokens.toLocaleString();
}

/** Rough token estimate (~4 chars/token) for a single block of text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Estimates the token cost of the visible trajectory steps (demo-mode proxy). */
export function estimateTrajectoryTokens(steps: TrajectoryStep[]): number {
  let total = 0;
  for (const s of steps || []) {
    total += estimateTokens(s?.content ?? '');
  }
  return total;
}

/** Format byte sizes into B, KB, MB */
export function formatByteSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Returns model input & output pricing rates per 1,000,000 tokens (USD).
 * Mirrors superagent-core-v2 usage.rs catalog.
 */
export function getModelPricingRates(provider?: string, model?: string): { inputPrice: number; outputPrice: number } {
  const cleanModel = (model || '').toLowerCase();
  const cleanProvider = (provider || '').toLowerCase();

  if (
    cleanProvider === 'ollama' ||
    cleanProvider === 'omniroute' ||
    cleanProvider === 'local' ||
    cleanModel.includes('local') ||
    cleanModel.includes('ollama')
  ) {
    return { inputPrice: 0.0, outputPrice: 0.0 };
  }

  // Gemini models
  if (cleanModel.includes('gemini-3.5-flash-lite') || cleanModel.includes('flash-lite')) {
    return { inputPrice: 0.05, outputPrice: 0.2 };
  }
  if (cleanModel.includes('gemini-2.5-pro') || cleanModel.includes('gemini-1.5-pro')) {
    return { inputPrice: 1.25, outputPrice: 5.0 };
  }
  if (
    cleanModel.includes('gemini-2.5-flash') ||
    cleanModel.includes('gemini-2.0-flash') ||
    cleanModel.includes('gemini-1.5-flash') ||
    cleanModel.includes('flash')
  ) {
    return { inputPrice: 0.075, outputPrice: 0.3 };
  }
  if (cleanModel.includes('gemini')) {
    return { inputPrice: 1.25, outputPrice: 5.0 };
  }

  // OpenAI models
  if (cleanModel.includes('gpt-4o-mini')) {
    return { inputPrice: 0.15, outputPrice: 0.6 };
  }
  if (cleanModel.includes('gpt-4o') || cleanModel.includes('chatgpt-4o')) {
    return { inputPrice: 2.5, outputPrice: 10.0 };
  }
  if (cleanModel.includes('o3-mini')) {
    return { inputPrice: 1.1, outputPrice: 4.4 };
  }
  if (cleanModel.includes('o1')) {
    return { inputPrice: 15.0, outputPrice: 60.0 };
  }

  // Anthropic models
  if (cleanModel.includes('claude-3-7-sonnet') || cleanModel.includes('claude-3-5-sonnet') || cleanModel.includes('sonnet')) {
    return { inputPrice: 3.0, outputPrice: 15.0 };
  }
  if (cleanModel.includes('claude-3-5-haiku') || cleanModel.includes('haiku')) {
    return { inputPrice: 0.8, outputPrice: 4.0 };
  }
  if (cleanModel.includes('claude-3-opus') || cleanModel.includes('opus')) {
    return { inputPrice: 15.0, outputPrice: 75.0 };
  }

  // DeepSeek models
  if (cleanModel.includes('deepseek-reasoner') || cleanModel.includes('r1')) {
    return { inputPrice: 0.55, outputPrice: 2.19 };
  }
  if (cleanModel.includes('deepseek-chat') || cleanModel.includes('deepseek')) {
    return { inputPrice: 0.14, outputPrice: 0.28 };
  }

  // Groq models
  if (cleanProvider.includes('groq')) {
    return { inputPrice: 0.59, outputPrice: 0.79 };
  }

  // Default fallback rate (typical standard tier)
  return { inputPrice: 0.15, outputPrice: 0.6 };
}

/**
 * Extracts sub-agents executed or running in THIS specific chat.
 * Inspects tool calls (run_subagent, invoke_subagent, delegate_task) and subagent events.
 */
export function extractChatSubagents(steps: TrajectoryStep[]): SubagentExecutionItem[] {
  const subagents: SubagentExecutionItem[] = [];
  const seenIds = new Set<string>();

  for (const step of steps || []) {
    const isSubagentTool =
      step.type === 'tool_call' &&
      (step.toolName === 'run_subagent' ||
        step.toolName === 'invoke_subagent' ||
        step.toolName === 'delegate_task' ||
        (step.toolName && step.toolName.toLowerCase().includes('subagent')));

    const isSubagentEvent = step.type === 'subagent_start' || step.type === 'subagent_finish';

    if (isSubagentTool || isSubagentEvent) {
      const meta = (step.metadata || {}) as Record<string, unknown>;
      const args = (meta.toolArgs || {}) as Record<string, unknown>;

      const personaId =
        (typeof args.persona_id === 'string' && args.persona_id) ||
        (typeof args.personaId === 'string' && args.personaId) ||
        (typeof args.persona === 'string' && args.persona) ||
        (typeof meta.personaId === 'string' && meta.personaId) ||
        (typeof meta.persona_id === 'string' && meta.persona_id) ||
        'subagent';

      const prompt =
        args.prompt ||
        args.task ||
        args.instruction ||
        args.query ||
        meta.prompt ||
        (step.type === 'subagent_start' ? step.content : '');

      const output =
        meta.result ||
        meta.toolResult ||
        (step.type === 'subagent_finish' ? step.content : '') ||
        '';

      const status: 'running' | 'success' | 'error' | 'idle' =
        step.status === 'error' || meta.isError
          ? 'error'
          : step.status === 'running' || !output
          ? 'running'
          : 'success';

      const duration = meta.durationMs
        ? `${(meta.durationMs / 1000).toFixed(1)}s`
        : meta.workedDuration || (status === 'running' ? 'Active' : undefined);

      const promptTokens = estimateTokens(prompt);
      const completionTokens = estimateTokens(output);
      const totalTokens = promptTokens + completionTokens;

      const rates = getModelPricingRates(undefined, step.model || meta.model);
      const cost = (promptTokens * rates.inputPrice + completionTokens * rates.outputPrice) / 1_000_000;

      const id = step.id || `subagent-${subagents.length}`;

      if (!seenIds.has(id)) {
        seenIds.add(id);
        subagents.push({
          id,
          name: personaId.startsWith('@') ? personaId : `@${personaId}`,
          personaId,
          prompt: prompt || 'Task delegated by parent orchestrator',
          status,
          startedAt: step.timestamp,
          duration,
          output: output || (status === 'running' ? 'Execution in progress...' : 'Execution completed.'),
          error: status === 'error' ? meta.result || 'Subagent execution encountered an error.' : undefined,
          tokens: {
            prompt: promptTokens,
            completion: completionTokens,
            total: totalTokens,
          },
          cost,
          stepId: step.id,
        });
      }
    }
  }

  return subagents;
}

/**
 * Extracts all files, images, videos, and media attached or referenced in this chat.
 */
export function extractChatAttachments(steps: TrajectoryStep[], chat?: StoredChat): ChatAttachmentItem[] {
  const items: ChatAttachmentItem[] = [];
  const seenPaths = new Set<string>();

  const getMediaType = (filenameOrPath: string): 'image' | 'pdf' | 'ppt' | 'audio' | 'video' | 'code' | 'file' => {
    const lower = (filenameOrPath || '').toLowerCase();
    if (lower.match(/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i)) return 'image';
    if (lower.match(/\.(mp4|webm|mov|mkv|avi)$/i)) return 'video';
    if (lower.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) return 'audio';
    if (lower.match(/\.pdf$/i)) return 'pdf';
    if (lower.match(/\.(ppt|pptx)$/i)) return 'ppt';
    if (lower.match(/\.(tsx?|jsx?|rs|py|go|c|cpp|json|html|css|scss|md|ya?ml|toml|sql|sh|ps1)$/i)) return 'code';
    return 'file';
  };

  const getBasename = (p: string) => {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || p;
  };

  for (const step of steps || []) {
    const meta = (step.metadata || {}) as Record<string, unknown>;

    // 1. Direct attachments array in step metadata
    if (Array.isArray(meta.attachments)) {
      for (const att of meta.attachments) {
        if (typeof att === 'object' && att !== null) {
          const item = att as { path?: string; url?: string; name?: string; mediaType?: ChatAttachmentItem['mediaType']; size?: number };
          const path = item.path || item.url || item.name;
          if (path && !seenPaths.has(path)) {
            seenPaths.add(path);
            items.push({
              id: `att-${items.length}`,
              name: item.name || getBasename(path),
              path,
              mediaType: item.mediaType || getMediaType(path),
              size: item.size,
              formattedSize: item.size ? formatByteSize(item.size) : undefined,
              source: step.type === 'user' ? 'user' : 'tool',
              stepId: step.id,
              timestamp: step.timestamp,
            });
          }
        }
      }
    }

    // 2. Direct mediaPath in step metadata (e.g. from generated image/video)
    const mediaPath = typeof meta.mediaPath === 'string' ? meta.mediaPath : undefined;
    if (mediaPath && !seenPaths.has(mediaPath)) {
      seenPaths.add(mediaPath);
      items.push({
        id: `att-${items.length}`,
        name: getBasename(mediaPath),
        path: mediaPath,
        mediaType: (typeof meta.mediaType === 'string' ? (meta.mediaType as ChatAttachmentItem['mediaType']) : undefined) || getMediaType(mediaPath),
        source: 'generated',
        stepId: step.id,
        timestamp: step.timestamp,
      });
    }

    // 3. Diff modified file
    const diff = typeof meta.diff === 'object' && meta.diff !== null ? (meta.diff as { filename?: string }) : undefined;
    if (diff?.filename && !seenPaths.has(diff.filename)) {
      seenPaths.add(diff.filename);
      items.push({
        id: `att-${items.length}`,
        name: getBasename(diff.filename),
        path: diff.filename,
        mediaType: getMediaType(diff.filename),
        source: 'tool',
        stepId: step.id,
        timestamp: step.timestamp,
      });
    }

    // 4. Tool call target files
    const args = meta.toolArgs as Record<string, unknown> | undefined;
    if (args && typeof args === 'object') {
      const candidatePath =
        (typeof args.TargetFile === 'string' && args.TargetFile) ||
        (typeof args.path === 'string' && args.path) ||
        (typeof args.ImagePath === 'string' && args.ImagePath) ||
        (typeof args.file_path === 'string' && args.file_path) ||
        (typeof args.filename === 'string' && args.filename) ||
        undefined;
      if (candidatePath && !seenPaths.has(candidatePath)) {
        seenPaths.add(candidatePath);
        items.push({
          id: `att-${items.length}`,
          name: getBasename(candidatePath),
          path: candidatePath,
          mediaType: getMediaType(candidatePath),
          source: 'tool',
          stepId: step.id,
          timestamp: step.timestamp,
        });
      }
    }
  }

  // 5. Chat-level attachments if configured
  if (chat?.standaloneConfig?.attachments) {
    for (const att of chat.standaloneConfig.attachments) {
      const path =
        typeof att === 'string'
          ? att
          : typeof att === 'object' && att !== null
          ? ((att as { path?: string; name?: string }).path || (att as { path?: string; name?: string }).name)
          : undefined;
      if (path && !seenPaths.has(path)) {
        seenPaths.add(path);
        items.push({
          id: `att-${items.length}`,
          name: getBasename(path),
          path,
          mediaType: getMediaType(path),
          source: 'user',
        });
      }
    }
  }

  return items;
}

/**
 * Extracts models used across chat trajectory steps.
 * When multiple models or mid-conversation switches occur, provides an adaptive label.
 */
export function extractChatModels(steps?: TrajectoryStep[], chat?: StoredChat): ChatModelInfo {
  const modelsSet = new Set<string>();

  for (const step of steps || []) {
    if (step.model && typeof step.model === 'string' && step.model.trim()) {
      modelsSet.add(step.model.trim());
    }
    const meta = step.metadata as Record<string, unknown> | undefined;
    if (meta && typeof meta.model === 'string' && meta.model.trim()) {
      modelsSet.add(meta.model.trim());
    }
  }

  if (chat?.model && typeof chat.model === 'string' && chat.model.trim()) {
    modelsSet.add(chat.model.trim());
  }

  const distinctModels = Array.from(modelsSet).filter(Boolean);
  const isAdaptive = distinctModels.length !== 1;

  let displayLabel = 'Adaptive';
  if (distinctModels.length === 1) {
    displayLabel = `Adaptive · ${distinctModels[0]}`;
  } else if (distinctModels.length > 1) {
    displayLabel = `Adaptive (${distinctModels.length} models)`;
  }

  return {
    distinctModels,
    isAdaptive,
    displayLabel,
  };
}

/**
 * Computes comprehensive context, token, pricing, size, subagent, and attachment stats for a chat.
 */
export function computeChatContextStats(
  steps: TrajectoryStep[],
  model?: string,
  provider?: string,
  contextLimitOverride?: string | number | null,
  chat?: StoredChat
): ChatContextStats {
  const subagents = extractChatSubagents(steps);
  const attachments = extractChatAttachments(steps, chat);
  const models = extractChatModels(steps, chat);

  if (!steps || steps.length === 0) {
    const rates = getModelPricingRates(provider, model);
    const limit =
      typeof contextLimitOverride === 'number'
        ? contextLimitOverride
        : parseContextLimit(contextLimitOverride) || 128_000;

    return {
      usedTokens: 0,
      limitTokens: limit,
      pct: 0,
      formattedTokens: '0',
      formattedLimit: formatTokenCount(limit),
      breakdown: { user: 0, assistant: 0, tools: 0, system: 0, subagents: 0 },
      totalCost: 0,
      mainChatCost: 0,
      subagentsCost: 0,
      isFreeModel: rates.inputPrice === 0 && rates.outputPrice === 0,
      pricingRates: rates,
      totalSizeBytes: 0,
      formattedSize: '0 B',
      transcriptBytes: 0,
      attachmentsBytes: 0,
      models,
      subagents,
      attachments,
    };
  }

  // Base overhead for system prompt instructions and registered tool schemas
  const systemTokens = 1500;
  let userTokens = 0;
  let assistantTokens = 0;
  let toolsTokens = 0;
  let transcriptBytes = 0;

  for (const step of steps) {
    const textLen = step.content ? step.content.length : 0;
    transcriptBytes += textLen;

    const metaStr = step.metadata ? JSON.stringify(step.metadata) : '';
    transcriptBytes += metaStr.length;

    const est = estimateTokens(step.content || '');

    if (step.type === 'user') {
      userTokens += est;
    } else if (step.type === 'assistant' || step.type === 'thought') {
      assistantTokens += est;
    } else if (step.type === 'tool_call' || step.type === 'tool_result') {
      toolsTokens += est;
      if (step.metadata?.result && typeof step.metadata.result === 'string') {
        toolsTokens += estimateTokens(step.metadata.result);
      }
    }
  }

  let subagentsTokens = 0;
  let subagentsCost = 0;
  for (const sub of subagents) {
    subagentsTokens += sub.tokens.total;
    subagentsCost += sub.cost;
  }

  const usedTokens = systemTokens + userTokens + assistantTokens + toolsTokens + subagentsTokens;

  // Resolve context limit
  const limit =
    typeof contextLimitOverride === 'number'
      ? contextLimitOverride
      : parseContextLimit(contextLimitOverride) || parseContextLimit(model) || 128_000;

  // Compute accurate percentage
  const rawPct = (usedTokens / limit) * 100;
  const pct = Number(rawPct.toFixed(1));

  // Pricing
  const rates = getModelPricingRates(provider, model);
  const promptTokensTotal = systemTokens + userTokens + toolsTokens;
  const completionTokensTotal = assistantTokens;
  const mainChatCost =
    (promptTokensTotal * rates.inputPrice + completionTokensTotal * rates.outputPrice) / 1_000_000;
  const totalCost = mainChatCost + subagentsCost;
  const isFreeModel = rates.inputPrice === 0 && rates.outputPrice === 0;

  // Size
  let attachmentsBytes = 0;
  for (const att of attachments) {
    if (att.size) attachmentsBytes += att.size;
  }
  const totalSizeBytes = transcriptBytes + attachmentsBytes;

  return {
    usedTokens,
    limitTokens: limit,
    pct,
    formattedTokens: usedTokens.toLocaleString(),
    formattedLimit: formatTokenCount(limit),
    breakdown: {
      user: userTokens,
      assistant: assistantTokens,
      tools: toolsTokens,
      system: systemTokens,
      subagents: subagentsTokens,
    },
    totalCost,
    mainChatCost,
    subagentsCost,
    isFreeModel,
    pricingRates: rates,
    totalSizeBytes,
    formattedSize: formatByteSize(totalSizeBytes),
    transcriptBytes,
    attachmentsBytes,
    models,
    subagents,
    attachments,
  };
}

/**
 * Computes a context-usage estimate from the visible steps against the active
 * model's context window. Preserved for backward compatibility.
 */
export function computeContextUsage(
  steps: TrajectoryStep[],
  contextLimit?: string | number | null
): ContextUsage | null {
  const limit =
    typeof contextLimit === 'number'
      ? contextLimit
      : parseContextLimit(contextLimit ?? null);
  if (!limit || limit <= 0) return null;
  const used = estimateTrajectoryTokens(steps);
  const pct = Number(((used / limit) * 100).toFixed(2));
  return { used, limit, pct };
}
