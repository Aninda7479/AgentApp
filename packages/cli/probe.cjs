const { SuperAgentEngine, SettingsStorage } = require('@superagent/core');
const { resolveConnection } = require('./dist/engine.js');
const { prepareAttachments } = require('./dist/attachments.js');

(async () => {
  const provider = 'openai';
  const model = 'openrouter/tencent/hy3:free';
  let prov = provider;
  let mod = model;
  if (!provider && mod && mod.includes('/')) {
    const i = mod.indexOf('/');
    prov = mod.slice(0, i);
    mod = mod.slice(i + 1);
  }
  const conn = resolveConnection(prov, mod);
  console.log('conn', conn.provider, conn.model, 'key?', !!conn.apiKey);
  const engine = new SuperAgentEngine({ provider: conn.provider, apiKey: conn.apiKey, model: conn.model, projectRoot: process.cwd() });
  const { cleanText } = await prepareAttachments("What is india's capital");
  console.log('cleanText=', JSON.stringify(cleanText));
  const chunks = [];
  const onEvent = (event) => {
    console.log('EVT', event.type, JSON.stringify(event.content));
    if (event.type === 'token' && event.content) chunks.push(event.content);
  };
  const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
  try {
    await engine.run(cleanText, onEvent, []);
  } catch (e) {
    console.log('THROW', e.message);
  }
  clearTimeout(t);
  console.log('JOIN:', chunks.join(''));
})();
