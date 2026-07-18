import { AgentMessage } from '../types/agent.js';
import { TrajectoryTokenCounter } from './tokens.js';

/**
 * Flattens message content of any shape to a plain string.
 *
 * The desktop agent engine stores `content` as `string | RichContentPart[]`
 * (text + base64 images), while core trajectories use `string`. This helper
 * normalizes both so the chunked compactor can summarize uniformly. Images are
 * represented as a single `[image]` placeholder so they don't dominate the
 * token estimate or the summary.
 */
export function extractTextContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text ?? '';
        if (part.type === 'image_url') return '[image]';
        if (part.type === 'image') return '[image]';
        if (typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  if (typeof content === 'object' && 'text' in (content as any)) {
    return String((content as any).text ?? '');
  }
  return String(content);
}

/** Minimal message shape the chunked compactor operates on. */
export interface CompactMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/** Options controlling chunked compaction behavior. */
export interface ChunkedCompactOptions {
  /** Recent messages (from the end) preserved verbatim. Default: 4. */
  keepRecentCount?: number;
  /** Messages per summary chunk. Smaller = more granular, bounded summaries. Default: 6. */
  maxChunkMessages?: number;
  /** Max chars kept per message inside a summary. Default: 240. */
  maxSnippetChars?: number;
  /** Hard cap on how many summary parts are retained (bounds the summary for
   *  pathologically large inputs). Default: 40. */
  maxParts?: number;
}

/** Result of a chunked compaction. */
export interface ChunkedCompactResult {
  messages: CompactMessage[];
  tokensBefore: number;
  tokensAfter: number;
  wasCompacted: boolean;
  summary: string;
}

const estTokens = (s: string): number => (s.length === 0 ? 0 : Math.max(1, Math.ceil(s.length / 4)));

/**
 * Parses a human context-window limit (e.g. `"128k"`, `"2M"`, `"1.5m"`,
 * `"200000"`) into a numeric token count. Returns `undefined` for unparseable
 * input. Shared by the desktop main process and renderer so both agree on the
 * effective context window of the orchestrator-selected model.
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

function snippet(text: string, maxChars: number): string {
  const t = text.trim();
  return t.length > maxChars ? t.slice(0, maxChars - 3) + '...' : t;
}

/**
 * Builds a bounded, chunked summary of the "older" (to-be-compacted) messages.
 *
 * The middle of a conversation is split into chunks of `maxChunkMessages`; each
 * chunk is summarized independently into role-prefixed, truncated lines and
 * joined with `--- Part k/N ---` separators. Because every chunk is small and
 * every message is truncated, the resulting summary stays bounded no matter how
 * bloated the input — so compaction never fails on an over-large context.
 */
export function summarizeOlder(older: CompactMessage[], opts: ChunkedCompactOptions = {}): string {
  const maxChunk = opts.maxChunkMessages ?? 6;
  const maxSnippet = opts.maxSnippetChars ?? 240;
  const maxParts = opts.maxParts ?? 40;

  if (older.length === 0) return '';

  const chunks: CompactMessage[][] = [];
  for (let i = 0; i < older.length; i += maxChunk) {
    chunks.push(older.slice(i, i + maxChunk));
  }

  const total = chunks.length;
  const kept = chunks.slice(0, maxParts);

  const parts = kept.map((chunk, idx) => {
    const header = total > 1 ? `--- Part ${idx + 1}/${total} ---\n` : '';
    const lines = chunk.map((m) => `[${m.role.toUpperCase()}]: ${snippet(extractTextContent(m.content), maxSnippet)}`);
    return header + lines.join('\n');
  });

  let summary =
    '[COMPACTED CONTEXT SUMMARY]\n' +
    'The following historical turns were compacted into a condensed form to stay within the context window:\n\n' +
    parts.join('\n\n');

  if (total > maxParts) {
    summary += `\n\n... (${total - maxParts} additional part(s) omitted after compaction to keep the summary bounded)`;
  }
  return summary;
}

/**
 * Chunked, robust compaction of a full message list. Splits the conversation
 * middle into bounded chunks, summarizes each, and replaces the middle with a
 * single summary message (preserving leading system + recent messages). Returns
 * the compacted list plus a token delta estimate.
 */
