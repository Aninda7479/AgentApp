import * as fs from 'fs';
import * as path from 'path';
import { getConfigDirectory } from '../storage/locations.js';
import { SettingsStorage } from '../storage/settings-store.js';

/** Capability scores (0-100) for a model across different dimensions. */
export interface ModelScore {
  coding: number; // 0-100
  reasoning: number; // 0-100
  vision: number; // 0-100
  costEfficiency: number; // 0-100 (100 = free/cheapest, 0 = highest cost)
}

/** Manages Orchestrator system instructions, scoring, and auto-updates from OpenRouter. */
export class OrchestratorStorage {
  /** Returns the file path to the orchestrator instructions markdown. */
  public static getInstructionsPath(): string {
    return path.join(getConfigDirectory(), 'orchestrator-instructions.md');
  }

  /** Loads Orchestrator instructions from disk, generating defaults if missing. */
  public static loadInstructions(): string {
    const filePath = this.getInstructionsPath();
    if (!fs.existsSync(filePath)) {
      this.generateAndSaveDefault();
    }
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /** Writes Orchestrator instructions to disk. */
  public static saveInstructions(content: string): void {
    const filePath = this.getInstructionsPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (e) {
      console.error('Failed to save Orchestrator instructions:', e);
    }
  }

  /** Resolves capability scores based on model ID keywords. */
  public static getModelScores(modelId: string): ModelScore {
    const id = modelId.toLowerCase();
    
    // Baseline database for frontier and open-source models (2026 stats)
    if (id.includes('fable-5') || id.includes('fable')) {
      return { coding: 80.3, reasoning: 85.0, vision: 80.0, costEfficiency: 10 };
    }
    if (id.includes('claude-3-7-sonnet') || id.includes('sonnet')) {
      return { coding: 75.0, reasoning: 78.0, vision: 80.0, costEfficiency: 35 };
    }
    if (id.includes('claude-3-opus') || id.includes('opus')) {
      return { coding: 69.0, reasoning: 75.0, vision: 78.0, costEfficiency: 15 };
    }
    if (id.includes('claude-3-5-sonnet') || id.includes('3-5-sonnet')) {
      return { coding: 74.0, reasoning: 75.0, vision: 78.0, costEfficiency: 35 };
    }
    if (id.includes('claude-3-5-haiku') || id.includes('haiku')) {
      return { coding: 64.0, reasoning: 62.0, vision: 10.0, costEfficiency: 60 };
    }
    if (id.includes('gpt-4o-mini') || id.includes('4o-mini')) {
      return { coding: 65.0, reasoning: 64.0, vision: 68.0, costEfficiency: 88 };
    }
    if (id.includes('gpt-4o') || id.includes('4o')) {
      return { coding: 72.8, reasoning: 73.5, vision: 76.0, costEfficiency: 40 };
    }
    if (id.includes('o1-mini') || id.includes('o1-preview') || id.includes('o3-mini')) {
      return { coding: 78.5, reasoning: 88.0, vision: 20.0, costEfficiency: 45 };
    }
    if (id.includes('gemini-2.5-pro') || id.includes('2.5-pro') || id.includes('1.5-pro')) {
      return { coding: 72.0, reasoning: 74.0, vision: 79.0, costEfficiency: 40 };
    }
    if (id.includes('gemini-2.5-flash') || id.includes('2.5-flash') || id.includes('2.0-flash') || id.includes('1.5-flash')) {
      return { coding: 62.0, reasoning: 60.0, vision: 68.0, costEfficiency: 92 };
    }
    if (id.includes('deepseek-reasoner') || id.includes('deepseek-r1') || id.includes('r1')) {
      return { coding: 79.5, reasoning: 90.0, vision: 10.0, costEfficiency: 82 };
    }
    if (id.includes('deepseek-chat') || id.includes('deepseek-v3')) {
      return { coding: 73.0, reasoning: 72.0, vision: 10.0, costEfficiency: 95 };
    }
    if (id.includes('llama-3.1-405b') || id.includes('llama-3.3-70b') || id.includes('llama-3')) {
      return { coding: 68.0, reasoning: 70.0, vision: 40.0, costEfficiency: 70 };
    }
    if (id.includes('qwen-2.5-72b') || id.includes('qwen-2.5-coder') || id.includes('qwen')) {
      return { coding: 74.0, reasoning: 71.0, vision: 30.0, costEfficiency: 85 };
    }
    if (id.includes('ollama') || id.includes('omniroute') || id.includes('local')) {
      return { coding: 58.0, reasoning: 55.0, vision: 20.0, costEfficiency: 100 };
    }

    // Default stats for unmapped models
    return { coding: 55.0, reasoning: 55.0, vision: 30.0, costEfficiency: 85 };
  }

  /** Generates custom markdown instructions dynamically based on active models. */
  public static generateDynamicInstructions(): string {
    const settings = SettingsStorage.loadSettings();
    const orchestratorSettings = settings.orchestrator || settings.modelGov;
    const govEnabledIds = orchestratorSettings?.enabledModels || [];
    
    // Filter to only include models in the custom Orchestrator pool
    const activeModels = (settings.models || []).filter(m => 
      govEnabledIds.includes(m.id) || 
      govEnabledIds.includes(`${m.providerId}-${m.id}`)
    );

    const categories: Record<string, string[]> = {
      coding: [],
      reasoning: [],
      vision: [],
      conversations: []
    };

    const scoreTableLines: string[] = [
      '| Model Name | Provider | Coding Score | Reasoning Score | Vision Score | Cost Index |',
      '| :--- | :--- | :---: | :---: | :---: | :---: |'
    ];

    for (const m of activeModels) {
      const name = m.name;
      const provider = m.providerId;

      // Extract capabilities scores
      const scores = this.getModelScores(m.id);

      // Classify model category
      const isCoding = scores.coding >= 70;
      const isReasoning = scores.reasoning >= 75;
      const isVision = scores.vision >= 75;

      const modelLabel = `\`${name}\` (Score: **${Math.max(scores.coding, scores.reasoning, scores.vision)}**)`;

      if (isCoding) categories.coding.push(modelLabel);
      else if (isReasoning) categories.reasoning.push(modelLabel);
      else if (isVision) categories.vision.push(modelLabel);
      else categories.conversations.push(modelLabel);

      // Add to score matrix table
      scoreTableLines.push(
        `| ${name} | ${provider} | ${scores.coding.toFixed(1)} | ${scores.reasoning.toFixed(1)} | ${scores.vision.toFixed(1)} | ${scores.costEfficiency} |`
      );
    }

    const optimization = orchestratorSettings?.optimizationGoal || 'balanced';
    const strategy = orchestratorSettings?.routingStrategy || 'router';
    const freeOnly = !!orchestratorSettings?.freeOnly;

    return `# Orchestrator System Instructions (Sakana Fugu Routing)

This document guides the dynamic routing of tasks to the most cost-effective and capable AI model. 
Dynamically generated at: ${new Date().toLocaleString()}.

## Governance Swarm Profile
*   **Optimization Goal**: ${optimization.toUpperCase()} (Prioritizing ${optimization === 'quality' ? 'maximum output accuracy and reasoning capability' : optimization === 'cost' ? 'minimum API expenses and token utilization' : 'optimal balance between latency, cost, and quality'})
*   **Routing Strategy**: ${strategy === 'orchestrator' ? 'Orchestrator Mode (Decomposes tasks into sub-tasks and conducts multiple models in parallel)' : 'Single Model Router Mode (Selects the single best candidate model for the query)'}
${freeOnly ? '*   **Cost Restriction**: FREE-ONLY mode is active. Only free/local models are allowed. The Orchestrator must optimize all tasks within these limits.\n' : ''}
## Model Capability & Score Matrix
${scoreTableLines.join('\n')}

## Dynamic Swarm Pool
*   **Coding Specialists**: ${categories.coding.join(', ') || 'None in pool.'}
*   **Reasoning Specialists**: ${categories.reasoning.join(', ') || 'None in pool.'}
*   **Vision Specialists**: ${categories.vision.join(', ') || 'None in pool.'}
*   **Conversation Specialists**: ${categories.conversations.join(', ') || 'None in pool.'}

## Claude Fable 5 Escalation-Based Routing System
Fugu routing follows the Anthropic Fable-class conducting framework to minimize context burn while maximizing output quality:
1. **Task Decomposition (Planning)**: Always assign planning, file structural outlines, and plan validation steps to the model with the highest **Reasoning Score**.
2. **Standard Execution (Writing)**: Route routine writing, minor text adjustments, or boilerplate additions to the model with the highest **Cost Index** (cheapest) that maintains a **Coding Score** > 60.
3. **Escalation Trigger (Debugging)**: If a compiler command returns an error or a test suite fails, escalate execution to the model with the highest **Coding Score** to run the diagnostics and correct files.

## Dynamic Routing Rules
1. If prompt asks to compile, debug, edit code, write scripts, or parse compiler errors, route to **Coding**.
2. If prompt involves math formulas, algorithms, logic, deep planning, or optimization, route to **Reasoning**.
3. If prompt involves screenshots, canvas layouts, or media attachments, route to **Vision**.
4. Otherwise, route to **Everyday Conversations**.
`;
  }

  /** Generates default governance instructions and writes them to disk. */
  public static generateAndSaveDefault(): void {
    const content = this.generateDynamicInstructions();
    this.saveInstructions(content);
  }

  /** Fetches latest pricing from OpenRouter API and regenerates instructions. */
  public static async autoUpdateInstructions(): Promise<string> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) {
        throw new Error(`OpenRouter API responded with status ${res.status}`);
      }
      const json = await res.json() as any;
      const models = json.data || [];

