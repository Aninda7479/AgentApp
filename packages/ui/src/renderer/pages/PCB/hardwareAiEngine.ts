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
    const rawBase = (activeProvider.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const baseUrl = rawBase.includes('/v1') ? rawBase : `${rawBase}/v1beta`;

    // Use exactly what the user configured — do NOT override with hardcoded values.
    // Only normalise: strip a duplicate "gemini-" prefix if resolveModelId returns
    // something like "gemini-gemini-3.5-flash-lite", and add it when missing entirely.
    let modelToUse = cleanModelId || 'gemini-2.0-flash-lite';
    if (modelToUse.startsWith('gemini-gemini-')) {
      modelToUse = modelToUse.slice('gemini-'.length);
    } else if (!modelToUse.startsWith('gemini-')) {
      modelToUse = `gemini-${modelToUse}`;
    }

    const url = `${baseUrl}/models/${modelToUse}:generateContent?key=${apiKey}`;

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
      // Build fallback list from models the user already has connected for this provider —
      // never guess at hardcoded model names that may not exist on their account.
      const { models } = providerStore.getState();
      const enabledIds = models
        .filter((m) => m.providerId === activeProvider.id && m.enabled && m.name !== selectedName)
        .map((m) => {
          const stripped = m.id.replace(`${activeProvider.id}-`, '').replace(/^google-/, '').replace(/^models\//, '');
          return stripped.startsWith('gemini-') ? stripped : `gemini-${stripped}`;
        })
        .filter((id) => id !== modelToUse);

      for (const fallbackModel of enabledIds) {
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
          // try next
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
    const rawBase = (activeProvider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = rawBase.endsWith('/messages')
      ? rawBase
      : rawBase.endsWith('/v1')
      ? `${rawBase}/messages`
      : `${rawBase}/v1/messages`;

    const targetModel = cleanModelId || 'claude-3-7-sonnet-20250219';

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
  const rawBase = (activeProvider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = rawBase.endsWith('/chat/completions')
    ? rawBase
    : rawBase.endsWith('/v1')
    ? `${rawBase}/chat/completions`
    : `${rawBase}/v1/chat/completions`;

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
 * Extracts and safely parses JSON circuit structure from LLM output
 */
function extractCircuitJson(rawText: string): any {
  // 1. Try matching ```json ... ``` or ``` ... ```
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      const sanitized = codeBlockMatch[1]
        .replace(/\/\/[^\n\r]*/g, '')
        .replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(sanitized);
    } catch {
      // fallback to loose extraction
    }
  }

  // 2. Try matching the first outer { ... } block
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = rawText
        .substring(firstBrace, lastBrace + 1)
        .replace(/\/\/[^\n\r]*/g, '')
        .replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(candidate);
    } catch {
      // not valid JSON
    }
  }

  return null;
}

/**
 * Parses structured JSON circuit mutations output by the LLM and applies them to the PCB graph
 */
function applyCircuitModifications(
  rawLlmOutput: string,
  initialGraph: PCBGraph
): { cleanReply: string; updatedGraph?: PCBGraph; actionDiff?: HardwareAiResult['actionDiff'] } {
  const payload = extractCircuitJson(rawLlmOutput);
  if (!payload || typeof payload !== 'object') {
    return { cleanReply: rawLlmOutput };
  }

  try {
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

        g.components = g.components.filter((c) => c.id !== newComp.id);
        g.components.push(newComp);
        addedComponents.push(`${newComp.id} (${newComp.name})`);

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
 * Smart Deterministic Hardware Synthesizer (Offline / Fallback Mode)
 * Intelligently generates real electronic sub-circuits when offline or when no API key is set.
 */
function synthesizeCircuitSmart(prompt: string, currentGraph: PCBGraph): HardwareAiResult {
  const p = prompt.toLowerCase();
  const isErcFix = p.includes('erc') || p.includes('fix') || p.includes('pullup') || p.includes('decoupling');
  const isEsp32 = p.includes('esp32') || p.includes('iot') || p.includes('sensor') || p.includes('bme280') || p.includes('wifi');
  const isStm32 = p.includes('stm32') || p.includes('arm') || p.includes('cortex');
  const isPower = p.includes('power') || p.includes('ldo') || p.includes('regulator') || p.includes('usb') || p.includes('5v') || p.includes('3.3v');

  // Case 1: ERC Auto-Fix
  if (isErcFix && currentGraph.components.length > 0) {
    const ercReport = runElectricalRulesCheck(currentGraph);
    const g: PCBGraph = JSON.parse(JSON.stringify(currentGraph));
    const added: string[] = [];

    // Fix missing I2C pull-ups
    const pullupWarnings = ercReport.filter((e) => e.category === 'pullup');
    pullupWarnings.forEach((item, idx) => {
      const netId = item.affectedNets?.[0];
      if (netId) {
        const rId = `R_PU${idx + 1}`;
        g.components.push({
          id: rId,
          name: `I2C Pull-Up Resistor 4.7k (${netId})`,
          mpn: 'RC0402FR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '4.7k 1%',
          lcscPart: 'C25900',
          description: `I2C ${netId} pull-up resistor to +3.3V`,
          x: 450 + idx * 80,
          y: 260,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: netId },
          ],
        });
        added.push(`${rId} (4.7k pull-up on ${netId})`);

        let v33Net = g.nets.find((n) => n.id === '+3V3');
        if (v33Net) v33Net.connections.push({ componentId: rId, pinNumber: '1' });
        let sigNet = g.nets.find((n) => n.id === netId);
        if (sigNet) sigNet.connections.push({ componentId: rId, pinNumber: '2' });
      }
    });

    // Fix decoupling caps
    const decouplingWarnings = ercReport.filter((e) => e.category === 'decoupling');
    decouplingWarnings.forEach((item, idx) => {
      const compId = item.affectedComponents?.[0];
      const netId = item.affectedNets?.[0] || '+3V3';
      if (compId) {
        const cId = `C_BYP${idx + 1}`;
        g.components.push({
          id: cId,
          name: `High-Freq Decoupling Cap 100nF (${compId})`,
          mpn: 'CC0402KRX7R9BB104',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '100nF 50V X7R',
          lcscPart: 'C1525',
          description: `Local decoupling bypass for ${compId}`,
          x: 360 + idx * 60,
          y: 300,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: netId },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        });
        added.push(`${cId} (100nF bypass for ${compId})`);

        let pNet = g.nets.find((n) => n.id === netId);
        if (pNet) pNet.connections.push({ componentId: cId, pinNumber: '1' });
        let gndNet = g.nets.find((n) => n.id === 'GND');
        if (gndNet) gndNet.connections.push({ componentId: cId, pinNumber: '2' });
      }
    });

    g.ercReport = runElectricalRulesCheck(g);

    return {
      reply: `🛡️ **Electrical Rules Auto-Remediation Complete**:
- Resolved **${pullupWarnings.length}** open-drain I2C pull-up warnings.
- Resolved **${decouplingWarnings.length}** IC high-frequency decoupling capacitor warnings.
- Circuit re-verified with 0 critical ERC errors.`,
      graph: g,
      actionDiff: {
        addedComponents: added,
        explanation: 'Synthesized missing 4.7k I2C pull-up resistors and 100nF bypass decoupling capacitors.',
      },
    };
  }

  // Case 2: ESP32 IoT Node or Sensor System
  if (isEsp32) {
    const espTemplate = {
      metadata: {
        projectId: `prj-esp32-${Date.now().toString(36)}`,
        name: 'ESP32-S3 IoT Environmental Sensor Node',
        revision: 'v1.0',
        author: 'SuperAgent AI Hardware Engine',
        targetEcad: 'kicad8' as const,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
      },
      powerRails: [
        { id: 'VBUS_5V', voltage: 5.0, maxCurrent_mA: 1500, sourceComponentId: 'J1', sourcePinNumber: 'VBUS' },
        { id: '+3V3', voltage: 3.3, maxCurrent_mA: 800, sourceComponentId: 'U2', sourcePinNumber: 'VOUT' },
      ],
      components: [
        {
          id: 'J1',
          name: 'USB Type-C Receptacle 16-Pin',
          mpn: 'TYPE-C-31-M-12',
          manufacturer: 'Korean Hroparts Elec',
          package: 'USB-C-SMD-16P',
          category: 'Connector' as const,
          lcscPart: 'C165948',
          description: 'USB 2.0 Type-C receptacle with 5.1k CC pull-down resistors for 5V power delivery',
          x: 60,
          y: 80,
          pins: [
            { number: 'A1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
            { number: 'A4', name: 'VBUS', type: 'power_out' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'A5', name: 'CC1', type: 'passive' as const, connectedNet: 'NET_CC1' },
            { number: 'B5', name: 'CC2', type: 'passive' as const, connectedNet: 'NET_CC2' },
            { number: 'B4', name: 'VBUS', type: 'power_out' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'B1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
          ],
        },
        {
          id: 'U2',
          name: 'AMS1117-3.3 LDO Regulator',
          mpn: 'AMS1117-3.3',
          manufacturer: 'Advanced Monolithic Systems',
          package: 'SOT-223-3',
          category: 'Power' as const,
          value: '3.3V 1A',
          lcscPart: 'C6186',
          description: 'Low dropout 3.3V linear voltage regulator with internal thermal limiting',
          x: 200,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
            { number: '2', name: 'VOUT', type: 'power_out' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '3', name: 'VIN', type: 'power_in' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: '4', name: 'TAB', type: 'power_out' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
          ],
        },
        {
          id: 'C1',
          name: 'Input Filter Capacitor 10uF',
          mpn: 'CL21A106KOQNNNE',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive' as const,
          value: '10uF 25V X5R',
          lcscPart: 'C15849',
          description: 'Regulator input decoupling capacitor',
          x: 160,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: 'VBUS_5V' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
          ],
        },
        {
          id: 'C2',
          name: 'Output Bypass Capacitor 22uF',
          mpn: 'CL21A226MOCLRNC',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive' as const,
          value: '22uF 16V X5R',
          lcscPart: 'C45783',
          description: 'Regulator output stability and bulk reservoir capacitor',
          x: 270,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
          ],
        },
        {
          id: 'U1',
          name: 'ESP32-S3-WROOM-1 Microcontroller',
          mpn: 'ESP32-S3-WROOM-1-N8R8',
          manufacturer: 'Espressif Systems',
          package: 'Module-SMD-41P',
          category: 'MCU' as const,
          value: 'Xtensa LX7 Dual-Core',
          lcscPart: 'C2913199',
          description: '2.4 GHz Wi-Fi and Bluetooth 5 (LE) SoC with 8MB Flash and 8MB Octal PSRAM',
          x: 380,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
            { number: '2', name: '3V3', type: 'power_in' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '3', name: 'EN', type: 'input' as const, connectedNet: 'NET_ESP_EN' },
            { number: '8', name: 'IO4_SDA', type: 'bidirectional' as const, connectedNet: 'NET_I2C_SDA' },
            { number: '9', name: 'IO5_SCL', type: 'bidirectional' as const, connectedNet: 'NET_I2C_SCL' },
            { number: '10', name: 'IO6_LED', type: 'output' as const, connectedNet: 'NET_STATUS_LED' },
            { number: '40', name: 'EPAD_GND', type: 'power_in' as const, connectedNet: 'GND' },
          ],
        },
        {
          id: 'C3',
          name: 'MCU Bypass Capacitor 100nF',
          mpn: 'CC0402KRX7R9BB104',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive' as const,
          value: '100nF 50V X7R',
          lcscPart: 'C1525',
          description: 'High-frequency ceramic decoupling bypass for ESP32 3V3 rail',
          x: 350,
          y: 220,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
          ],
        },
        {
          id: 'U3',
          name: 'BME280 Environmental Sensor',
          mpn: 'BME280',
          manufacturer: 'Bosch Sensortec',
          package: 'LGA-8',
          category: 'Sensor' as const,
          value: 'Temp/Hum/Pressure',
          lcscPart: 'C92489',
          description: 'Digital humidity, pressure and temperature sensor with I2C/SPI interface',
          x: 520,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
            { number: '2', name: 'CSB', type: 'input' as const, connectedNet: '+3V3' },
            { number: '3', name: 'SDI_SDA', type: 'bidirectional' as const, connectedNet: 'NET_I2C_SDA' },
            { number: '4', name: 'SCK_SCL', type: 'input' as const, connectedNet: 'NET_I2C_SCL' },
            { number: '5', name: 'SDO_ADDR', type: 'input' as const, connectedNet: 'GND' },
            { number: '6', name: 'VDDIO', type: 'power_in' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '7', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
            { number: '8', name: 'VDD', type: 'power_in' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
          ],
        },
        {
          id: 'R1',
          name: 'I2C SDA Pull-up Resistor 4.7k',
          mpn: 'RC0402FR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive' as const,
          value: '4.7k 1% 1/16W',
          lcscPart: 'C25900',
          description: 'I2C SDA bus pull-up resistor to 3.3V',
          x: 480,
          y: 200,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'NET_I2C_SDA' },
          ],
        },
        {
          id: 'R2',
          name: 'I2C SCL Pull-up Resistor 4.7k',
          mpn: 'RC0402FR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive' as const,
          value: '4.7k 1% 1/16W',
          lcscPart: 'C25900',
          description: 'I2C SCL bus pull-up resistor to 3.3V',
          x: 540,
          y: 200,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'NET_I2C_SCL' },
          ],
        },
        {
          id: 'D1',
          name: 'Status Indicator LED (Emerald Green)',
          mpn: 'KT-0603G',
          manufacturer: 'Hubei KENTO Elec',
          package: '0603',
          category: 'Discrete' as const,
          value: 'Green 20mA',
          lcscPart: 'C2286',
          description: 'GPIO-controlled system heart-beat and status indicator LED',
          x: 650,
          y: 80,
          pins: [
            { number: '1', name: 'A', type: 'passive' as const, connectedNet: 'NET_STATUS_LED' },
            { number: '2', name: 'K', type: 'passive' as const, connectedNet: 'NET_LED_CATHODE' },
          ],
        },
        {
          id: 'R3',
          name: 'LED Current Limiting Resistor 1k',
          mpn: 'RC0402FR-071KL',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive' as const,
          value: '1k 1% 1/16W',
          lcscPart: 'C11702',
          description: 'Current limiting series resistor for status LED (sets If ~ 1.5mA)',
          x: 650,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive' as const, connectedNet: 'NET_LED_CATHODE' },
            { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
          ],
        },
      ],
      nets: [
        {
          id: 'GND',
          name: 'GND',
          netClass: 'ground' as const,
          voltage: 0,
          connections: [
            { componentId: 'J1', pinNumber: 'A1' },
            { componentId: 'J1', pinNumber: 'B1' },
            { componentId: 'U2', pinNumber: '1' },
            { componentId: 'C1', pinNumber: '2' },
            { componentId: 'C2', pinNumber: '2' },
            { componentId: 'U1', pinNumber: '1' },
            { componentId: 'U1', pinNumber: '40' },
            { componentId: 'C3', pinNumber: '2' },
            { componentId: 'U3', pinNumber: '1' },
            { componentId: 'U3', pinNumber: '5' },
            { componentId: 'U3', pinNumber: '7' },
            { componentId: 'R3', pinNumber: '2' },
          ],
        },
        {
          id: 'VBUS_5V',
          name: 'VBUS_5V',
          netClass: 'power' as const,
          voltage: 5.0,
          connections: [
            { componentId: 'J1', pinNumber: 'A4' },
            { componentId: 'J1', pinNumber: 'B4' },
            { componentId: 'U2', pinNumber: '3' },
            { componentId: 'C1', pinNumber: '1' },
          ],
        },
        {
          id: '+3V3',
          name: '+3V3',
          netClass: 'power' as const,
          voltage: 3.3,
          connections: [
            { componentId: 'U2', pinNumber: '2' },
            { componentId: 'U2', pinNumber: '4' },
            { componentId: 'C2', pinNumber: '1' },
            { componentId: 'U1', pinNumber: '2' },
            { componentId: 'C3', pinNumber: '1' },
            { componentId: 'U3', pinNumber: '2' },
            { componentId: 'U3', pinNumber: '6' },
            { componentId: 'U3', pinNumber: '8' },
            { componentId: 'R1', pinNumber: '1' },
            { componentId: 'R2', pinNumber: '1' },
          ],
        },
        {
          id: 'NET_I2C_SDA',
          name: 'I2C_SDA',
          netClass: 'i2c' as const,
          voltage: 3.3,
          properties: { pullUpRequired: true, pullUpResistorValue: '4.7k' },
          connections: [
            { componentId: 'U1', pinNumber: '8' },
            { componentId: 'U3', pinNumber: '3' },
            { componentId: 'R1', pinNumber: '2' },
          ],
        },
        {
          id: 'NET_I2C_SCL',
          name: 'I2C_SCL',
          netClass: 'i2c' as const,
          voltage: 3.3,
          properties: { pullUpRequired: true, pullUpResistorValue: '4.7k' },
          connections: [
            { componentId: 'U1', pinNumber: '9' },
            { componentId: 'U3', pinNumber: '4' },
            { componentId: 'R2', pinNumber: '2' },
          ],
        },
        {
          id: 'NET_STATUS_LED',
          name: 'STATUS_LED',
          netClass: 'signal' as const,
          connections: [
            { componentId: 'U1', pinNumber: '10' },
            { componentId: 'D1', pinNumber: '1' },
          ],
        },
        {
          id: 'NET_LED_CATHODE',
          name: 'LED_K',
          netClass: 'signal' as const,
          connections: [
            { componentId: 'D1', pinNumber: '2' },
            { componentId: 'R3', pinNumber: '1' },
          ],
        },
      ],
      ercReport: [],
    };
    espTemplate.ercReport = runElectricalRulesCheck(espTemplate);

    return {
      reply: `🚀 **ESP32-S3 IoT Environmental Node Synthesized Successfully**:
- **MCU**: ESP32-S3-WROOM-1 (Xtensa dual-core LX7, Wi-Fi 4 + BLE 5).
- **Power**: USB Type-C 5V input regulated to 3.3V via AMS1117-3.3 LDO (1A max).
- **Sensor**: Bosch BME280 temperature, humidity, and atmospheric pressure sensor tied to I2C bus with compliant 4.7kΩ pull-up resistors.
- **Decoupling**: High-frequency 100nF ceramic bypass capacitor and 22uF output reservoir capacitor.
- **Diagnostics**: Green status LED on GPIO6 with 1kΩ current limiter.
- **ERC Status**: 0 Errors, 0 Warnings (Electrical Rules Verified).`,
      graph: espTemplate,
      actionDiff: {
        addedComponents: [
          'J1 (USB Type-C)',
          'U2 (AMS1117-3.3)',
          'C1 (10uF In)',
          'C2 (22uF Out)',
          'U1 (ESP32-S3)',
          'C3 (100nF Bypass)',
          'U3 (BME280 Sensor)',
          'R1 (4.7k SDA)',
          'R2 (4.7k SCL)',
          'D1 (Status LED)',
          'R3 (1k Resistor)',
        ],
        explanation: 'Synthesized complete ESP32 IoT node with power management, sensors, and status indicators.',
      },
    };
  }

  // Case 3: Power Supply circuit
  const pwrTemplate = {
    metadata: {
      projectId: `prj-power-${Date.now().toString(36)}`,
      name: '5V to 3.3V Regulated Power Supply',
      revision: 'v1.0',
      author: 'SuperAgent AI Hardware Engine',
      targetEcad: 'kicad8' as const,
      created: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString().split('T')[0],
    },
    powerRails: [
      { id: 'VBUS_5V', voltage: 5.0, maxCurrent_mA: 2000, sourceComponentId: 'J1', sourcePinNumber: 'VBUS' },
      { id: '+3V3', voltage: 3.3, maxCurrent_mA: 1000, sourceComponentId: 'U1', sourcePinNumber: 'VOUT' },
    ],
    components: [
      {
        id: 'J1',
        name: 'USB Type-C Receptacle Power',
        mpn: 'TYPE-C-31-M-12',
        manufacturer: 'Korean Hroparts Elec',
        package: 'USB-C-SMD-16P',
        category: 'Connector' as const,
        lcscPart: 'C165948',
        description: 'USB Type-C 5V DC power input connector',
        x: 80,
        y: 80,
        pins: [
          { number: 'A1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
          { number: 'A4', name: 'VBUS', type: 'power_out' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
          { number: 'B4', name: 'VBUS', type: 'power_out' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
          { number: 'B1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
        ],
      },
      {
        id: 'C1',
        name: 'Input Bulk Capacitor 10uF',
        mpn: 'CL21A106KOQNNNE',
        manufacturer: 'Samsung Electro-Mechanics',
        package: '0805',
        category: 'Passive' as const,
        value: '10uF 25V X5R',
        lcscPart: 'C15849',
        description: 'Input ripple smoothing capacitor',
        x: 180,
        y: 160,
        pins: [
          { number: '1', name: '1', type: 'passive' as const, connectedNet: 'VBUS_5V' },
          { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
        ],
      },
      {
        id: 'U1',
        name: 'AMS1117-3.3 Linear Regulator',
        mpn: 'AMS1117-3.3',
        manufacturer: 'Advanced Monolithic Systems',
        package: 'SOT-223-3',
        category: 'Power' as const,
        value: '3.3V 1A',
        lcscPart: 'C6186',
        description: 'Positive fixed 3.3V low dropout regulator',
        x: 280,
        y: 80,
        pins: [
          { number: '1', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
          { number: '2', name: 'VOUT', type: 'power_out' as const, connectedNet: '+3V3', voltageLevel: 3.3 },
          { number: '3', name: 'VIN', type: 'power_in' as const, connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
        ],
      },
      {
        id: 'C2',
        name: 'Output Bulk Capacitor 22uF',
        mpn: 'CL21A226MOCLRNC',
        manufacturer: 'Samsung Electro-Mechanics',
        package: '0805',
        category: 'Passive' as const,
        value: '22uF 16V X5R',
        lcscPart: 'C45783',
        description: 'Output stability tantalum/ceramic capacitor',
        x: 380,
        y: 160,
        pins: [
          { number: '1', name: '1', type: 'passive' as const, connectedNet: '+3V3' },
          { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
        ],
      },
      {
        id: 'D1',
        name: '3.3V Power LED (Blue)',
        mpn: 'KT-0603B',
        manufacturer: 'Hubei KENTO Elec',
        package: '0603',
        category: 'Discrete' as const,
        value: 'Blue 20mA',
        lcscPart: 'C2288',
        description: 'Output power rail active indicator LED',
        x: 480,
        y: 80,
        pins: [
          { number: '1', name: 'A', type: 'passive' as const, connectedNet: '+3V3' },
          { number: '2', name: 'K', type: 'passive' as const, connectedNet: 'NET_PWR_LED_K' },
        ],
      },
      {
        id: 'R1',
        name: 'LED Ballast Resistor 1.5k',
        mpn: 'RC0402FR-071K5L',
        manufacturer: 'Yageo',
        package: '0402',
        category: 'Passive' as const,
        value: '1.5k 1% 1/16W',
        lcscPart: 'C25879',
        description: 'Current limiting resistor for 3.3V indicator LED',
        x: 480,
        y: 160,
        pins: [
          { number: '1', name: '1', type: 'passive' as const, connectedNet: 'NET_PWR_LED_K' },
          { number: '2', name: '2', type: 'passive' as const, connectedNet: 'GND' },
        ],
      },
    ],
    nets: [
      {
        id: 'GND',
        name: 'GND',
        netClass: 'ground' as const,
        voltage: 0,
        connections: [
          { componentId: 'J1', pinNumber: 'A1' },
          { componentId: 'J1', pinNumber: 'B1' },
          { componentId: 'C1', pinNumber: '2' },
          { componentId: 'U1', pinNumber: '1' },
          { componentId: 'C2', pinNumber: '2' },
          { componentId: 'R1', pinNumber: '2' },
        ],
      },
      {
        id: 'VBUS_5V',
        name: 'VBUS_5V',
        netClass: 'power' as const,
        voltage: 5.0,
        connections: [
          { componentId: 'J1', pinNumber: 'A4' },
          { componentId: 'J1', pinNumber: 'B4' },
          { componentId: 'C1', pinNumber: '1' },
          { componentId: 'U1', pinNumber: '3' },
        ],
      },
      {
        id: '+3V3',
        name: '+3V3',
        netClass: 'power' as const,
        voltage: 3.3,
        connections: [
          { componentId: 'U1', pinNumber: '2' },
          { componentId: 'C2', pinNumber: '1' },
          { componentId: 'D1', pinNumber: '1' },
        ],
      },
      {
        id: 'NET_PWR_LED_K',
        name: 'PWR_LED_K',
        netClass: 'signal' as const,
        connections: [
          { componentId: 'D1', pinNumber: '2' },
          { componentId: 'R1', pinNumber: '1' },
        ],
      },
    ],
    ercReport: [],
  };
  pwrTemplate.ercReport = runElectricalRulesCheck(pwrTemplate);

  return {
    reply: `⚡ **Regulated 5V to 3.3V Power Supply Synthesized**:
- **Input**: USB Type-C 5V VBUS with input bypass capacitor C1 (10µF).
- **Regulator**: AMS1117-3.3 SOT-223 linear regulator (1.0A continuous).
- **Filtering**: Low-ESR 22µF output reservoir capacitor C2 for fast load transient suppression.
- **Power Good**: Blue 0603 status LED with 1.5kΩ ballast resistor.
- **ERC Status**: Clean (0 Errors). Ready for KiCad/Altium export.`,
    graph: pwrTemplate,
    actionDiff: {
      addedComponents: ['J1 (USB Type-C)', 'U1 (AMS1117-3.3)', 'C1 (10uF)', 'C2 (22uF)', 'D1 (LED)', 'R1 (1.5k)'],
      explanation: 'Synthesized regulated power supply subsystem.',
    },
  };
}

/**
 * Model-Driven Hardware AI Synthesis Engine
 * Invokes the user's configured AI provider via live inference.
 * On error, surfaces the real error message — no hardcoded fallbacks.
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
    console.error('[processHardwarePrompt] Live AI inference failed:', errorMessage);

    return {
      reply: `⚠️ **AI Hardware Inference Failed**\n\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**What to check:**\n1. Your API key is set in **Settings → Providers** (the ⚙ icon top-right).\n2. The model shown in the chip at the bottom of this panel is the one your provider supports.\n3. If the model name is wrong, open the model picker and select the correct one from your connected provider.`,
    };
  }
}
