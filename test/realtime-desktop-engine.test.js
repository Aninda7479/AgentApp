import { AgentEngine } from '../packages/core/dist/index.js';

async function testRealtimeEngine() {
  console.log('====================================================');
  console.log(' TESTING LIVE AGENT ENGINE WITH REAL OMNIROUTE MODEL');
  console.log('====================================================\n');

  const engine = new AgentEngine({
    model: 'oc/big-pickle',
    provider: 'omniroute',
    apiKey: 'sk-0c5cf9a3af701b2e-329358-00864672',
    baseUrl: 'http://127.0.0.1:20128/v1',
    systemPrompt: 'You are SuperAgent, a powerful autonomous AI coding assistant.'
  }, 'test-session-realtime');

  let fullOutput = '';
  let tokenCount = 0;
  let thoughtsCount = 0;

  await engine.run('hello', (event) => {
    if (event.type === 'token') {
      tokenCount++;
      fullOutput += event.content || '';
    } else if (event.type === 'thought') {
      thoughtsCount++;
    } else if (event.type === 'replace_tokens') {
      console.log('[EVENT] replace_tokens fired! Cleaned content length:', event.content?.length);
      fullOutput = event.content || '';
    }
  });

  console.log(`\nTokens received: ${tokenCount}`);
  console.log(`Thoughts received: ${thoughtsCount}`);
  console.log('----------------------------------------------------');
  console.log('FINAL AGENT ENGINE OUTPUT:');
  console.log(fullOutput);
  console.log('----------------------------------------------------');

  const repeats = (fullOutput.match(/Hello! How can I assist you today\?/g) || []).length;
  console.log(`Pattern repeat count: ${repeats}`);

  if (repeats > 1) {
    console.error('❌ REPETITION DETECTED!');
    process.exit(1);
  } else {
    console.log('✓ REALTIME TEST PASSED PERFECTLY WITH ZERO REPETITION!');
  }
}

testRealtimeEngine().catch(console.error);
