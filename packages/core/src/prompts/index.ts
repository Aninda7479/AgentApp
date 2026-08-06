export { DEFAULT_AGENT_SYSTEM_PROMPT, buildContextualSystemPrompt } from './default-agent.js';
export { buildTitleGeneratorPrompt } from './title-generator.js';
export { buildOrchestratorOptimizerPrompt, type ActiveModelForOptimization, type OrchestratorOptimizerOptions } from './orchestrator-optimizer.js';

import { SUPERAGENT_ARTIFACTS_SKILL } from './skills/superagent-artifacts.js';
import { SKILL_CREATOR_SKILL } from './skills/skill-creator.js';
import { LEARN_SKILL } from './skills/learn.js';

export { SUPERAGENT_ARTIFACTS_SKILL, SKILL_CREATOR_SKILL, LEARN_SKILL };

export const BUILTIN_SKILLS = [
  SUPERAGENT_ARTIFACTS_SKILL,
  SKILL_CREATOR_SKILL,
  LEARN_SKILL
];

