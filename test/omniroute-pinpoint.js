const API_BASE_URL = 'http://127.0.0.1:20128/v1';
const API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';
const MODEL_NAME = 'oc/big-pickle';

async function pinpointTests() {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  };

  const fieldsToTest = [
    { name: 'Only model & messages', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }] } },
    { name: 'With system message', body: { model: MODEL_NAME, messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hi' }] } },
    { name: 'With multi-turn user/assistant', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'How are you?' }] } },
    { name: 'With max_completion_tokens', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], max_completion_tokens: 100 } },
    { name: 'With top_p: 1', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], top_p: 1 } },
    { name: 'With tools parameter', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], tools: [] } }
  ];

  for (const t of fieldsToTest) {
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(t.body)
      });
      console.log(`[${res.status}] ${t.name}`);
      if (!res.ok) {
        const text = await res.text();
        console.log(`   Error: ${text}`);
      } else {
        const text = await res.text();
        console.log(`   Success response snippet: ${text.slice(0, 150)}...`);
      }
    } catch (e) {
      console.log(`[FAIL] ${t.name}: ${e.message}`);
    }
  }
}

pinpointTests();
