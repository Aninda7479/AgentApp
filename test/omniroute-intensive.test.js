import http from 'http';
import https from 'https';

const API_BASE_URL = 'http://127.0.0.1:20128/v1';
const API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';
const MODEL_NAME = 'oc/big-pickle';

function log(section, status, detail = '') {
  console.log(`[${status}] ${section}${detail ? ' - ' + detail : ''}`);
}

async function requestJson(endpoint, options = {}, payload = null) {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    ...(options.headers || {})
  };

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${errorText}`);
  }

  if (contentType.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}

async function testModelsList() {
  log('Test 1: List Models', 'RUNNING');
  try {
    const data = await requestJson('/models');
    const models = data.data || [];
    const found = models.find(m => m.id === MODEL_NAME || m.id?.includes('big-pickle'));
    log('Test 1: List Models', 'SUCCESS', `Total models: ${models.length}, ${MODEL_NAME} present: ${Boolean(found)}`);
    return found;
  } catch (err) {
    log('Test 1: List Models', 'FAILED', err.message);
    throw err;
  }
}

async function testBasicChatCompletion() {
  log('Test 2: Basic Chat Completion (Non-streaming)', 'RUNNING');
  try {
    const payload = {
      model: MODEL_NAME,
      messages: [
        { role: 'user', content: 'Say "Hello, OmniRoute!" and state what model you are.' }
      ],
      max_tokens: 100,
      temperature: 0.7
    };
    const response = await requestJson('/chat/completions', { method: 'POST' }, payload);
    const content = response?.choices?.[0]?.message?.content || '';
    const finishReason = response?.choices?.[0]?.finish_reason;
    log('Test 2: Basic Chat Completion', 'SUCCESS', `Response: "${content.trim()}" (Finish: ${finishReason})`);
    return response;
  } catch (err) {
    log('Test 2: Basic Chat Completion', 'FAILED', err.message);
    throw err;
  }
}

async function testStreamingChatCompletion() {
  log('Test 3: Streaming Chat Completion', 'RUNNING');
  try {
    const url = `${API_BASE_URL}/chat/completions`;
    const payload = {
      model: MODEL_NAME,
      messages: [
        { role: 'user', content: 'Count from 1 to 5 slowly with spaces.' }
      ],
      stream: true
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            accumulatedText += delta;
            chunkCount++;
          } catch (e) {
            // Ignore parse errors on partial lines
          }
        }
      }
    }

    log('Test 3: Streaming Chat Completion', 'SUCCESS', `Received ${chunkCount} SSE chunks. Text: "${accumulatedText.trim()}"`);
  } catch (err) {
    log('Test 3: Streaming Chat Completion', 'FAILED', err.message);
    throw err;
  }
}

async function testSystemPromptAndMultiTurn() {
  log('Test 4: System Prompt & Multi-Turn Conversation', 'RUNNING');
  try {
    const payload = {
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that answers in exactly one sentence.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is its most famous landmark?' }
      ]
    };
    const response = await requestJson('/chat/completions', { method: 'POST' }, payload);
    const content = response?.choices?.[0]?.message?.content || '';
    log('Test 4: Multi-Turn Conversation', 'SUCCESS', `Response: "${content.trim()}"`);
  } catch (err) {
    log('Test 4: Multi-Turn Conversation', 'FAILED', err.message);
    throw err;
  }
}

async function testToolCalling() {
  log('Test 5: Tool / Function Calling Support', 'RUNNING');
  try {
    const payload = {
      model: MODEL_NAME,
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo right now?' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_current_weather',
            description: 'Get the current weather for a given location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'The city and state/country' },
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
              },
              required: ['location']
            }
          }
        }
      ]
    };
    const response = await requestJson('/chat/completions', { method: 'POST' }, payload);
    const message = response?.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      log('Test 5: Tool Calling Support', 'SUCCESS', `Tool call detected: ${toolCalls[0].function.name}(${toolCalls[0].function.arguments})`);
    } else {
      log('Test 5: Tool Calling Support', 'PASSED (NO TOOL CALL TRIGGERED)', `Content response: "${message?.content?.slice(0, 100)}..."`);
    }
  } catch (err) {
    log('Test 5: Tool Calling Support', 'FAILED / UNHANDLED BY MODEL', err.message);
  }
}

async function testErrorHandling() {
  log('Test 6: Invalid API Key / Error Handling', 'RUNNING');
  try {
    const res = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-invalid-key-test'
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    log('Test 6: Invalid API Key Handling', res.status >= 400 ? 'SUCCESS' : 'WARNING', `HTTP status: ${res.status}`);
  } catch (err) {
    log('Test 6: Invalid API Key Handling', 'SUCCESS', `Error properly caught: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log(`Starting Intensive OmniRoute Provider Tests for ${MODEL_NAME}`);
  console.log('====================================================\n');
  
  try {
    await testModelsList();
    await testBasicChatCompletion();
    await testStreamingChatCompletion();
    await testSystemPromptAndMultiTurn();
    await testToolCalling();
    await testErrorHandling();
    console.log('\n====================================================');
    console.log('ALL TESTS COMPLETED!');
    console.log('====================================================');
  } catch (err) {
    console.error('\nTest Suite Failed:', err);
    process.exit(1);
  }
}

runAllTests();
