import { PCBGraph, ComponentInstance, Net, PowerRail, ComponentPin, PinEndpoint } from './types';
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
  customPromptInstructions:
    'You are an expert ECAD and hardware engineering co-pilot. Assist in component selection, pinout allocation, power rail budgeting, and electrical rules compliance.',
};

/**
 * Builds the comprehensive ECAD hardware engineering system prompt for LLM inference
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
      value: c.value,
      pins: c.pins.map((p) => ({ number: p.number, name: p.name, type: p.type, net: p.connectedNet })),
    })),
    nets: currentGraph.nets.map((n) => ({ id: n.id, name: n.name, netClass: n.netClass, voltage: n.voltage })),
    powerRails: currentGraph.powerRails.map((r) => ({ id: r.id, voltage: r.voltage, maxCurrent_mA: r.maxCurrent_mA })),
  };

  return `You are an expert Electronic Design Automation (ECAD) and Hardware Engineering AI Co-Pilot.
You design, synthesize, modify, audit, and export electronic circuit schematics to KiCad, Altium Designer, EasyEDA, and SKiDL.

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
1. When asked to design, synthesize, add, connect, or modify any circuit, power supply, MCU subsystem, audio amplifier, sensor, or discrete stage, you MUST provide insightful engineering rationale in clean markdown and output a single JSON code block at the very end of your response.
2. The JSON code block MUST use this structure:
\`\`\`json
{
  "action": "create_circuit" | "modify_circuit" | "add_subsystem",
  "explanation": "Summary of additions and modifications made to the schematic",
  "addComponents": [
    {
      "id": "U1",
      "name": "Component Name / Model",
      "mpn": "EXACT_PART_NUMBER",
      "manufacturer": "Manufacturer",
      "package": "SOIC-8 / QFN-32 / 0402 / SOT-23 / Module / HDR-4",
      "category": "MCU" | "Power" | "Sensor" | "Interface" | "Passive" | "Discrete" | "Connector",
      "value": "Component electrical rating / value",
      "lcscPart": "Optional LCSC / Distributor Part #",
      "description": "Functional description of the part",
      "pins": [
        { "number": "1", "name": "PIN_NAME", "type": "power_in" | "power_out" | "input" | "output" | "passive" | "bidirectional", "connectedNet": "NET_NAME", "voltageLevel": 3.3 }
      ]
    }
  ],
  "addPowerRails": [
    { "id": "+3V3", "voltage": 3.3, "maxCurrent_mA": 1000, "sourceComponentId": "U_REG", "sourcePinNumber": "VOUT" }
  ],
  "connectPins": [
    { "componentId": "U1", "pinNumber": "1", "netId": "+3V3", "netClass": "power", "voltage": 3.3 }
  ],
  "removeComponentIds": []
}
\`\`\`
3. Always provide real manufacturer part numbers (MPNs), standard industry packages, complete pinout allocations with connectedNet definitions, power rails, decoupling capacitors, and protection circuitry.
4. If the user's prompt is an informational question or design review without schematic modifications, reply with technical markdown without the JSON code block.`;
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
  const cleanModelId = (rawModelId || '')
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
    const targetModel = cleanModelId.startsWith('gemini') ? cleanModelId : `gemini-${cleanModelId || '2.5-flash'}`;
    const url = `${baseUrl}/models/${targetModel}:generateContent?key=${apiKey}`;

    const requestPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    };

    let res = await browserSafeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!res.ok) {
      const candidates = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const fallbackModel of candidates) {
        if (targetModel === fallbackModel) continue;
        const fallbackUrl = `${baseUrl}/models/${fallbackModel}:generateContent?key=${apiKey}`;
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
          // continue
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

  // 2. Anthropic Claude Provider
  if (providerType.includes('anthropic') || providerType.includes('claude')) {
    const apiKey = activeProvider.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Anthropic API key is missing. Please set it in Settings → Providers.');
    }
    const baseUrl = (activeProvider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const targetModel = cleanModelId || 'claude-3-7-sonnet-20250219';
    const url = `${baseUrl}/v1/messages`;

    const res = await browserSafeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: targetModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const textPart = data.content?.find((c: any) => c.type === 'text')?.text || '';
    return textPart;
  }

  // 3. OpenAI / Ollama / Groq / OpenRouter / DeepSeek / Compatible Provider
  const apiKey = activeProvider.apiKey?.trim() || '';
  const baseUrl = (activeProvider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

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
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${activeProvider.name} API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const textOutput = data.choices?.[0]?.message?.content || '';
  if (!textOutput) {
    throw new Error(`No response returned from ${activeProvider.name}.`);
  }
  return textOutput;
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

    // Determine if we start fresh or mutate
    const isNewCircuit = payload.action === 'create_circuit';
    const g: PCBGraph = isNewCircuit
      ? {
          metadata: {
            ...initialGraph.metadata,
            name: payload.projectName || initialGraph.metadata?.name || 'Synthesized Circuit Design',
            updated: new Date().toISOString().split('T')[0],
          },
          powerRails: [],
          components: [],
          nets: [],
          ercReport: [],
        }
      : JSON.parse(JSON.stringify(initialGraph));

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
              pin.type?.includes('power') ? 'power' : 'signal',
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
 * Pure Model-Driven Hardware AI Synthesis Engine
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

  try {
    const rawLlmOutput = await callLiveModel(text, currentGraph, settings);
    const { cleanReply, updatedGraph, actionDiff } = applyCircuitModifications(rawLlmOutput, currentGraph);

    if (updatedGraph) {
      return {
        reply: cleanReply,
        graph: updatedGraph,
        actionDiff,
      };
    }

    return { reply: cleanReply };
  } catch (liveError: any) {
    const errorMessage = liveError?.message || String(liveError);

    return {
      reply: `⚠️ **AI Hardware Inference Error**: ${errorMessage}

**Troubleshooting Steps**:
1. Check that your API key is valid and configured in **Settings → Providers**.
2. Make sure your active model selection has available quota.
3. Click the model chip in the top right of this panel to switch to another active provider.`,
    };
  }
}
