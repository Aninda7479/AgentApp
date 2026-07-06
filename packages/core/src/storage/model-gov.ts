import * as fs from 'fs';
import * as path from 'path';
import { getConfigDirectory, SettingsStorage } from './settings-store.js';

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

    const pricingList: string[] = [];

    for (const m of activeModels) {
      const id = m.id.toLowerCase();
      const name = m.name;
      const provider = m.providerId;

      // Classify model capability based on ID keywords or modalities
      const isCoding = /code|coder|sonnet|o3-mini|deepseek-v3|mistral-small|phi-4/.test(id);
      const isReasoning = /reasoner|o1|o3|gemini-3|gemini.*pro|hermes|gemma-4/.test(id);
      const isVision = /vision|image|expand|cosmos|wan|video|clip|seedream/.test(id) || (m.inputModalities?.includes('image') || false);

      if (isCoding) {
        categories.coding.push(`\`${name}\` (${provider})`);
      } else if (isReasoning) {
        categories.reasoning.push(`\`${name}\` (${provider})`);
      } else if (isVision) {
        categories.vision.push(`\`${name}\` (${provider})`);
      } else {
        categories.conversations.push(`\`${name}\` (${provider})`);
      }

      // Format pricing line using settings rates
      const input = m.pricing?.inputPer1M || '0.20';
      const output = m.pricing?.outputPer1M || '0.60';
      pricingList.push(`*   **${name}** (${provider}): Input ${input} / Output ${output}`);
    }

    const optimization = settings.modelGov?.optimizationGoal || 'balanced';
    const strategy = settings.modelGov?.routingStrategy || 'router';

    return `# Model Governance System Instructions (Sakana Fugu Routing)

This document guides the dynamic routing of tasks to the most cost-effective and capable AI model. 
Dynamically generated at: ${new Date().toLocaleString()}.

## Governance Swarm Profile
*   **Optimization Goal**: ${optimization.toUpperCase()} (Prioritizing ${optimization === 'quality' ? 'maximum output accuracy and reasoning capability' : optimization === 'cost' ? 'minimum API expenses and token utilization' : 'optimal balance between latency, cost, and quality'})
*   **Routing Strategy**: ${strategy === 'orchestrator' ? 'Orchestrator Mode (Decomposes tasks into sub-tasks and conducts multiple models in parallel)' : 'Single Model Router Mode (Selects the single best candidate model for the query)'}

## Dynamic Swarm Pool
*   **Coding & Complex Engineering**: ${categories.coding.join(', ') || 'None available (falls back to conversation models).'}
*   **Logic Reasoning & Expert Analysis**: ${categories.reasoning.join(', ') || 'None available (falls back to conversation models).'}
*   **Vision & Multimodal Ingestion**: ${categories.vision.join(', ') || 'None available (falls back to conversation models).'}
*   **Everyday Conversations & Summarization**: ${categories.conversations.join(', ') || 'None available.'}

## Swarm Pricing Catalog (per 1M tokens)
${pricingList.length > 0 ? pricingList.join('\n') : '*   No pricing information cataloged.'}

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
        // Clean model ID (OpenRouter uses standard names in their API)
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
      // Fallback to generating based on local settings pricing
      const fallbackContent = this.generateDynamicInstructions();
      this.saveInstructions(fallbackContent);
      return fallbackContent;
    }
  }
}
