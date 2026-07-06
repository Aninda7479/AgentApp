import * as fs from 'fs';
import * as path from 'path';
import { getConfigDirectory, SettingsStorage } from './settings-store.js';

export interface ModelScore {
  coding: number; // 0-100
  reasoning: number; // 0-100
  vision: number; // 0-100
  costEfficiency: number; // 0-100 (100 = free/cheapest, 0 = highest cost)
}

export class ModelGovStorage {
  public static getInstructionsPath(): string {
    return path.join(getConfigDirectory(), 'model-gov-instructions.md');
  }

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

  public static saveInstructions(content: string): void {
    const filePath = this.getInstructionsPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (e) {
      console.error('Failed to save model gov instructions:', e);
    }
  }

  /**
   * Resolves capabilities scores based on model ID keywords.
   */
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
    if (id.includes('o3-mini')) {
      return { coding: 76.0, reasoning: 82.0, vision: 20.0, costEfficiency: 60 };
    }
    if (id.includes('o1') || id.includes('o3')) {
      return { coding: 74.0, reasoning: 84.0, vision: 75.0, costEfficiency: 20 };
    }
    if (id.includes('gpt-4o-mini')) {
      return { coding: 58.0, reasoning: 59.0, vision: 70.0, costEfficiency: 96 };
    }
    if (id.includes('gpt-4o')) {
      return { coding: 72.0, reasoning: 74.0, vision: 82.0, costEfficiency: 40 };
    }
    if (id.includes('deepseek-reasoner')) {
      return { coding: 73.0, reasoning: 84.0, vision: 10.0, costEfficiency: 90 };
    }
    if (id.includes('deepseek-chat') || id.includes('deepseek-v3') || id.includes('deepseek')) {
      return { coding: 70.0, reasoning: 71.0, vision: 10.0, costEfficiency: 95 };
    }
    if (id.includes('gemini-3.1-pro') || id.includes('gemini-3')) {
      return { coding: 73.0, reasoning: 76.0, vision: 83.0, costEfficiency: 50 };
    }
    if (id.includes('gemini-2.5-flash') || id.includes('gemini-2.0-flash') || id.includes('flash')) {
      return { coding: 60.0, reasoning: 62.0, vision: 75.0, costEfficiency: 98 };
    }
    if (id.includes('gemma-4') || id.includes('gemma')) {
      return { coding: 64.0, reasoning: 65.0, vision: 15.0, costEfficiency: 98 };
    }
    if (id.includes('phi-4') || id.includes('phi')) {
      return { coding: 62.0, reasoning: 63.0, vision: 10.0, costEfficiency: 99 };
    }
    if (id.includes('wan') || id.includes('cosmos') || id.includes('video') || id.includes('seedream') || id.includes('expand')) {
      return { coding: 10.0, reasoning: 15.0, vision: 85.0, costEfficiency: 85 };
    }
    if (id.includes('e5') || id.includes('gte') || id.includes('sentence-transformers')) {
      return { coding: 5.0, reasoning: 5.0, vision: 5.0, costEfficiency: 100 };
    }

    // Default open-source fallback
    return { coding: 55.0, reasoning: 55.0, vision: 30.0, costEfficiency: 85 };
  }

  /**
   * Generates custom markdown instructions dynamically based on the active models in the pool.
   */
  public static generateDynamicInstructions(): string {
    const settings = SettingsStorage.loadSettings();
    const govEnabledIds = settings.modelGov?.enabledModels || [];
    
    // Filter to only include models in the custom Model Gov pool
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
      const id = m.id.toLowerCase();
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

    const optimization = settings.modelGov?.optimizationGoal || 'balanced';
    const strategy = settings.modelGov?.routingStrategy || 'router';

    return `# Model Governance System Instructions (Sakana Fugu Routing)

This document guides the dynamic routing of tasks to the most cost-effective and capable AI model. 
Dynamically generated at: ${new Date().toLocaleString()}.

## Governance Swarm Profile
*   **Optimization Goal**: ${optimization.toUpperCase()} (Prioritizing ${optimization === 'quality' ? 'maximum output accuracy and reasoning capability' : optimization === 'cost' ? 'minimum API expenses and token utilization' : 'optimal balance between latency, cost, and quality'})
*   **Routing Strategy**: ${strategy === 'orchestrator' ? 'Orchestrator Mode (Decomposes tasks into sub-tasks and conducts multiple models in parallel)' : 'Single Model Router Mode (Selects the single best candidate model for the query)'}

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

  public static generateAndSaveDefault(): void {
    const content = this.generateDynamicInstructions();
    this.saveInstructions(content);
  }

  /**
   * Fetches latest pricing from OpenRouter API, updates settings model prices,
   * and compiles new customized instructions.
   */
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
      console.error('Failed to auto-update model gov instructions:', e);
      const fallbackContent = this.generateDynamicInstructions();
      this.saveInstructions(fallbackContent);
      return fallbackContent;
    }
  }
}
