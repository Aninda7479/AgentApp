import { OmniRouteClient } from './omniroute-perfect-client.js';

async function testHallucination() {
  const client = new OmniRouteClient({ retryDelayMs: 3000, maxRetries: 3 });

  const testPrompts = [
    { title: 'Greeting Test', prompt: 'Say hello in a friendly way.' },
    { title: 'Coding Tips Test', prompt: 'List 3 concise tips for writing clean code.' },
    { title: 'Fact/Math Test', prompt: 'What is 25 * 4?' }
  ];

  for (const t of testPrompts) {
    console.log(`\n========================================`);
    console.log(`TEST: ${t.title}`);
    console.log(`PROMPT: "${t.prompt}"`);
    console.log(`========================================`);
    try {
      const res = await client.chatCompletion({
        messages: [{ role: 'user', content: t.prompt }]
      });

      console.log(`OUTPUT CONTENT:\n${res.content.trim()}`);
      
      // Check for repetitive word loops (like in the UI screenshot)
      const words = res.content.trim().split(/\s+/);
      let repetitiveWordLoops = false;
      for (let i = 0; i < words.length - 5; i++) {
        if (words[i] === words[i+1] && words[i] === words[i+2] && words[i] === words[i+3] && words[i] === words[i+4]) {
          repetitiveWordLoops = true;
          break;
        }
      }

      if (repetitiveWordLoops) {
        console.log(`⚠️ HALLUCINATION / REPETITION LOOP DETECTED!`);
      } else {
        console.log(`✓ OUTPUT IS COHERENT & CLEAN (No word loops)`);
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }

    // Pause between calls
    await new Promise(r => setTimeout(r, 4000));
  }
}

testHallucination();
