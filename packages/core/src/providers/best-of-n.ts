/**
 * Best-of-N result merging for parallel multi-model orchestration (mission
 * point 2 — run several task-matched models and combine their outputs).
 *
 * Research basis (see /auto-improve log entry for this cycle):
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

export type BestOfNStrategy = 'consensus' | 'longest' | 'first';

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
