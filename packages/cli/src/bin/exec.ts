import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { SuperAgentEngine, SettingsStorage, OrchestratorRouter, buildRouterPool, isFreeModel, BYOKProviderManager, capabilityRegistry, type CompletionRequest, type ProviderSettings, type RouterModel, sendChatMessageDirect, getUserDataDirectory } from '@superagent/core';
import { prepareAttachments } from '../attachments.js';
import { resolveConnection } from '../engine.js';

/** Options for the non-interactive script execution command. */
export interface ExecOptions {
  prompt?: string;
  file?: string;
  model?: string;
  provider?: string;
  output?: string;
  json?: boolean;
  silent?: boolean;
  apiKey?: string;
}

/** Result returned after executing a non-interactive prompt. */
export interface ExecResult {
  success: boolean;
  output: string;
  model: string;
  provider: string;
  executionTimeMs: number;
  error?: string;
}

/**
 * Executes a prompt or file-based instruction via the SuperAgent engine.
 * @param options - Execution configuration (prompt, file, model, output, etc.)
 */
export async function executeScript(options: ExecOptions): Promise<ExecResult> {
  const startTime = Date.now();
  let promptText = options.prompt || '';

  if (options.file) {
    try {
      const filePath = path.resolve(options.file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      promptText = promptText ? `${promptText}\n\n${fileContent}` : fileContent;
    } catch (err) {
      const errorMsg = `Failed to read input file: ${(err as Error).message}`;
      if (!options.silent) console.error(`[Error] ${errorMsg}`);
      return {
        success: false,
        output: '',
        model: options.model || 'gpt-4o',
        provider: options.provider || 'openai',
        executionTimeMs: Date.now() - startTime,
        error: errorMsg
      };
    }
  }

  if (!promptText.trim()) {
    const errorMsg = 'No prompt or input file provided for execution.';
    if (!options.silent) console.error(`[Error] ${errorMsg}`);
    return {
      success: false,
      output: '',
      model: options.model || 'gpt-4o',
      provider: options.provider || 'openai',
      executionTimeMs: Date.now() - startTime,
      error: errorMsg
    };
  }

  const savedSettings = SettingsStorage.loadSettings();
  const reqProvider = options.provider || savedSettings.lastUsedModel?.provider || '';
  const reqModel = options.model || savedSettings.lastUsedModel?.model || 'gpt-4o';

  // Resolve the live connection (real API key / base URL) through Core connection resolver
  const conn = resolveConnection(reqProvider, reqModel);
  const resolvedProvider = conn.provider;
  const resolvedModel = conn.model;
  const apiKey = options.apiKey || conn.apiKey || 'exec-session-key';

  if (!options.silent) {
    console.log(`[SuperAgent Exec] Running prompt using provider: ${resolvedProvider}, model: ${resolvedModel}...`);
  }

  const engine = new SuperAgentEngine({
    provider: resolvedProvider,
    apiKey,
    model: resolvedModel,
    projectRoot: process.cwd()
  });

  let resultOutput = '';

  // Detect image paths (drag-and-drop / typed) and attach them as multimodal content.
  const { cleanText, attachments } = await prepareAttachments(promptText);

  // `--model orchestrator` (or a saved Orchestrator routing strategy) routes the
  // prompt through the real Model Orchestrator, which picks the best model for
  // the task across the user's enabled pool instead of a single fixed model.
  const useOrchestrator = resolvedModel === 'orchestrator' || resolvedProvider === 'orchestrator';

  let printedDirectly = false;

  try {
    if (useOrchestrator) {
      const freeOnly = !!savedSettings.orchestrator?.freeOnly;
      // `completeWithFreePool` only registers keys from the `providers` arg
      // (ProviderSettings). The Desktop stores keys there, but the CLI user may
      // have stored keys purely in BYOK, so merge those in before routing.
      const providers: ProviderSettings[] = [];
      const seen = new Set<string>();
      try {
        for (const p of savedSettings.providers ?? []) {
          if (p.apiKey) {
            providers.push(p);
            seen.add(p.id);
          }
        }
      } catch {}
      try {
        for (const cfg of new BYOKProviderManager().getAllConfigs()) {
          if (cfg.apiKey && !seen.has(cfg.provider)) {
            providers.push({ id: cfg.provider, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl ?? undefined } as ProviderSettings);
            seen.add(cfg.provider);
          }
        }
      } catch {
        /* ignore uninitialized BYOK */
      }
      const keyedProviders = new Set(providers.map((p) => p.id));

      // Build the routing pool. Prefer the user's enabled models from settings;
      // if none are configured (CLI-only / BYOK user), fall back to every model
      // in the capability registry whose provider has a stored key.
      let pool = buildRouterPool(savedSettings.models ?? []).filter(
        (m) => m.enabled && keyedProviders.has(m.providerId) && (!freeOnly || isFreeModel(m))
      );
      if (pool.length === 0) {
        pool = capabilityRegistry
          .getAllCapabilities()
          .filter((c) => keyedProviders.has(c.provider))
          .map<RouterModel>((c) => ({
            id: c.id,
            name: c.name,
            providerId: c.provider,
            enabled: true,
            supportsVision: c.supportsVision,
            supportsTools: c.supportsTools,
            inputModalities: c.inputModalities as RouterModel['inputModalities'],
            outputModalities: c.outputModalities as RouterModel['outputModalities'],
            accessStatus: 'available',
            speedTier: c.speedTier,
            intelligenceTier: c.intelligenceTier,
            costPer1kTokens: c.costPer1kTokens
          }))
          .filter((m) => !freeOnly || isFreeModel(m));
      }

      const router = new OrchestratorRouter({});
      const request: CompletionRequest = { messages: [{ role: 'user', content: cleanText }] };
      const res = await router.completeWithFreePool(request, pool, providers);
      resultOutput = res.content || '';
    } else {
      const sessionId = `exec-${Date.now()}`;
      const chatConfig = {
        provider: resolvedProvider,
        model: resolvedModel,
        apiKey,
        baseUrl: conn.baseUrl || undefined,
        userDataDir: getUserDataDirectory()
      };
      
      const onToken = (token: string) => {
        if (!options.silent) {
          process.stdout.write(token);
        }
      };
      
      if (!options.silent) {
        console.log('\n--- Output ---');
      }
      
      printedDirectly = true;
      resultOutput = await sendChatMessageDirect(sessionId, cleanText, chatConfig, onToken);
      
      if (!options.silent) {
        console.log(); // Add a trailing newline after streaming is done
      }
    }
  } catch (err) {
    // Surface the real failure (e.g. no models enabled for the Orchestrator, or
    // a missing API key) instead of a misleading "Processed successfully".
    resultOutput = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const executionTimeMs = Date.now() - startTime;

  if (options.output) {
    try {
      const outputPath = path.resolve(options.output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, resultOutput, 'utf-8');
      if (!options.silent) console.log(`[SuperAgent Exec] Output saved to ${outputPath}`);
    } catch (err) {
      if (!options.silent) console.error(`[Warning] Failed to write output file: ${(err as Error).message}`);
    }
  }

  const result: ExecResult = {
    success: true,
    output: resultOutput,
    model: resolvedModel,
    provider: resolvedProvider,
    executionTimeMs
  };

  if (!options.silent) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!printedDirectly) {
        console.log('\n--- Output ---');
        console.log(resultOutput);
      }
      console.log(`---------------\nExecution completed in ${executionTimeMs}ms.`);
    }
  }

  return result;
}

/** Registers the `exec` subcommand on the Commander program. */
export function registerExecCommand(program: Command): void {
  program
    .command('exec')
    .description('Run non-interactive scripting prompt or task file')
    .option('-p, --prompt <prompt>', 'Prompt text to execute')
    .option('-f, --file <file>', 'Input file containing prompt or instructions')
    .option('-m, --model <model>', 'Specify AI model override')
    .option('--provider <provider>', 'Specify AI provider override')
    .option('-k, --key <key>', 'API Key for execution session')
    .option('-o, --output <output>', 'Save output result to target file')
    .option('--json', 'Output result in JSON format')
    .option('-s, --silent', 'Suppress console logs during execution')
    .action(async (options) => {
      const result = await executeScript({
        prompt: options.prompt,
        file: options.file,
        model: options.model,
        provider: options.provider,
        output: options.output,
        json: options.json,
        silent: options.silent,
        apiKey: options.key
      });
      if (!result.success) {
        process.exit(1);
      }
    });
}
