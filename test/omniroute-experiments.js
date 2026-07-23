const API_BASE_URL = 'http://127.0.0.1:20128/v1';
const API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';
const MODEL_NAME = 'oc/big-pickle';

async function testExperiments() {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  };

  const tests = [
    { name: '1. Default minimal (no stream flag)', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }] } },
    { name: '2. Explicit stream: false', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], stream: false } },
    { name: '3. Explicit stream: true', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], stream: true } },
    { name: '4. With max_tokens only', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 } },
    { name: '5. With temperature only', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], temperature: 0.7 } },
    { name: '6. With max_tokens + temperature', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100, temperature: 0.7 } },
    { name: '7. With max_tokens + temperature + stream: true', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100, temperature: 0.7, stream: true } },
    { name: '8. With max_tokens + temperature + stream: false', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100, temperature: 0.7, stream: false } },
    { name: '9. With reasoning_effort: medium', body: { model: MODEL_NAME, messages: [{ role: 'user', content: 'Hi' }], reasoning_effort: 'medium' } },
    { name: '10. Tool calling', body: {
        model: MODEL_NAME,
        messages: [{ role: 'user', content: 'What is weather in London?' }],
        tools: [{
          type: 'function',
          function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
        }]
      }
    }
  ];

  for (const t of tests) {
    console.log(`\n--- Test: ${t.name} ---`);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(t.body)
      });
      console.log(`Status: ${res.status} (${res.statusText})`);
      const contentType = res.headers.get('content-type') || '';
      console.log(`Content-Type: ${contentType}`);
      const text = await res.text();
      console.log(`Body Snippet: ${text.slice(0, 250)}`);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

testExperiments();
