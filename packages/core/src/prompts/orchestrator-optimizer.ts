export interface ActiveModelForOptimization {
  name: string;
  providerId: string;
  pricing?: {
    inputPer1M?: string | number;
    outputPer1M?: string | number;
  };
}

export interface OrchestratorOptimizerOptions {
  activeModels: ActiveModelForOptimization[];
  currentInstructions: string;
  optimizationGoal: string;
  routingStrategy: string;
  freeOnly: boolean;
}

export function buildOrchestratorOptimizerPrompt(options: OrchestratorOptimizerOptions): string {
  const { activeModels, currentInstructions, optimizationGoal, routingStrategy, freeOnly } = options;
  const modelsList = activeModels
    .map(
      (m) =>
        `- ${m.name} (${m.providerId}) - Pricing: Input ${m.pricing?.inputPer1M || 'N/A'}, Output ${m.pricing?.outputPer1M || 'N/A'}`
    )
    .join('\n');

  return `You are a system prompt optimizer. You are optimizing the Orchestrator System Instructions for a Sakana Fugu-class routing conductor.

Here is the current pool of enabled models:
${modelsList}

Here is the current instructions file content:
\`\`\`markdown
${currentInstructions}
\`\`\`

Optimization Goal: ${optimizationGoal}
Routing Strategy: ${routingStrategy}
${freeOnly ? 'NOTE: Free-Only mode is enabled. The Orchestrator should only utilize free, local, or custom models. Avoid paid options.' : ''}

Please optimize these system instructions to:
1. Make the categorization boundaries more precise for the specific models in this pool.
2. Formulate explicit conducting guidelines using the Claude Fable 5 escalation structure.
3. Keep the output strictly in Markdown format.
4. Do NOT wrap the output in markdown code blocks (e.g. \`\`\`markdown). Return ONLY the direct markdown text of the system instructions.`;
}
