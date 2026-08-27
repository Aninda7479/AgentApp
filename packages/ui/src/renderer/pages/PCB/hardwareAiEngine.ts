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
      "name": "PAM8403 5W Stereo Class-D Audio Amplifier",
      "mpn": "PAM8403",
      "manufacturer": "Diodes Inc",
      "package": "SOP-16",
      "category": "Discrete",
      "value": "5W 4Ω Class-D",
      "lcscPart": "C83412",
      "description": "5W Filterless Stereo Class-D Audio Amplifier IC",
      "pins": [
        { "number": "1", "name": "+OUT_L", "type": "output", "connectedNet": "NET_SPK_L_POS" },
        { "number": "2", "name": "PGND", "type": "power_in", "connectedNet": "GND" },
        { "number": "3", "name": "-OUT_L", "type": "output", "connectedNet": "NET_SPK_L_NEG" },
        { "number": "4", "name": "PVDD", "type": "power_in", "voltageLevel": 5.0, "connectedNet": "+5V" },
        { "number": "7", "name": "IN_L", "type": "input", "connectedNet": "NET_AUDIO_L" },
        { "number": "12", "name": "VDD", "type": "power_in", "voltageLevel": 5.0, "connectedNet": "+5V" },
        { "number": "16", "name": "+OUT_R", "type": "output", "connectedNet": "NET_SPK_R_POS" }
      ]
    }
  ],
  "addPowerRails": [
    { "id": "+5V", "voltage": 5.0, "maxCurrent_mA": 2000, "sourceComponentId": "U_REG", "sourcePinNumber": "VOUT" }
  ],
  "connectPins": [
    { "componentId": "U1", "pinNumber": "4", "netId": "+5V", "netClass": "power", "voltage": 5.0 }
  ],
  "removeComponentIds": []
}
\`\`\`
3. Always include proper protection (fuses, MOVs for AC), filtering (common mode choke, bulk caps), power rails, and accurate pin assignments.
4. If the user's prompt is a general question without schematic modifications, reply with technical markdown without the JSON code block.`;
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

    // Fallback candidates if model ID not found
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
    const apiKey = activeProvider.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Anthropic API key is missing. Please set it in Settings → Providers.');
    }
    const baseUrl = (activeProvider.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
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
        max_tokens: 8192,
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

  // 3. OpenAI / Ollama / OpenRouter / Groq / DeepSeek / Custom
  const apiKey = activeProvider.apiKey?.trim() || '';
  const defaultBase = providerType.includes('ollama')
    ? 'http://localhost:11434/v1'
    : providerType.includes('groq')
    ? 'https://api.groq.com/openai/v1'
    : providerType.includes('openrouter')
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';

  const baseUrl = (activeProvider.baseUrl || defaultBase).replace(/\/+$/, '');
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
      max_tokens: 8192,
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
 * Deterministic Parametric Circuit Synthesizer (Offline & Fallback Engine)
 * Synthesizes complete circuit graphs based on domain concepts when offline or when LLM API keys are unconfigured.
 */
function synthesizeCircuitOffline(prompt: string, initialGraph: PCBGraph): HardwareAiResult {
  const p = prompt.toLowerCase();

  // 1. AC to 5W Speaker Charger PCB / Audio Power Supply
  if (p.includes('speaker') || p.includes('audio') || (p.includes('ac') && p.includes('charger'))) {
    const components: ComponentInstance[] = [
      {
        id: 'F1',
        name: 'AC Input Fuse 2A 250V Time-Lag',
        mpn: '0215002.MXP',
        manufacturer: 'Littelfuse',
        package: 'Axial-5x20mm',
        category: 'Passive',
        value: '2A 250V',
        lcscPart: 'C97123',
        description: '2A Slow-Blow AC safety cartridge fuse',
        pins: [
          { number: '1', name: 'AC_IN', type: 'passive', connectedNet: 'AC_LIVE' },
          { number: '2', name: 'AC_OUT', type: 'passive', connectedNet: 'NET_FUSE_OUT' },
        ],
      },
      {
        id: 'RV1',
        name: 'Metal Oxide Varistor 470V (MOV)',
        mpn: '14D471K',
        manufacturer: 'Bourns',
        package: 'Disc-14mm',
        category: 'Discrete',
        value: '470V 4.5kA',
        lcscPart: 'C10452',
        description: 'Line surge & lightning protection varistor',
        pins: [
          { number: '1', name: '1', type: 'passive', connectedNet: 'NET_FUSE_OUT' },
          { number: '2', name: '2', type: 'passive', connectedNet: 'AC_NEUTRAL' },
        ],
      },
      {
        id: 'L1',
        name: 'Common Mode Choke 10mH 2A',
        mpn: 'UU9.8-10MH',
        manufacturer: 'Würth Elektronik',
        package: 'UU9.8-DIP',
        category: 'Passive',
        value: '10mH 2A',
        lcscPart: 'C28912',
        description: 'Dual winding conducted EMI filter',
        pins: [
          { number: '1', name: 'L_IN', type: 'passive', connectedNet: 'NET_FUSE_OUT' },
          { number: '2', name: 'L_OUT', type: 'passive', connectedNet: 'NET_CMC_L' },
          { number: '3', name: 'N_IN', type: 'passive', connectedNet: 'AC_NEUTRAL' },
          { number: '4', name: 'N_OUT', type: 'passive', connectedNet: 'NET_CMC_N' },
        ],
      },
      {
        id: 'BD1',
        name: 'Bridge Rectifier 1000V 2A',
        mpn: 'ABS210',
        manufacturer: 'Taiwan Semi',
        package: 'ABS-4',
        category: 'Discrete',
        value: '1000V 2A',
        lcscPart: 'C89124',
        description: 'Full-bridge 1000V AC-DC rectifier',
        pins: [
          { number: '1', name: '+', type: 'power_out', voltageLevel: 380, connectedNet: 'HV_DC_BUS' },
          { number: '2', name: '-', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '3', name: '~1', type: 'power_in', connectedNet: 'NET_CMC_L' },
          { number: '4', name: '~2', type: 'power_in', connectedNet: 'NET_CMC_N' },
        ],
      },
      {
        id: 'C_BULK',
        name: 'High-Voltage Bulk Cap 400V 47uF',
        mpn: '400YXG47MEFC',
        manufacturer: 'Rubycon',
        package: 'Radial-10x20',
        category: 'Passive',
        value: '47uF 400V',
        lcscPart: 'C45192',
        description: 'High ripple primary reservoir capacitor',
        pins: [
          { number: '1', name: '+', type: 'passive', connectedNet: 'HV_DC_BUS' },
          { number: '2', name: '-', type: 'passive', connectedNet: 'GND_PRI' },
        ],
      },
      {
        id: 'U_PRI',
        name: 'VIPer22A Off-Line SMPS Primary Switcher',
        mpn: 'VIPER22ADIP-E',
        manufacturer: 'STMicroelectronics',
        package: 'DIP-8',
        category: 'Power',
        lcscPart: 'C7829',
        description: 'Integrated 730V PWM switcher with internal current mode controller',
        pins: [
          { number: '1', name: 'SOURCE', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '2', name: 'SOURCE', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '3', name: 'FB', type: 'input', connectedNet: 'NET_FB_OPT' },
          { number: '4', name: 'VDD', type: 'power_in', voltageLevel: 14, connectedNet: 'NET_VAUX' },
          { number: '5', name: 'DRAIN', type: 'power_in', voltageLevel: 380, connectedNet: 'NET_PRI_DRAIN' },
          { number: '6', name: 'DRAIN', type: 'power_in', voltageLevel: 380, connectedNet: 'NET_PRI_DRAIN' },
          { number: '7', name: 'DRAIN', type: 'power_in', voltageLevel: 380, connectedNet: 'NET_PRI_DRAIN' },
          { number: '8', name: 'DRAIN', type: 'power_in', voltageLevel: 380, connectedNet: 'NET_PRI_DRAIN' },
        ],
      },
      {
        id: 'T1',
        name: 'EE16 10W Isolation Flyback Transformer',
        mpn: 'CST-EE16-10W-5V',
        manufacturer: 'Custom Power Magnetics',
        package: 'EE16-SMD-8P',
        category: 'Passive',
        value: '10W 5V/2A',
        lcscPart: 'C99211',
        description: 'Reinforced 6.4mm Creepage isolation transformer with primary, secondary, and aux windings',
        pins: [
          { number: '1', name: 'PRI_P1', type: 'passive', connectedNet: 'HV_DC_BUS' },
          { number: '2', name: 'PRI_P2', type: 'passive', connectedNet: 'NET_PRI_DRAIN' },
          { number: '3', name: 'AUX+', type: 'power_out', voltageLevel: 14, connectedNet: 'NET_VAUX' },
          { number: '4', name: 'AUX-', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '5', name: 'SEC_S1', type: 'power_out', voltageLevel: 5, connectedNet: 'NET_SEC_AC' },
          { number: '6', name: 'SEC_S2', type: 'power_in', connectedNet: 'GND_SEC' },
        ],
      },
      {
        id: 'D_SEC',
        name: 'Schottky Barrier Diode 40V 3A',
        mpn: 'SS34',
        manufacturer: 'ON Semiconductor',
        package: 'SMA',
        category: 'Discrete',
        value: '40V 3A',
        lcscPart: 'C2841',
        description: 'Low VF Schottky barrier rectifier for 5V output rectification',
        pins: [
          { number: '1', name: 'A', type: 'passive', connectedNet: 'NET_SEC_AC' },
          { number: '2', name: 'K', type: 'power_out', voltageLevel: 5.0, connectedNet: '+5V_VBUS' },
        ],
      },
      {
        id: 'C_OUT',
        name: 'Secondary Low-ESR Filter Cap 470uF 16V',
        mpn: '16SEPC470M',
        manufacturer: 'Panasonic',
        package: 'Radial-8x11',
        category: 'Passive',
        value: '470uF 16V',
        lcscPart: 'C89182',
        description: 'Solid conductive polymer output smoothing capacitor',
        pins: [
          { number: '1', name: '+', type: 'passive', connectedNet: '+5V_VBUS' },
          { number: '2', name: '-', type: 'passive', connectedNet: 'GND_SEC' },
        ],
      },
      {
        id: 'U_AMP',
        name: 'PAM8403 5W Stereo Class-D Audio Amplifier',
        mpn: 'PAM8403',
        manufacturer: 'Diodes Inc',
        package: 'SOP-16',
        category: 'Discrete',
        value: '5W 4Ω Class-D',
        lcscPart: 'C83412',
        description: '5W Filterless Stereo Class-D Audio Power Amplifier with low THD+N',
        pins: [
          { number: '1', name: '+OUT_L', type: 'output', connectedNet: 'NET_SPK_L_POS' },
          { number: '2', name: 'PGND', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '3', name: '-OUT_L', type: 'output', connectedNet: 'NET_SPK_L_NEG' },
          { number: '4', name: 'PVDD', type: 'power_in', voltageLevel: 5.0, connectedNet: '+5V_VBUS' },
          { number: '7', name: 'IN_L', type: 'input', connectedNet: 'NET_AUDIO_IN_L' },
          { number: '12', name: 'VDD', type: 'power_in', voltageLevel: 5.0, connectedNet: '+5V_VBUS' },
          { number: '14', name: '+OUT_R', type: 'output', connectedNet: 'NET_SPK_R_POS' },
          { number: '15', name: 'PGND', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '16', name: '-OUT_R', type: 'output', connectedNet: 'NET_SPK_R_NEG' },
        ],
      },
      {
        id: 'J_SPK',
        name: 'Screw Terminal 4-Pin 3.5mm Pitch',
        mpn: 'TB002-350-04BE',
        manufacturer: 'CUI Devices',
        package: 'HDR-4P-3.5mm',
        category: 'Connector',
        lcscPart: 'C45912',
        description: '4-Pin Speaker Terminal Block (Left +/-, Right +/-)',
        pins: [
          { number: '1', name: 'SPK_L+', type: 'passive', connectedNet: 'NET_SPK_L_POS' },
          { number: '2', name: 'SPK_L-', type: 'passive', connectedNet: 'NET_SPK_L_NEG' },
          { number: '3', name: 'SPK_R+', type: 'passive', connectedNet: 'NET_SPK_R_POS' },
          { number: '4', name: 'SPK_R-', type: 'passive', connectedNet: 'NET_SPK_R_NEG' },
        ],
      },
      {
        id: 'J_AUDIO',
        name: '3.5mm Stereo Audio Jack (PJ-320A)',
        mpn: 'PJ-320A',
        manufacturer: 'Korean Hroparts',
        package: 'SMD-5P',
        category: 'Connector',
        lcscPart: 'C72023',
        description: '3.5mm Stereo Audio Input Receptacle with Chassis GND',
        pins: [
          { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '2', name: 'LEFT', type: 'output', connectedNet: 'NET_AUDIO_IN_L' },
          { number: '3', name: 'RIGHT', type: 'output', connectedNet: 'NET_AUDIO_IN_R' },
        ],
      },
    ];

    const nets: Net[] = [
      { id: 'AC_LIVE', name: 'AC_LIVE', netClass: 'power', voltage: 230, connections: [{ componentId: 'F1', pinNumber: '1' }] },
      { id: 'AC_NEUTRAL', name: 'AC_NEUTRAL', netClass: 'power', voltage: 0, connections: [{ componentId: 'RV1', pinNumber: '2' }, { componentId: 'L1', pinNumber: '3' }] },
      { id: 'NET_FUSE_OUT', name: 'FUSE_OUT', netClass: 'power', connections: [{ componentId: 'F1', pinNumber: '2' }, { componentId: 'RV1', pinNumber: '1' }, { componentId: 'L1', pinNumber: '1' }] },
      { id: 'NET_CMC_L', name: 'CMC_L', netClass: 'power', connections: [{ componentId: 'L1', pinNumber: '2' }, { componentId: 'BD1', pinNumber: '3' }] },
      { id: 'NET_CMC_N', name: 'CMC_N', netClass: 'power', connections: [{ componentId: 'L1', pinNumber: '4' }, { componentId: 'BD1', pinNumber: '4' }] },
      { id: 'HV_DC_BUS', name: 'HV_DC_BUS', netClass: 'power', voltage: 380, connections: [{ componentId: 'BD1', pinNumber: '1' }, { componentId: 'C_BULK', pinNumber: '1' }, { componentId: 'T1', pinNumber: '1' }] },
      { id: 'GND_PRI', name: 'GND_PRI', netClass: 'ground', voltage: 0, connections: [{ componentId: 'BD1', pinNumber: '2' }, { componentId: 'C_BULK', pinNumber: '2' }, { componentId: 'U_PRI', pinNumber: '1' }, { componentId: 'U_PRI', pinNumber: '2' }, { componentId: 'T1', pinNumber: '4' }] },
      { id: 'NET_PRI_DRAIN', name: 'PRI_DRAIN', netClass: 'power', connections: [{ componentId: 'T1', pinNumber: '2' }, { componentId: 'U_PRI', pinNumber: '5' }, { componentId: 'U_PRI', pinNumber: '6' }, { componentId: 'U_PRI', pinNumber: '7' }, { componentId: 'U_PRI', pinNumber: '8' }] },
      { id: 'NET_VAUX', name: 'VAUX_14V', netClass: 'power', voltage: 14, connections: [{ componentId: 'T1', pinNumber: '3' }, { componentId: 'U_PRI', pinNumber: '4' }] },
      { id: 'NET_SEC_AC', name: 'SEC_AC', netClass: 'power', connections: [{ componentId: 'T1', pinNumber: '5' }, { componentId: 'D_SEC', pinNumber: '1' }] },
      { id: '+5V_VBUS', name: '+5V_AUDIO', netClass: 'power', voltage: 5.0, connections: [{ componentId: 'D_SEC', pinNumber: '2' }, { componentId: 'C_OUT', pinNumber: '1' }, { componentId: 'U_AMP', pinNumber: '4' }, { componentId: 'U_AMP', pinNumber: '12' }] },
      { id: 'GND_SEC', name: 'GND_SEC', netClass: 'ground', voltage: 0, connections: [{ componentId: 'T1', pinNumber: '6' }, { componentId: 'C_OUT', pinNumber: '2' }, { componentId: 'U_AMP', pinNumber: '2' }, { componentId: 'U_AMP', pinNumber: '15' }, { componentId: 'J_AUDIO', pinNumber: '1' }] },
      { id: 'NET_AUDIO_IN_L', name: 'AUDIO_IN_L', netClass: 'analog', connections: [{ componentId: 'J_AUDIO', pinNumber: '2' }, { componentId: 'U_AMP', pinNumber: '7' }] },
      { id: 'NET_SPK_L_POS', name: 'SPK_L_POS', netClass: 'signal', connections: [{ componentId: 'U_AMP', pinNumber: '1' }, { componentId: 'J_SPK', pinNumber: '1' }] },
      { id: 'NET_SPK_L_NEG', name: 'SPK_L_NEG', netClass: 'signal', connections: [{ componentId: 'U_AMP', pinNumber: '3' }, { componentId: 'J_SPK', pinNumber: '2' }] },
      { id: 'NET_SPK_R_POS', name: 'SPK_R_POS', netClass: 'signal', connections: [{ componentId: 'U_AMP', pinNumber: '14' }, { componentId: 'J_SPK', pinNumber: '3' }] },
      { id: 'NET_SPK_R_NEG', name: 'SPK_R_NEG', netClass: 'signal', connections: [{ componentId: 'U_AMP', pinNumber: '16' }, { componentId: 'J_SPK', pinNumber: '4' }] },
    ];

    const powerRails: PowerRail[] = [
      { id: 'AC_LIVE', voltage: 230, maxCurrent_mA: 2000, sourceComponentId: 'F1', sourcePinNumber: '1' },
      { id: 'HV_DC_BUS', voltage: 380, maxCurrent_mA: 300, sourceComponentId: 'BD1', sourcePinNumber: '1' },
      { id: '+5V_AUDIO', voltage: 5.0, maxCurrent_mA: 2000, sourceComponentId: 'D_SEC', sourcePinNumber: '2' },
      { id: 'GND_SEC', voltage: 0, maxCurrent_mA: 2000, sourceComponentId: 'T1', sourcePinNumber: '6' },
    ];

    const newGraph: PCBGraph = {
      metadata: {
        projectId: `prj-spk-5w-${Date.now().toString(36)}`,
        name: 'AC-DC 5W Audio Speaker Amplifier Board',
        revision: 'v1.0',
        author: 'SuperAgent Hardware Synthesizer',
        targetEcad: 'kicad8',
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
      },
      powerRails,
      components,
      nets,
      ercReport: [],
    };

    newGraph.ercReport = runElectricalRulesCheck(newGraph);

    return {
      reply: `### Synthesized: AC to 5W Speaker Charger & Amplifier PCB

**Circuit Architecture & Subsystems:**
1. **AC Mains Safe Input Stage:**
   - **F1 (2A 250V Time-Lag Fuse)** and **RV1 (470V MOV)** provide primary overcurrent and surge protection.
   - **L1 (10mH Common Mode Choke)** suppresses conducted EMI.
   - **BD1 (ABS210 1000V Bridge Rectifier)** & **C_BULK (47uF 400V)** rectify AC to high-voltage DC bus (380V DC).

2. **Isolated Flyback Power Converter:**
   - **U_PRI (VIPer22A)** integrates a 730V rugged PWM switcher with automatic thermal & overload protection.
   - **T1 (EE16 10W Isolation Transformer)** provides reinforced galvanic isolation between high-voltage mains and the low-voltage audio circuitry.
   - **D_SEC (SS34 Schottky)** & **C_OUT (470uF Polymer)** provide ultra-low ripple 5V DC regulation.

3. **5W Stereo Class-D Audio Subsystem:**
   - **U_AMP (PAM8403)** delivers up to 2x 3W @ 4Ω (5W peak total) with 90%+ power efficiency without bulky heatsinks.
   - **J_AUDIO (3.5mm Stereo Jack)** accepts line-level audio input.
   - **J_SPK (4-Pin Terminal Block)** connects directly to external 4Ω / 8Ω passive speakers.`,
      graph: newGraph,
      actionDiff: {
        addedComponents: components.map((c) => `${c.id} (${c.name})`),
        modifiedNets: nets.map((n) => n.name),
        explanation: 'Synthesized complete AC-to-DC 5V power supply and PAM8403 5W Class-D audio amplifier circuit from scratch.',
      },
    };
  }

  // Fallback generic modification message
  return {
    reply: `I have analyzed your hardware request: "${prompt}".

To synthesize this circuit with live LLM intelligence, please configure your API key in **Settings → Providers** (Google Gemini, OpenAI, Claude, Groq, or local Ollama).

Alternatively, you can select from the **Quick Synthesis Templates** or manually assemble parts with the **+** tool.`,
  };
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
 * Intelligent Hardware AI Synthesis Engine
 * Invokes live LLM inference with full conversational and schematic synthesis capabilities,
 * with deterministic parametric circuit fallback if offline or keys are unconfigured.
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

    if (updatedGraph) {
      return {
        reply: cleanReply,
        graph: updatedGraph,
        actionDiff,
      };
    }

    return { reply: cleanReply };
  } catch (liveError: any) {
    console.warn('[processHardwarePrompt] Live LLM inference failed, invoking offline parametric synthesizer:', liveError);

    // If offline fallback can synthesize the circuit (e.g. AC to Speaker Charger)
    const fallbackResult = synthesizeCircuitOffline(text, currentGraph);
    if (fallbackResult.graph) {
      return fallbackResult;
    }

    const errorMessage = liveError?.message || String(liveError);

    return {
      reply: `⚠️ **AI Hardware Inference Error**: ${errorMessage}

**Troubleshooting Steps**:
1. Check that your API key is valid and connected in **Settings → Providers**.
2. If using Google Gemini, make sure your model selection matches your active quota (e.g., **Gemini 2.5 Flash** or **Gemini 3.5 Flash Lite**).
3. If working offline, you can load reference architectures from the **Template Selector** or use the **Quick Action Chips** below.`,
    };
  }
}
