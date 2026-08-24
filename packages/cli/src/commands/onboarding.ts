import readline from 'readline';
import { SettingsStorage, AutostartManager } from '@superagent/core';

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (hidden) {
      let promptShown = false;
      (rl as any)._writeToOutput = (str: string) => {
        if (!promptShown) {
          process.stdout.write(str);
          promptShown = true;
        }
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

export async function runCliOnboarding(): Promise<boolean> {
  const settings = SettingsStorage.loadSettings();

  // If onboarding was already completed or there are already configured providers, skip onboarding.
  if (settings.general?.setupState?.completed || (settings.providers && settings.providers.length > 0)) {
    return true;
  }

  console.log('\n======================================================');
  console.log('            WELCOME TO SUPERAGENT CLI');
  console.log('======================================================');
  console.log("Let's complete a quick first-time setup to get started.\n");

  // 1. Get Owner Name
  const owner = await prompt('Enter your developer / owner name (default: Developer): ');
  const ownerName = owner || 'Developer';

  // 2. Select Theme
  console.log('\nSelect your preferred CLI theme:');
  console.log('  1) Dark Theme (Default)');
  console.log('  2) Light Theme');
  console.log('  3) System Theme');
  const themeChoice = await prompt('Choose theme (1-3, default: 1): ');
  let selectedTheme: 'dark' | 'light' | 'system' = 'dark';
  if (themeChoice === '2') selectedTheme = 'light';
  else if (themeChoice === '3') selectedTheme = 'system';

  // 3. Select and Configure AI Provider (BYOK)
  console.log('\nSelect an AI provider to connect (you can add more later in Settings):');
  console.log('  1) OmniRoute Local         (Local LLM proxy http://127.0.0.1:20128/v1 - No Key)');
  console.log('  2) Ollama (Local)           (Local runner http://localhost:11434 - No Key)');
  console.log('  3) Anthropic Claude         (Claude 3.5 Sonnet, Claude 3.5 Haiku)');
  console.log('  4) OpenAI ChatGPT           (GPT-4o, GPT-4o Mini, o1, o3-mini)');
  console.log('  5) Google Gemini            (Gemini 2.0 Flash, Gemini 1.5 Pro)');
  console.log('  6) DeepSeek                 (DeepSeek V3, DeepSeek R1)');
  console.log('  7) Groq                     (Ultra-fast LPU Inference - Llama 3.3 70B)');
  console.log('  8) OpenRouter               (Unified broker across 200+ AI models)');
  console.log('  9) Moonshot Kimi            (Moonshot AI platform)');
  console.log(' 10) NVIDIA NIM               (NVIDIA NIM inference microservices)');
  console.log(' 11) DeepInfra                (Low-cost serverless inference)');
  console.log(' 12) Ollama Cloud             (Ollama Cloud hosted model inference)');
  console.log(' 13) Custom Endpoint          (Custom OpenAI-compatible base URL)');
  console.log(' 14) Skip / Setup later in settings');

  const choice = await prompt('\nChoose option (1-14, default: 14): ');

  let providerId = '';
  let providerName = '';
  let apiKey = '';
  let baseUrl = '';
  let defaultModel = '';
  let models: any[] = [];
  let isKeyless = false;

  if (choice === '1') {
    providerId = 'omniroute';
    providerName = 'OmniRoute Local';
    baseUrl = (await prompt('Enter OmniRoute Base URL (default: http://127.0.0.1:20128/v1): ')) || 'http://127.0.0.1:20128/v1';
    apiKey = 'omniroute-local';
    isKeyless = true;
    defaultModel = 'default';
    models = [{ id: 'default', name: 'OmniRoute Default Model', providerId: 'omniroute', enabled: true }];
  } else if (choice === '2') {
    providerId = 'ollama';
    providerName = 'Ollama';
    baseUrl = (await prompt('Enter Ollama Base URL (default: http://localhost:11434): ')) || 'http://localhost:11434';
    apiKey = 'ollama-local';
    isKeyless = true;
    defaultModel = (await prompt('Enter Ollama model name (default: qwen2.5-coder:latest): ')) || 'qwen2.5-coder:latest';
    models = [{ id: defaultModel, name: defaultModel, providerId: 'ollama', enabled: true }];
  } else if (choice === '3') {
    providerId = 'anthropic';
    providerName = 'Anthropic Claude';
    baseUrl = 'https://api.anthropic.com/v1';
    apiKey = await prompt('Enter Anthropic API Key (sk-ant-...): ', true);
    defaultModel = 'claude-3-5-sonnet-20241022';
    models = [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', providerId: 'anthropic', enabled: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', providerId: 'anthropic', enabled: true }
    ];
  } else if (choice === '4') {
    providerId = 'openai';
    providerName = 'OpenAI ChatGPT';
    baseUrl = 'https://api.openai.com/v1';
    apiKey = await prompt('Enter OpenAI API Key (sk-...): ', true);
    defaultModel = 'gpt-4o';
    models = [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true },
      { id: 'o3-mini', name: 'o3-mini', providerId: 'openai', enabled: true }
    ];
  } else if (choice === '5') {
    providerId = 'gemini';
    providerName = 'Google Gemini';
    baseUrl = 'https://generativelanguage.googleapis.com';
    apiKey = await prompt('Enter Google Gemini API Key (AIzaSy...): ', true);
    defaultModel = 'gemini-2.0-flash';
    models = [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerId: 'gemini', enabled: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', providerId: 'gemini', enabled: true }
    ];
  } else if (choice === '6') {
    providerId = 'deepseek';
    providerName = 'DeepSeek';
    baseUrl = 'https://api.deepseek.com';
    apiKey = await prompt('Enter DeepSeek API Key (sk-...): ', true);
    defaultModel = 'deepseek-chat';
    models = [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', providerId: 'deepseek', enabled: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', providerId: 'deepseek', enabled: true }
    ];
  } else if (choice === '7') {
    providerId = 'groq';
    providerName = 'Groq';
    baseUrl = 'https://api.groq.com/openai/v1';
    apiKey = await prompt('Enter Groq API Key (gsk_...): ', true);
    defaultModel = 'llama-3.3-70b-versatile';
    models = [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', providerId: 'groq', enabled: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', providerId: 'groq', enabled: true }
    ];
  } else if (choice === '8') {
    providerId = 'openrouter';
    providerName = 'OpenRouter';
    baseUrl = 'https://openrouter.ai/api/v1';
    apiKey = await prompt('Enter OpenRouter API Key (sk-or-...): ', true);
    defaultModel = 'anthropic/claude-3.5-sonnet';
    models = [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', providerId: 'openrouter', enabled: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', providerId: 'openrouter', enabled: true },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (OpenRouter)', providerId: 'openrouter', enabled: true }
    ];
  } else if (choice === '9') {
    providerId = 'kimi';
    providerName = 'Moonshot Kimi';
    baseUrl = 'https://api.moonshot.cn/v1';
    apiKey = await prompt('Enter Moonshot Kimi API Key (sk-...): ', true);
    defaultModel = 'moonshot-v1-8k';
    models = [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', providerId: 'kimi', enabled: true },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', providerId: 'kimi', enabled: true }
    ];
  } else if (choice === '10') {
    providerId = 'nvidia';
    providerName = 'NVIDIA NIM';
    baseUrl = 'https://integrate.api.nvidia.com/v1';
    apiKey = await prompt('Enter NVIDIA API Key (nvapi-...): ', true);
    defaultModel = 'meta/llama-3.1-70b-instruct';
    models = [
      { id: 'meta/llama-3.1-70b-instruct', name: 'Meta Llama 3.1 70B (NVIDIA)', providerId: 'nvidia', enabled: true }
    ];
  } else if (choice === '11') {
    providerId = 'deepinfra';
    providerName = 'DeepInfra';
    baseUrl = 'https://api.deepinfra.com/v1';
    apiKey = await prompt('Enter DeepInfra API Key: ', true);
    defaultModel = 'meta-llama/Llama-3.3-70B-Instruct';
    models = [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', providerId: 'deepinfra', enabled: true }
    ];
  } else if (choice === '12') {
    providerId = 'ollama-cloud';
    providerName = 'Ollama Cloud';
    baseUrl = 'https://api.ollama.com';
    apiKey = await prompt('Enter Ollama Cloud API Key: ', true);
    defaultModel = 'llama3';
    models = [{ id: 'llama3', name: 'Llama 3 (Cloud)', providerId: 'ollama-cloud', enabled: true }];
  } else if (choice === '13') {
    providerId = 'custom';
    providerName = 'Custom OpenAI-Compatible';
    baseUrl = await prompt('Enter Custom Base URL (e.g. http://localhost:8000/v1): ');
    apiKey = (await prompt('Enter API Key (press Enter if none): ', true)) || 'custom-key';
    defaultModel = (await prompt('Enter Model Name (e.g. default): ')) || 'default';
    models = [{ id: defaultModel, name: defaultModel, providerId: 'custom', enabled: true }];
  }

  // 4. Run on Startup Question
  console.log('\nBackground Service & System Startup:');
  console.log('SuperAgent can run automatically in the background on startup to host the web app (--serve).');
  const autostartAnswer = await prompt('Enable SuperAgent background service on system startup? [y/N]: ');
  const enableStartup = autostartAnswer.toLowerCase() === 'y' || autostartAnswer.toLowerCase() === 'yes';

  if (enableStartup) {
    try {
      const res = await AutostartManager.enable('cli');
      if (res.success) {
        console.log('✓ Configured SuperAgent to start in background (--serve) on system boot.');
      }
    } catch {
      // ignore
    }
  }

  if (providerId && (apiKey || isKeyless)) {
    const nextProviders = [
      { id: providerId, name: providerName, type: 'key' as const, apiKey, baseUrl }
    ];

    // Save settings
    SettingsStorage.saveSettings({
      theme: { cli: selectedTheme, desktop: selectedTheme },
      providers: nextProviders,
      models: models,
      lastUsedModel: {
        provider: providerId,
        model: defaultModel
      },
      general: {
        ownerName,
        workMode: 'coding',
        confirmShellCommands: true,
        unsandboxedActions: false,
        autoReviewPlan: true,
        openAtLogin: enableStartup,
        setupState: {
          completed: true,
          version: 1,
        },
      },
      webApp: {
        autoStart: enableStartup,
        port: 1469
      }
    });

    console.log(`\n✓ Connected to ${providerName}! Default model set to: ${defaultModel}`);
  } else {
    // Save minimal settings
    SettingsStorage.saveSettings({
      theme: { cli: selectedTheme, desktop: selectedTheme },
      general: {
        ownerName,
        workMode: 'coding',
        confirmShellCommands: true,
        unsandboxedActions: false,
        autoReviewPlan: true,
        openAtLogin: enableStartup,
        setupState: {
          completed: true,
          version: 1,
        },
      },
      webApp: {
        autoStart: enableStartup,
        port: 1469
      }
    });
    console.log('\n⚠ No provider connected. You can configure them later in Settings or via `/model`.');
  }

  console.log('\n======================================================');
  console.log('✓ Onboarding complete! Launching interactive chat...');
  console.log('======================================================\n');

  // Wait 1.5s for reader to absorb
  await new Promise((r) => setTimeout(r, 1500));
  return true;
}
