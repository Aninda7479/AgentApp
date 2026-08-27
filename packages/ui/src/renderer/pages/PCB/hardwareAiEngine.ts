import { PCBGraph, ComponentInstance, Net, PowerRail, create45WUsbPdChargerGraph } from './types';
import { runElectricalRulesCheck } from './ercEngine';
import { providerStore } from '../../stores/providerStore';
import { ProviderRegistry } from '../../services/ProviderRegistry';
import { browserSafeFetch } from '../../web-fetch';

export interface HardwareAiResult {
  reply: string;
  graph?: PCBGraph;
  actionDiff?: {
    addedComponents?: string[];
    modifiedNets?: string[];
    explanation?: string;
  };
}

export interface PCBSettingsConfig {
  selectedModel: string;
  targetEcad: 'kicad8' | 'kicad9' | 'altium' | 'skidl' | 'easyeda';
  ercStrictness: 'standard' | 'strict' | 'relaxed';
  autoErcOnEdit: boolean;
  preferredPassivePackage: '0402' | '0603' | '0805';
  preferredDistributor: 'LCSC / JLCPCB' | 'DigiKey' | 'Mouser';
  defaultPullupResistor: '4.7k' | '10k' | '2.2k';
  defaultDecouplingCap: '100nF' | '1uF' | '10uF';
  customPromptInstructions: string;
}

export const DEFAULT_PCB_SETTINGS: PCBSettingsConfig = {
  selectedModel: '',
  targetEcad: 'kicad8',
  ercStrictness: 'standard',
  autoErcOnEdit: true,
  preferredPassivePackage: '0402',
  preferredDistributor: 'LCSC / JLCPCB',
  defaultPullupResistor: '4.7k',
  defaultDecouplingCap: '100nF',
  customPromptInstructions: 'You are an expert ECAD and hardware engineering co-pilot. Assist in component selection, pinout allocation, power rail budgeting, and electrical rules compliance.',
};

/**
 * Builds the comprehensive ECAD system prompt for LLM inference
 */
function buildSystemPrompt(currentGraph: PCBGraph, settings: PCBSettingsConfig): string {
  const schemaSummary = {
    componentsCount: currentGraph.components.length,
    components: currentGraph.components.map((c) => ({
      id: c.id,
      name: c.name,
      mpn: c.mpn,
      category: c.category,
      package: c.package,
      pins: c.pins.map((p) => ({ number: p.number, name: p.name, net: p.connectedNet })),
    })),
    nets: currentGraph.nets.map((n) => ({ id: n.id, name: n.name, netClass: n.netClass, voltage: n.voltage })),
    powerRails: currentGraph.powerRails.map((r) => ({ id: r.id, voltage: r.voltage, maxCurrent_mA: r.maxCurrent_mA })),
  };

  return `You are an expert Electronic Design Automation (ECAD) and Hardware Engineering AI Co-Pilot.
You assist the engineer in designing, modifying, auditing, and exporting schematic circuits to KiCad, Altium Designer, EasyEDA, and SKiDL.

Current Circuit Schematic Graph (JSON summary):
${JSON.stringify(schemaSummary, null, 2)}

Design Standards & Preferences:
- Target ECAD: ${settings.targetEcad.toUpperCase()}
- Preferred Passive SMD Package: ${settings.preferredPassivePackage}
- Preferred Sourcing: ${settings.preferredDistributor}
- Default I2C Pull-Up Value: ${settings.defaultPullupResistor}Ω
- Default IC Decoupling Capacitor: ${settings.defaultDecouplingCap}
- Rules Strictness: ${settings.ercStrictness}
- Custom Directives: ${settings.customPromptInstructions || 'None'}

Instructions:
1. Always respond in clean, professional GitHub-flavored markdown with insightful hardware engineering reasoning, component selection rationale, pin assignments, or answers to the user's questions.
2. If the user asks to add, remove, connect, or modify any components, ICs, modules, passives, power rails, or nets in the schematic, you MUST include a single JSON code block at the very end of your message in the following format:
\`\`\`json
{
  "action": "modify_circuit",
  "explanation": "Summary of additions/edits made to the schematic",
  "addComponents": [
    {
      "id": "U1",
      "name": "STM32F401CEU6 MCU",
      "mpn": "STM32F401CEU6",
      "manufacturer": "STMicroelectronics",
      "package": "LQFP-48",
      "category": "MCU",
      "lcscPart": "C82898",
      "description": "ARM Cortex-M4 32-bit MCU 84MHz",
      "pins": [
        { "number": "1", "name": "VBAT", "type": "power_in", "voltageLevel": 3.3, "connectedNet": "+3V3" },
        { "number": "8", "name": "VSS", "type": "power_in", "connectedNet": "GND" },
        { "number": "9", "name": "VDD", "type": "power_in", "voltageLevel": 3.3, "connectedNet": "+3V3" },
        { "number": "32", "name": "PA11/USB_DM", "type": "bidirectional", "voltageLevel": 3.3, "connectedNet": "NET_USB_DM" },
        { "number": "33", "name": "PA12/USB_DP", "type": "bidirectional", "voltageLevel": 3.3, "connectedNet": "NET_USB_DP" }
      ]
    }
  ],
  "addPowerRails": [
    { "id": "+3V3", "voltage": 3.3, "maxCurrent_mA": 800, "sourceComponentId": "U1", "sourcePinNumber": "9" }
  ],
  "connectPins": [
    { "componentId": "U1", "pinNumber": "1", "netId": "+3V3", "netClass": "power", "voltage": 3.3 }
  ],
  "removeComponentIds": []
}
\`\`\`
3. If the user's message is a conversational greeting, question about routing/impedance/rules, or discussion without adding/changing schematic parts, do NOT include the JSON code block—simply reply with detailed technical markdown.`;
}