export function chunkedCompactMessages(
  messages: CompactMessage[],
  opts: ChunkedCompactOptions = {}
): ChunkedCompactResult {
  const keep = opts.keepRecentCount ?? 4;

  const tokensBefore = messages.reduce((acc, m) => acc + estTokens(extractTextContent(m.content)), 0);

  if (messages.length <= keep + 1) {
    return { messages: [...messages], tokensBefore, tokensAfter: tokensBefore, wasCompacted: false, summary: '' };
  }

  // Preserve leading system message(s).
  const systemMessages: CompactMessage[] = [];
  let i = 0;
  while (i < messages.length && messages[i].role === 'system') {
    systemMessages.push(messages[i]);
    i++;
  }

  const conversation = messages.slice(i);
  if (conversation.length <= keep) {
    return { messages: [...messages], tokensBefore, tokensAfter: tokensBefore, wasCompacted: false, summary: '' };
  }

  const older = conversation.slice(0, conversation.length - keep);
  const recent = conversation.slice(conversation.length - keep);

  const summary = summarizeOlder(older, opts);
  const summaryMessage: CompactMessage = { role: 'system', content: summary };

  const compactedMessages = [...systemMessages, summaryMessage, ...recent];
  const tokensAfter = compactedMessages.reduce((acc, m) => acc + estTokens(extractTextContent(m.content)), 0);

  return { messages: compactedMessages, tokensBefore, tokensAfter, wasCompacted: true, summary };
}

// ─── Legacy trajectory compaction (kept for API compatibility) ────────────────

/** Options controlling trajectory compaction behavior. */
export interface CompactionOptions {
  maxContextTokens: number;
  triggerThresholdPercentage?: number; // Default: 80 (%)
  preserveRecentMessagesCount?: number; // Default: 4
}

/** Result of a compaction operation. */
export interface CompactionResult {
  compactedMessages: AgentMessage[];
  wasCompacted: boolean;
  tokensBefore: number;
  tokensAfter: number;
  summaryCreated?: string;
}

/** Compacts agent trajectories by summarizing older turns to fit within context window limits. */
export class TrajectoryCompactor {
  private tokenCounter = new TrajectoryTokenCounter();
  constructor() {}

  public async compactTrajectory(
    messages: AgentMessage[],
    options: CompactionOptions
  ): Promise<CompactionResult> {
    const thresholdPct = options.triggerThresholdPercentage ?? 80;
    const preserveCount = options.preserveRecentMessagesCount ?? 4;
    const limit = options.maxContextTokens;

    const report = this.tokenCounter.calculateTrajectoryUsage(messages, [], '', limit);
    const tokensBefore = report.totalTokens;

    const triggerLimit = (limit * thresholdPct) / 100;
    if (tokensBefore <= triggerLimit || messages.length <= preserveCount + 1) {
      return {
        compactedMessages: [...messages],
        wasCompacted: false,
        tokensBefore,
        tokensAfter: tokensBefore
      };
    }

    // Separate initial system message(s) and older vs recent messages
    const systemMessages: AgentMessage[] = [];
    const conversationMessages: AgentMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system' && conversationMessages.length === 0) {
        systemMessages.push(msg);
      } else {
        conversationMessages.push(msg);
      }
    }

    if (conversationMessages.length <= preserveCount) {
      return {
        compactedMessages: [...messages],
        wasCompacted: false,
        tokensBefore,
        tokensAfter: tokensBefore
      };
    }

    const olderMessages = conversationMessages.slice(0, conversationMessages.length - preserveCount);
    const recentMessages = conversationMessages.slice(conversationMessages.length - preserveCount);

    // Create a bounded, chunked summary of the older turns (never fails on a
    // bloated context because each chunk is small and each message truncated).
    const summaryText = summarizeOlder(
      olderMessages.map((m) => ({ role: m.role, content: m.content })),
      { keepRecentCount: preserveCount }
    );

    const summaryMessage: AgentMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: summaryText,
      timestamp: Date.now()
    };

    const compactedMessages = [
      ...systemMessages,
      summaryMessage,
      ...recentMessages
    ];

    const finalReport = this.tokenCounter.calculateTrajectoryUsage(compactedMessages, [], '', limit);

    return {
      compactedMessages,
      wasCompacted: true,
      tokensBefore,
      tokensAfter: finalReport.totalTokens,
      summaryCreated: summaryText
    };
  }
}
