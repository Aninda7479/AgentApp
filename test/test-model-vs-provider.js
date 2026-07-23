import { OmniRouteClient } from './omniroute-perfect-client.js';

const API_BASE_URL = 'http://127.0.0.1:20128/v1';
const API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';

async function testModelVsProvider() {
  const client = new OmniRouteClient();
  const models = await client.listModels();
  
  // Pick a few diverse models from OmniRoute catalog
  const ocModels = models.filter(m => m.id.startsWith('oc/')).map(m => m.id).slice(0, 3);
  const otherModels = models.filter(m => !m.id.startsWith('oc/')).map(m => m.id).slice(0, 3);
  
  const testModels = [...ocModels, ...otherModels];
  console.log('Testing Models:', testModels);

  for (const modelId of testModels) {
    console.log(`\n==================================================`);
    console.log(`MODEL: ${modelId}`);
    console.log(`==================================================`);

    // Test A: Minimal payload (clean)
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Hi' }] })
      });
      console.log(`Minimal Payload (model + messages) status: ${res.status}`);
    } catch (e) {
      console.log(`Minimal Payload error: ${e.message}`);
    }

    // Test B: Payload with explicit stream: true
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Hi' }], stream: true })
      });
      console.log(`Payload with stream: true status: ${res.status}`);
    } catch (e) {
      console.log(`Payload with stream: true error: ${e.message}`);
    }

    // Test C: Payload with temperature: 0.7
    try {
      const res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Hi' }], temperature: 0.7 })
      });
      console.log(`Payload with temperature: 0.7 status: ${res.status}`);
    } catch (e) {
      console.log(`Payload with temperature: 0.7 error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 2500));
  }
}

testModelVsProvider();
