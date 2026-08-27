/**
 * Canonical PCB Graph Schema & Types for AI-Assisted Planning & ECAD Export
 */

export type PinType =
  | 'power_in'
  | 'power_out'
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'tri_state'
  | 'passive'
  | 'open_collector'
  | 'unconnected';

export type NetClass =
  | 'power'
  | 'ground'
  | 'analog'
  | 'digital'
  | 'diff_pair_pos'
  | 'diff_pair_neg'
  | 'clock'
  | 'rf'
  | 'i2c'
  | 'spi'
  | 'uart'
  | 'usb'
  | 'signal';

export interface ComponentPin {
  number: string;
  name: string;
  type: PinType;
  voltageLevel?: number; // e.g. 3.3, 5.0, 1.8, 230
  description?: string;
  alternateFunctions?: string[];
  connectedNet?: string; // ID of the net
}

export interface ComponentInstance {
  id: string; // Designator e.g., "U1", "R1", "C3"
  name: string; // Friendly name e.g., "ESP32-S3 Microcontroller"
  mpn: string; // Manufacturer Part Number e.g., "ESP32-S3-WROOM-1-N8R8"
  manufacturer: string;
  package: string; // e.g., "QFN-32", "0402", "SOIC-8", "Module"
  category: 'MCU' | 'Power' | 'Sensor' | 'Interface' | 'Passive' | 'Discrete' | 'Connector';
  value?: string; // e.g., "10k", "100nF 50V", "3.3V"
  lcscPart?: string; // e.g. "C2040"
  description: string;
  pins: ComponentPin[];
  x?: number;
  y?: number;
  block?: string; // Hierarchical block name
}

export interface PinEndpoint {
  componentId: string;
  pinNumber: string;
}

export interface Net {
  id: string; // e.g., "NET_I2C_SDA", "+3V3", "GND"
  name: string;
  netClass: NetClass;
  voltage?: number;
  connections: PinEndpoint[];
  properties?: {
    diffPairMatch?: string; // E.g. "USB_D_N"
    pullUpRequired?: boolean;
    pullUpResistorValue?: string;
    decouplingTarget?: string;
    maxCurrent_mA?: number;
  };
}

export interface PowerRail {
  id: string; // e.g. "VBUS_5V", "+3V3"
  voltage: number;
  maxCurrent_mA: number;
  sourceComponentId: string;
  sourcePinNumber: string;
}

export interface ERCResult {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'power' | 'voltage_mismatch' | 'floating' | 'pin_conflict' | 'decoupling' | 'pullup';
  title: string;
  message: string;
  affectedComponents?: string[];
  affectedNets?: string[];
  suggestedFix?: string;
}

export interface PCBGraph {
  metadata: {
    projectId: string;
    name: string;
    revision: string;
    author: string;
    targetEcad: 'kicad8' | 'kicad9' | 'altium' | 'skidl' | 'easyeda';
    created: string;
    updated: string;
  };
  powerRails: PowerRail[];
  components: ComponentInstance[];
  nets: Net[];
  ercReport: ERCResult[];
}

export type ExportFormat = 'kicad' | 'altium' | 'skidl' | 'easyeda' | 'bom' | 'json';

export const createEmptyProjectGraph = (): PCBGraph => ({
  metadata: {
    projectId: `prj-${Date.now().toString(36)}`,
    name: 'Untitled PCB Design',
    revision: 'v0.1',
    author: 'SuperAgent ECAD User',
    targetEcad: 'kicad8',
    created: new Date().toISOString().split('T')[0],
    updated: new Date().toISOString().split('T')[0],
  },
  powerRails: [],
  components: [],
  nets: [],
  ercReport: [],
});

export const STARTER_TEMPLATES: { id: string; name: string; description: string; graph: PCBGraph }[] = [
  {
    id: 'empty',
    name: 'New Blank Design Canvas',
    description: 'Start with a clean blank canvas. Synthesize any circuit dynamically with the AI Hardware Co-Pilot.',
    graph: createEmptyProjectGraph(),
  },
];
