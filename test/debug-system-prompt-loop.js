import { OmniRouteClient } from './omniroute-perfect-client.js';

async function testSystemPromptLoop() {
  const client = new OmniRouteClient();

  const systemPrompt = `You are SuperAgent, a powerful autonomous AI coding assistant.
You operate as an expert pair programmer to solve coding tasks, write code, debug issues, and run terminal commands.`;

  console.log('====================================================');
  console.log(' TESTING SYSTEM PROMPT RESPONSE FOR oc/big-pickle');
  console.log('====================================================\n');

  try {
    const res = await client.chatCompletion({
      model: 'oc/big-pickle',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'hi' }
      ]
    });

    console.log('OUTPUT RECEIVED:');
    console.log('----------------------------------------------------');
    console.log(res.content);
    console.log('----------------------------------------------------');

    if (res.reasoning) {
      console.log('REASONING TRACE:');
      console.log(res.reasoning.slice(0, 300));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testSystemPromptLoop();
