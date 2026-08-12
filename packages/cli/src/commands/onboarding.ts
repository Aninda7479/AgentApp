import readline from 'readline';
import { SettingsStorage, AuthStore } from '@superagent/core';

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
  
  // If there are already configured providers, skip onboarding.
  if (settings.providers && settings.providers.length > 0) {
    return true;
  }

  console.log('\n======================================================');
  console.log('            WELCOME TO SUPERAGENT CLI');
  console.log('======================================================');
  console.log('Let\'s complete a quick first-time setup to get started.\n');

  // 1. Get Owner Name
  const owner = await prompt('Enter your developer / owner name (default: Developer): ');
  const ownerName = owner || 'Developer';

  // 2. Select and Configure AI Provider
  console.log('\nSelect a provider to connect (you can add more later):');
  console.log('  1) Anthropic Claude');
  console.log('  2) OpenAI ChatGPT');
  console.log('  3) Google Gemini');
  console.log('  4) Skip / Setup later in settings');
  
  const choice = await prompt('\nChoose option (1-4): ');
  
  let providerId = '';
  let providerName = '';
  let apiKey = '';
  let baseUrl = '';
  let defaultModel = '';
  let models: any[] = [];

  if (choice === '1') {
    providerId = 'anthropic';
    providerName = 'Anthropic';
    baseUrl = 'https://api.anthropic.com';
    apiKey = await prompt('Enter Anthropic API Key (sk-ant-...): ', true);
    defaultModel = 'claude-3-5-sonnet-latest';
    models = [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', providerId: 'anthropic', enabled: true },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', providerId: 'anthropic', enabled: true }
    ];
  } else if (choice === '2') {
    providerId = 'openai';
    providerName = 'OpenAI';
    baseUrl = 'https://api.openai.com/v1';
    apiKey = await prompt('Enter OpenAI API Key (sk-...): ', true);
    defaultModel = 'gpt-4o-mini';
    models = [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true }
    ];
  } else if (choice === '3') {
    providerId = 'gemini';
    providerName = 'Gemini';
    baseUrl = 'https://generativelanguage.googleapis.com';
    apiKey = await prompt('Enter Gemini API Key (AIzaSy...): ', true);
    defaultModel = 'gemini-1.5-flash';
    models = [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', providerId: 'gemini', enabled: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', providerId: 'gemini', enabled: true }
    ];
  }

  if (providerId && apiKey) {
    const nextProviders = [
      { id: providerId, name: providerName, type: 'key' as const, apiKey, baseUrl }
    ];
    
    // Save settings
    SettingsStorage.saveSettings({
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
        autoReviewPlan: true
      }
    });

    console.log(`\n✓ Connected to ${providerName}! Default model set to: ${defaultModel}`);
  } else {
    // Save minimal settings
    SettingsStorage.saveSettings({
      general: {
        ownerName,
        workMode: 'coding',
        confirmShellCommands: true,
        unsandboxedActions: false,
        autoReviewPlan: true
      }
    });
    console.log('\n⚠ No provider connected. You can configure them later in Settings or via `/model`.');
  }

  console.log('\n======================================================');
  console.log('✓ Onboarding complete! Launching interactive chat...');
  console.log('======================================================\n');
  
  // Wait 1.5s for reader to absorb
  await new Promise(r => setTimeout(r, 1500));
  return true;
}