      // Load current settings
      const settings = SettingsStorage.loadSettings();
      const currentModels = settings.models || [];

      // Update pricing values for registered models in settings
      let updatedCount = 0;
      for (const m of currentModels) {
        const cleanName = m.name.toLowerCase();
        
        // Find matching OpenRouter entry
        const matched = models.find((item: any) => 
          item.id.toLowerCase() === cleanName || 
          item.id.toLowerCase().includes(cleanName) || 
          cleanName.includes(item.id.toLowerCase())
        );

        if (matched && matched.pricing) {
          const inputPrice = (parseFloat(matched.pricing.prompt) * 1000000).toFixed(2);
          const outputPrice = (parseFloat(matched.pricing.completion) * 1000000).toFixed(2);
          
          m.pricing = {
            inputPer1M: `$${inputPrice}`,
            outputPer1M: `$${outputPrice}`
          };
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        SettingsStorage.saveSettings({ models: currentModels });
      }

      // Generate dynamic instructions markdown
      const newContent = this.generateDynamicInstructions();
      this.saveInstructions(newContent);
      return newContent;
    } catch (e: any) {
      console.error('Failed to auto-update Orchestrator instructions:', e);
      const fallbackContent = this.generateDynamicInstructions();
      this.saveInstructions(fallbackContent);
      return fallbackContent;
    }
  }
}
