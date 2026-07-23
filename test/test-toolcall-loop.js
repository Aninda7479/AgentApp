import { AgentEngine } from '../packages/core/dist/index.js';

async function testToolCallLoop() {
  console.log('====================================================');
  console.log(' TESTING TOOL CALL LOOP FIX WITH LIVE oc/big-pickle');
  console.log('====================================================\n');

  const engine = new AgentEngine({
    model: 'oc/big-pickle',
    provider: 'omniroute',
    apiKey: 'sk-0c5cf9a3af701b2e-329358-00864672',
    baseUrl: 'http://127.0.0.1:20128/v1',
    systemPrompt: 'You are SuperAgent, a powerful autonomous AI coding assistant.'
  }, 'test-session-toolloop');

  let tokenCount = 0;
  let toolCallCount = 0;
  const toolCallsSeen = new Map();

  await engine.run('name', (event) => {
    if (event.type === 'token') {
      tokenCount++;
    } else if (event.type === 'tool_call') {
      toolCallCount++;
      const key = `${event.toolName}:${JSON.stringify(event.toolArgs)}`;
      toolCallsSeen.set(key, (toolCallsSeen.get(key) || 0) + 1);
      console.log(`  [tool_call] ${event.toolName}(${JSON.stringify(event.toolArgs)})`);
    } else if (event.type === 'done') {
      console.log('  [done]');
    } else if (event.type === 'error') {
      console.log(`  [error] ${event.error}`);
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(`Total tool_call events fired: ${toolCallCount}`);
  console.log(`Unique tool calls: ${toolCallsSeen.size}`);
  console.log(`Tokens received: ${tokenCount}`);

  const maxDupes = Math.max(...toolCallsSeen.values(), 0);
  console.log(`Max repetitions of any single tool call: ${maxDupes}`);

  if (maxDupes > 2) {
    console.error(`\n❌ FAIL: Tool call fired ${maxDupes} times (expected ≤ 2)`);
    process.exit(1);
  } else {
    console.log('\n✓ PASS: Tool call loop guard working — zero flooding!');
  }
}

testToolCallLoop().catch(console.error);
