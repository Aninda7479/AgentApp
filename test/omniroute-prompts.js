const API_BASE_URL = 'http://127.0.0.1:20128/v1';
const API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';
const MODEL_NAME = 'oc/big-pickle';

async function testPrompts() {
  const prompts = [
    'Hi',
    'Hello!',
    'What is 2 + 2?',
    'Write a hello world program in JavaScript.',
    'Explain AI',
    'Tell me a short joke.',
    'Explain what a route provider is in 2 sentences.'
  ];

  for (const p of prompts) {
    console.log(`\nTesting Prompt: "${p}"`);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [{ role: 'user', content: p }]
        })
      });

      console.log(`Status: ${res.status}`);
      const text = await res.text();
      if (res.ok) {
        console.log(`Response preview: ${text.slice(0, 150)}...`);
      } else {
        console.log(`Error body: ${text}`);
      }
    } catch (e) {
      console.log(`Exception: ${e.message}`);
    }
  }
}

testPrompts();
