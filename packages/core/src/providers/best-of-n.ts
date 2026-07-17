/**
 * Best-of-N result merging for parallel multi-model orchestration (mission
 * point 2 — run several task-matched models and combine their outputs).
 *
 * Research basis:
 *  - Best-of-N sampling: generate N candidates, then select the best via a
 *    verifier / consensus. For free-form text, Universal Self-Consistency
 *    (Chen et al.) lets an LLM aggregator pick the most consistent candidate;
 *    for code/closed-form answers, majority/execution voting clusters
 *    semantically-equivalent outputs.
 *  - Mixture-of-Agents (arXiv:2406.04692): layered "proposer" models refined by
 *    a strong "aggregator". Diverse weaker outputs lifted by a strong synthesizer
 *    can beat any single model.
 *
 * This module is the DETERMINISTIC, dependency-free merge half. The LLM-backed
 * aggregator path (Universal Self-Consistency / MoA) is wired in the engine in a
 * later phase; here we provide the strategies that need no extra model call:
 * `consensus` (majority vote over normalized candidates, longest on a tie),
 * `longest` (most complete), and `first`.
 */

export type BestOfNStrategy = 'consensus' | 'longest' | 'first' | 'synthesize';

/**
 * Combines N model outputs into one. Returns '' when every candidate is empty.
 * - `first`      : the first non-empty candidate (cheapest; useful when the
 *                  candidates are already ordered best-first).
 * - `longest`    : the longest non-empty candidate (proxy for "most complete").
 * - `consensus`  : the most frequently occurring candidate (normalized for
 *                  whitespace/case); ties break toward the longest. This is the
 *                  free-form analogue of majority voting and needs no model call.
 */
export function mergeBestOfN(
  responses: Array<string | null | undefined>,
  strategy: BestOfNStrategy = 'consensus'
): string {
  const nonEmpty = (responses ?? [])
    .map((r) => (r ?? '').trim())
    .filter((r) => r.length > 0);

  if (nonEmpty.length === 0) return '';
  if (nonEmpty.length === 1) return nonEmpty[0];

  switch (strategy) {
    case 'first':
      return nonEmpty[0];
    case 'longest':
      return nonEmpty.reduce((best, cur) => (cur.length > best.length ? cur : best), nonEmpty[0]);
    case 'consensus': {
      const normalize = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
      const counts = new Map<string, { original: string; n: number }>();
      for (const r of nonEmpty) {
        const key = normalize(r);
        const entry = counts.get(key);
        if (entry) entry.n += 1;
        else counts.set(key, { original: r, n: 1 });
      }
      let best = nonEmpty[0];
      let bestCount = 0;
      for (const { original, n } of counts.values()) {
        if (n > bestCount || (n === bestCount && original.length > best.length)) {
          best = original;
          bestCount = n;
        }
      }
      return best;
    }
    default:
      return nonEmpty[0];
  }
}

/**
 * Result of {@link synthesizeEnsemble} — the bias-resistance-oriented merge.
 * Beyond the merged text it reports how much the candidate models *agreed*,
 * which is the signal that matters for bias-resistance: high agreement across
 * independently-selected models means the answer is robust to any single
 * model's biases; low agreement means the models diverged and the (possibly
 * synthesized) output should be read with more skepticism.
 */
export interface EnsembleResult {
  /** Chosen/synthesized text. */
  text: string;
  /** Agreement ratio 0..1 = winnerVotes / total. 1 = unanimous. */
  agreement: number;
  /** Number of distinct (normalized) answers among the candidates. */
  clusters: number;
  /** Votes for the winning cluster. */
  winnerVotes: number;
  /** Count of non-empty candidate responses considered. */
  total: number;
  /** Distinct candidate texts (one per cluster), longest first. */
  candidates: string[];
}

/**
 * Bias-resistance merge of N candidate outputs. Shares the decision logic of
 * {@link mergeBestOfN} (first / longest / consensus) but adds an `agreement`
 * metric and a dedicated `synthesize` strategy for the *divergent* case: when
 * the models do NOT reach a majority, `synthesize` surfaces the distinct
 * perspectives as a labelled multi-view so disagreement is visible rather than
 * hidden behind a single model's bias. `consensus` keeps the prior behaviour
 * (collapse to the most-voted / longest answer) for backward compatibility.
 * Deterministic, no extra model call (the LLM-backed aggregator / MoA path is a
 * later phase).
 */
export function synthesizeEnsemble(
  responses: Array<string | null | undefined>,
  strategy: BestOfNStrategy = 'consensus'
): EnsembleResult {
  const items = (responses ?? [])
    .map((r) => (r ?? '').trim())
    .filter((r) => r.length > 0);

  if (items.length === 0) {
    return { text: '', agreement: 0, clusters: 0, winnerVotes: 0, total: 0, candidates: [] };
  }
  if (items.length === 1) {
    return { text: items[0], agreement: 1, clusters: 1, winnerVotes: 1, total: 1, candidates: [items[0]] };
  }

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const counts = new Map<string, { original: string; n: number }>();
  for (const r of items) {
    const key = normalize(r);
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { original: r, n: 1 });
  }
  // Most-voted first; tie-break toward the longer original (more complete).
  const clusters = [...counts.values()].sort(
    (a, b) => b.n - a.n || b.original.length - a.original.length
  );

  const winner = clusters[0];
  const total = items.length;
  const agreement = winner.n / total;

  let text: string;
  if (strategy === 'first') {
    text = items[0];
  } else if (strategy === 'longest') {
    text = items.reduce((best, cur) => (cur.length > best.length ? cur : best), items[0]);
  } else if (strategy === 'synthesize') {
    // Always surface the distinct perspectives (bias-resistance multi-view),
    // even when one cluster holds a majority.
    text = clusters.map((c, i) => `Perspective ${i + 1}:\n${c.original}`).join('\n\n');
  } else {
    // consensus (default): collapse to the most-voted answer, longest on a tie —
    // unchanged from the prior mergeBestOfN behaviour.
    text = winner.original;
  }

  return {
    text,
    agreement,
    clusters: clusters.length,
    winnerVotes: winner.n,
    total,
    candidates: clusters.map((c) => c.original)
  };
}
