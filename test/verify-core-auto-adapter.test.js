import { AgentEngine } from '../packages/core/src/providers/ai-engine.ts';

async function testCoreAutoAdapter() {
  console.log('====================================================');
  console.log(' TESTING SUPERAGENT CORE AUTO-ADAPTER & OMNIROUTE');
  console.log('====================================================\n');

  const engine = new AgentEngine({
    provider: 'omniroute',
    model: 'oc/big-pickle',
    apiKey: 'sk-0c5cf9a3af701b2e-329358-00864672',
    baseUrl: 'http://127.0.0.1:20128/v1',
    temperature: 0.7,
    maxTokens: 100
  });

  let textReceived = '';
  let tokenCount = 0;

  console.log('Running AgentEngine.run()...');
  try {
    await engine.run('Say "Core Auto-Adapter verification passed!"', (event) => {
      if (event.type === 'token') {
        textReceived += event.content;
        tokenCount++;
      }
    });

    console.log(`\nTokens received: ${tokenCount}`);
    console.log(`Output: "${textReceived.trim()}"`);

    if (textReceived.length > 0) {
      console.log('\n✓ SUPERAGENT CORE AUTO-ADAPTER VERIFICATION PASSED!');
    } else {
      console.log('\n✗ FAILED: No output received');
      process.exit(1);
    }
  } catch (e) {
    console.error('\n✗ SUPERAGENT CORE VERIFICATION FAILED:', e.message);
    process.exit(1);
  }
}

testCoreAutoAdapter();