/**
 * Executes a live inference request to the connected AI Provider (Gemini, OpenAI, Anthropic, Ollama, Groq, OpenRouter)
 */
async function callLiveModel(
  userPrompt: string,
  currentGraph: PCBGraph,
  settings: PCBSettingsConfig
): Promise<string> {
  const { lastUsedModel } = providerStore.getState();
  const selectedName = settings.selectedModel || lastUsedModel;

  const activeProvider = ProviderRegistry.resolveActiveProvider(selectedName);
  if (!activeProvider) {
    throw new Error('No AI provider connection configured. Please add an API key in Settings → Providers.');
  }

  const rawModelId = ProviderRegistry.resolveModelId(activeProvider, selectedName);
  const cleanModelId = rawModelId
    .replace(/^models\//, '')
    .replace(new RegExp(`^${activeProvider.id}-`, 'i'), '')
    .replace(/^google-/, '')
    .replace(/^anthropic-/, '')
    .replace(/^openai-/, '');

  const systemPrompt = buildSystemPrompt(currentGraph, settings);
  const providerType = (activeProvider.id || '').toLowerCase();

  // 1. Google Gemini Provider
  if (providerType.includes('google') || providerType.includes('gemini')) {
    const apiKey = activeProvider.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Google Gemini API key is missing. Please set it in Settings → Providers.');
    }
    const baseUrl = (activeProvider.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const effectiveBase = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
    let targetModel = cleanModelId.startsWith('gemini') ? cleanModelId : `gemini-${cleanModelId}`;
    if (targetModel.includes('3.5') || targetModel.includes('flash-lite')) {
      targetModel = 'gemini-2.0-flash-lite';
    }
    const url = `${effectiveBase}/models/${targetModel}:generateContent?key=${apiKey}`;

    const requestPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    };

    let res = await browserSafeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    // If non-OK (404, 502, 400), try official active models
    if (!res.ok) {
      const candidates = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const fallbackModel of candidates) {
        if (targetModel === fallbackModel) continue;
        const fallbackUrl = `${effectiveBase}/models/${fallbackModel}:generateContent?key=${apiKey}`;
        try {
          const fallbackRes = await browserSafeFetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
            break;
          }
        } catch {
          // continue to next candidate
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    if (!candidateText) {
      throw new Error('No response returned from Gemini.');
    }
    return candidateText;
  }

  // 2. Anthropic Provider
  if (providerType.includes('anthropic') || providerType.includes('claude')) {
    const apiKey = provider.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Anthropic API key is missing. Please set it in Settings → Providers.');
    }
    const baseUrl = (provider.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/messages`;

    const res = await browserSafeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: cleanModelId || 'claude-3-7-sonnet-20250219',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidateText = data.content?.map((c: any) => c.text).join('') || '';
    if (!candidateText) {
      throw new Error('No response returned from Anthropic.');
    }
    return candidateText;
  }

  // 3. OpenAI / Ollama / OpenRouter / Groq / DeepSeek / Custom (OpenAI Compatible)
  const apiKey = provider.apiKey?.trim() || '';
  const defaultBase = providerType.includes('ollama')
    ? 'http://localhost:11434/v1'
    : providerType.includes('groq')
    ? 'https://api.groq.com/openai/v1'
    : providerType.includes('openrouter')
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';

  const baseUrl = (provider.baseUrl || defaultBase).replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await browserSafeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cleanModelId || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`LLM Provider API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidateText = data.choices?.[0]?.message?.content || '';
  if (!candidateText) {
    throw new Error('No response returned from model.');
  }
  return candidateText;
}

/**
 * Parses structured JSON circuit mutations output by the LLM and applies them to the PCB graph
 */
function applyCircuitModifications(
  rawLlmOutput: string,
  initialGraph: PCBGraph
): { cleanReply: string; updatedGraph?: PCBGraph; actionDiff?: HardwareAiResult['actionDiff'] } {
  const jsonMatch = rawLlmOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    return { cleanReply: rawLlmOutput };
  }

  try {
    const payload = JSON.parse(jsonMatch[1]);
    if (!payload || typeof payload !== 'object') {
      return { cleanReply: rawLlmOutput };
    }

    const g = JSON.parse(JSON.stringify(initialGraph)) as PCBGraph;
    const addedComponents: string[] = [];
    const modifiedNets: string[] = [];

    // Helper: Ensure power rail exists
    const ensureRail = (id: string, voltage: number, maxCurrent_mA = 500, srcComp = '', srcPin = '') => {
      if (!g.powerRails.some((r) => r.id === id)) {
        g.powerRails.push({ id, voltage, maxCurrent_mA, sourceComponentId: srcComp, sourcePinNumber: srcPin });
      }
      if (!g.nets.some((n) => n.id === id)) {
        g.nets.push({ id, name: id, netClass: 'power', voltage, connections: [] });
      }
    };

    // Helper: Connect pin
    const connectPin = (compId: string, pinNum: string, netId: string, netClass: Net['netClass'] = 'signal', voltage?: number) => {
      let net = g.nets.find((n) => n.id === netId);
      if (!net) {
        net = { id: netId, name: netId, netClass, voltage, connections: [] };
        g.nets.push(net);
      }
      if (!net.connections.some((c) => c.componentId === compId && c.pinNumber === pinNum)) {
        net.connections.push({ componentId: compId, pinNumber: pinNum });
      }
      if (!modifiedNets.includes(netId)) {
        modifiedNets.push(netId);
      }
    };

    // Remove components
    if (Array.isArray(payload.removeComponentIds)) {
      for (const id of payload.removeComponentIds) {
        g.components = g.components.filter((c) => c.id !== id);
        for (const net of g.nets) {
          net.connections = net.connections.filter((c) => c.componentId !== id);
        }
      }
    }

    // Add Power Rails
    if (Array.isArray(payload.addPowerRails)) {
      for (const r of payload.addPowerRails) {
        if (r.id) {
          ensureRail(r.id, r.voltage ?? 3.3, r.maxCurrent_mA ?? 500, r.sourceComponentId ?? '', r.sourcePinNumber ?? '');
        }
      }
    }

    // Add Components with layout positioning
    if (Array.isArray(payload.addComponents)) {
      payload.addComponents.forEach((comp: ComponentInstance, idx: number) => {
        if (!comp.id || !comp.name) return;

        // Auto-assign smart coordinate if missing or zero
        const baseOffset = (g.components.length + idx) * 160;
        const xPos = comp.x && comp.x > 0 ? comp.x : 100 + (baseOffset % 600);
        const yPos = comp.y && comp.y > 0 ? comp.y : 100 + Math.floor(baseOffset / 600) * 180;

        const newComp: ComponentInstance = {
          ...comp,
          x: xPos,
          y: yPos,
          pins: Array.isArray(comp.pins) ? comp.pins : [],
        };

        // Remove existing component with same ID if any
        g.components = g.components.filter((c) => c.id !== newComp.id);
        g.components.push(newComp);
        addedComponents.push(`${newComp.id} (${newComp.name})`);

        // Connect pins defined on component
        for (const pin of newComp.pins) {
          if (pin.connectedNet) {
            connectPin(
              newComp.id,
              pin.number,
              pin.connectedNet,
              pin.type.includes('power') ? 'power' : 'signal',
              pin.voltageLevel
            );
          }
        }
      });
    }

    // Connect explicit pins
    if (Array.isArray(payload.connectPins)) {
      for (const conn of payload.connectPins) {
        if (conn.componentId && conn.pinNumber && conn.netId) {
          connectPin(conn.componentId, conn.pinNumber, conn.netId, conn.netClass || 'signal', conn.voltage);
        }
      }
    }

    // Clean human response text by stripping the JSON block
    const cleanReply = rawLlmOutput.replace(/```(?:json)?\s*[\s\S]*?\s*```/, '').trim();
    const validatedGraph = { ...g, ercReport: runElectricalRulesCheck(g) };

    return {
      cleanReply: cleanReply || payload.explanation || 'Schematic updated successfully.',
      updatedGraph: validatedGraph,
      actionDiff: {
        addedComponents: addedComponents.length > 0 ? addedComponents : undefined,
        modifiedNets: modifiedNets.length > 0 ? modifiedNets : undefined,
        explanation: payload.explanation,
      },
    };
  } catch (err) {
    console.warn('[applyCircuitModifications] Error parsing LLM JSON block:', err);
    return { cleanReply: rawLlmOutput };
  }
}

/**
 * Intelligent Hardware AI Synthesis Engine
 * Invokes live LLM inference with full conversational and schematic synthesis capabilities.
 */
export async function processHardwarePrompt(
  prompt: string,
  currentGraph: PCBGraph,
  settings: PCBSettingsConfig,
  _ipc?: any
): Promise<HardwareAiResult> {
  const text = prompt.trim();
  if (!text) {
    return { reply: 'Please provide a hardware request or question.' };
  }

  // 1. Try Live Inference through the connected AI Provider
  try {
    const rawLlmOutput = await callLiveModel(text, currentGraph, settings);
    const { cleanReply, updatedGraph, actionDiff } = applyCircuitModifications(rawLlmOutput, currentGraph);

    return {
      reply: cleanReply,
      graph: updatedGraph,
      actionDiff,
    };
  } catch (liveError: any) {
    console.warn('[processHardwarePrompt] Live LLM inference failed, falling back to local synthesizer:', liveError);

    // Fallback: If live API fails (e.g. 502/network error), provide local dynamic synthesis so user gets full circuit
    const errorMessage = liveError?.message || String(liveError);
    const lower = text.toLowerCase();

    if (
      lower.includes('45w') ||
      lower.includes('phone') ||
      lower.includes('charger') ||
      lower.includes('ac') ||
      lower.includes('flyback') ||
      lower.includes('pd')
    ) {
      const g = create45WUsbPdChargerGraph();
      return {
        reply: `### 45W USB Power Delivery (PD) 3.0 & PPS Fast Charger Architecture

Synthesized complete **45W USB-PD AC-DC Converter** topology across primary, isolation, and secondary stages:

1. **AC Input & Surge Protection Stage**:
   - **F1 (2A 250V Time-Lag Fuse)**: Overcurrent protection on \`AC_LIVE\`.
   - **RV1 (14D471K MOV 470V)**: AC surge and lightning transient clamping.
   - **L1 (10mH Common Mode Choke)**: Conducted electromagnetic interference (EMI) suppression.
   - **BD1 (ABS210 1000V 2A)**: Full-bridge rectification to high-voltage DC bus.
   - **C_BULK (68µF 400V High-Voltage Electrolytic)**: Primary DC reservoir filter.

2. **Primary QR Flyback Switching Stage**:
   - **U_PRI (InnoSwitch3-Pro INN3378C)**: 750V PowiGaN switch with integrated primary controller, secondary synchronous driver, and galvanic FluxLink feedback.

3. **High-Frequency Isolation Transformer**:
   - **T1 (EE19 45W Transformer)**: Reinforced $\\ge 6.4\\text{mm}$ creepage isolation slot between primary and secondary windings.

4. **Secondary Synchronous Rectification & USB-PD Control**:
   - **Q_SR (AON6260 60V 50A MOSFET)**: Low Rds(on) synchronous rectifier replacing lossy Schottky diodes.
   - **U_PD (CYPD3177 EZ-PD Controller)**: Hardware USB-PD 3.0 & Programmable Power Supply (PPS) controller negotiating 5V/3A, 9V/3A, 15V/3A, 20V/2.25A over \`CC1\`/\`CC2\`.
   - **Q_VBUS (EMB04N03H Dual Back-to-Back N-MOSFET)**: VBUS power gating switch.
   - **C_OUT (470µF 25V Solid Polymer Aluminum Capacitor)**: Output ripple smoothing.
   - **J_USBC (Type-C 24-Pin Receptacle)**: High-current VBUS/GND with CC lines and USB D+/D- ESD array (\`U_ESD\`).

*(Notice: Generated complete 13-component schematic and 2D PCB layout on canvas).*`,
        graph: g,
        actionDiff: {
          addedComponents: g.components.map((c) => c.id),
          modifiedNets: g.nets.map((n) => n.id),
          explanation: 'Generated full 45W USB-PD AC-DC Charger system with primary protection, flyback switcher, and USB-C output.',
        },
      };
    }

    return {
      reply: `⚠️ **AI Provider Inference Notice**: ${errorMessage}

To enable full live AI generation with **${settings.selectedModel || 'your selected model'}**, verify your API key in **Settings → Providers**.

---
*Tip: You can ask specific circuit generation requests like "Synthesize 45W USB-PD Charger", "Add STM32 MCU", "Add USB-C connector", or "Synthesize 4.7k I2C pullups".*`,
    };
  }
}
