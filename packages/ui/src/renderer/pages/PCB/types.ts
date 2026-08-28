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
  {
    id: 'esp32_sensor_node',
    name: 'ESP32-S3 IoT Environmental Node',
    description: 'ESP32-S3 MCU with AMS1117-3.3V LDO, USB-C 5V power, BME280 I2C environmental sensor with 4.7k pullups, RGB LED, and ESD protection.',
    graph: {
      metadata: {
        projectId: 'prj-esp32-node',
        name: 'ESP32-S3 IoT Environmental Node',
        revision: 'v1.0',
        author: 'SuperAgent ECAD User',
        targetEcad: 'kicad8',
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
          category: 'Connector',
          lcscPart: 'C165948',
          description: 'USB 2.0 Type-C receptacle with 5.1k CC pull-down resistors for 5V power delivery',
          x: 60,
          y: 80,
          pins: [
            { number: 'A1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: 'A4', name: 'VBUS', type: 'power_out', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'A5', name: 'CC1', type: 'passive', connectedNet: 'NET_CC1' },
            { number: 'B5', name: 'CC2', type: 'passive', connectedNet: 'NET_CC2' },
            { number: 'B4', name: 'VBUS', type: 'power_out', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'B1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
          ],
        },
        {
          id: 'U2',
          name: 'AMS1117-3.3 LDO Regulator',
          mpn: 'AMS1117-3.3',
          manufacturer: 'Advanced Monolithic Systems',
          package: 'SOT-223-3',
          category: 'Power',
          value: '3.3V 1A',
          lcscPart: 'C6186',
          description: 'Low dropout 3.3V linear voltage regulator with internal thermal limiting',
          x: 200,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: 'VOUT', type: 'power_out', connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '3', name: 'VIN', type: 'power_in', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: '4', name: 'TAB', type: 'power_out', connectedNet: '+3V3', voltageLevel: 3.3 },
          ],
        },
        {
          id: 'C1',
          name: 'Input Filter Capacitor 10uF',
          mpn: 'CL21A106KOQNNNE',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive',
          value: '10uF 25V X5R',
          lcscPart: 'C15849',
          description: 'Regulator input decoupling capacitor',
          x: 160,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'VBUS_5V' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'C2',
          name: 'Output Bypass Capacitor 22uF',
          mpn: 'CL21A226MOCLRNC',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive',
          value: '22uF 16V X5R',
          lcscPart: 'C45783',
          description: 'Regulator output stability and bulk reservoir capacitor',
          x: 270,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'U1',
          name: 'ESP32-S3-WROOM-1 Microcontroller',
          mpn: 'ESP32-S3-WROOM-1-N8R8',
          manufacturer: 'Espressif Systems',
          package: 'Module-SMD-41P',
          category: 'MCU',
          value: 'Xtensa LX7 Dual-Core',
          lcscPart: 'C2913199',
          description: '2.4 GHz Wi-Fi and Bluetooth 5 (LE) SoC with 8MB Flash and 8MB Octal PSRAM',
          x: 380,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: '3V3', type: 'power_in', connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '3', name: 'EN', type: 'input', connectedNet: 'NET_ESP_EN' },
            { number: '8', name: 'IO4_SDA', type: 'bidirectional', connectedNet: 'NET_I2C_SDA' },
            { number: '9', name: 'IO5_SCL', type: 'bidirectional', connectedNet: 'NET_I2C_SCL' },
            { number: '10', name: 'IO6_LED', type: 'output', connectedNet: 'NET_STATUS_LED' },
            { number: '40', name: 'EPAD_GND', type: 'power_in', connectedNet: 'GND' },
          ],
        },
        {
          id: 'C3',
          name: 'MCU Bypass Capacitor 100nF',
          mpn: 'CC0402KRX7R9BB104',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '100nF 50V X7R',
          lcscPart: 'C1525',
          description: 'High-frequency ceramic decoupling bypass for ESP32 3V3 rail',
          x: 350,
          y: 220,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'U3',
          name: 'BME280 Environmental Sensor',
          mpn: 'BME280',
          manufacturer: 'Bosch Sensortec',
          package: 'LGA-8',
          category: 'Sensor',
          value: 'Temp/Hum/Pressure',
          lcscPart: 'C92489',
          description: 'Digital humidity, pressure and temperature sensor with I2C/SPI interface',
          x: 520,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: 'CSB', type: 'input', connectedNet: '+3V3' },
            { number: '3', name: 'SDI_SDA', type: 'bidirectional', connectedNet: 'NET_I2C_SDA' },
            { number: '4', name: 'SCK_SCL', type: 'input', connectedNet: 'NET_I2C_SCL' },
            { number: '5', name: 'SDO_ADDR', type: 'input', connectedNet: 'GND' },
            { number: '6', name: 'VDDIO', type: 'power_in', connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '7', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '8', name: 'VDD', type: 'power_in', connectedNet: '+3V3', voltageLevel: 3.3 },
          ],
        },
        {
          id: 'R1',
          name: 'I2C SDA Pull-up Resistor 4.7k',
          mpn: 'RC0402FR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '4.7k 1% 1/16W',
          lcscPart: 'C25900',
          description: 'I2C SDA bus pull-up resistor to 3.3V',
          x: 480,
          y: 200,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'NET_I2C_SDA' },
          ],
        },
        {
          id: 'R2',
          name: 'I2C SCL Pull-up Resistor 4.7k',
          mpn: 'RC0402FR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '4.7k 1% 1/16W',
          lcscPart: 'C25900',
          description: 'I2C SCL bus pull-up resistor to 3.3V',
          x: 540,
          y: 200,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'NET_I2C_SCL' },
          ],
        },
        {
          id: 'D1',
          name: 'Status Indicator LED (Emerald Green)',
          mpn: 'KT-0603G',
          manufacturer: 'Hubei KENTO Elec',
          package: '0603',
          category: 'Discrete',
          value: 'Green 20mA',
          lcscPart: 'C2286',
          description: 'GPIO-controlled system heart-beat and status indicator LED',
          x: 650,
          y: 80,
          pins: [
            { number: '1', name: 'A', type: 'passive', connectedNet: 'NET_STATUS_LED' },
            { number: '2', name: 'K', type: 'passive', connectedNet: 'NET_LED_CATHODE' },
          ],
        },
        {
          id: 'R3',
          name: 'LED Current Limiting Resistor 1k',
          mpn: 'RC0402FR-071KL',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '1k 1% 1/16W',
          lcscPart: 'C11702',
          description: 'Current limiting series resistor for status LED (sets If ~ 1.5mA)',
          x: 650,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'NET_LED_CATHODE' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
      ],
      nets: [
        {
          id: 'GND',
          name: 'GND',
          netClass: 'ground',
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
          netClass: 'power',
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
          netClass: 'power',
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
          netClass: 'i2c',
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
          netClass: 'i2c',
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
          netClass: 'signal',
          connections: [
            { componentId: 'U1', pinNumber: '10' },
            { componentId: 'D1', pinNumber: '1' },
          ],
        },
        {
          id: 'NET_LED_CATHODE',
          name: 'LED_K',
          netClass: 'signal',
          connections: [
            { componentId: 'D1', pinNumber: '2' },
            { componentId: 'R3', pinNumber: '1' },
          ],
        },
      ],
      ercReport: [],
    },
  },
  {
    id: 'power_supply_5v_3v3',
    name: '5V to 3.3V Precision Regulated Power Supply',
    description: 'USB Type-C power input with ESD suppressor, AMS1117-3.3V LDO, input/output bulk and ceramic filtering, and power indicator LED.',
    graph: {
      metadata: {
        projectId: 'prj-power-supply',
        name: '5V to 3.3V Precision Regulated Power Supply',
        revision: 'v1.0',
        author: 'SuperAgent ECAD User',
        targetEcad: 'kicad8',
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
          category: 'Connector',
          lcscPart: 'C165948',
          description: 'USB Type-C 5V DC power input connector',
          x: 80,
          y: 80,
          pins: [
            { number: 'A1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: 'A4', name: 'VBUS', type: 'power_out', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'B4', name: 'VBUS', type: 'power_out', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
            { number: 'B1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
          ],
        },
        {
          id: 'C1',
          name: 'Input Bulk Capacitor 10uF',
          mpn: 'CL21A106KOQNNNE',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive',
          value: '10uF 25V X5R',
          lcscPart: 'C15849',
          description: 'Input ripple smoothing capacitor',
          x: 180,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'VBUS_5V' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'U1',
          name: 'AMS1117-3.3 Linear Regulator',
          mpn: 'AMS1117-3.3',
          manufacturer: 'Advanced Monolithic Systems',
          package: 'SOT-223-3',
          category: 'Power',
          value: '3.3V 1A',
          lcscPart: 'C6186',
          description: 'Positive fixed 3.3V low dropout regulator',
          x: 280,
          y: 80,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: 'VOUT', type: 'power_out', connectedNet: '+3V3', voltageLevel: 3.3 },
            { number: '3', name: 'VIN', type: 'power_in', connectedNet: 'VBUS_5V', voltageLevel: 5.0 },
          ],
        },
        {
          id: 'C2',
          name: 'Output Bulk Capacitor 22uF',
          mpn: 'CL21A226MOCLRNC',
          manufacturer: 'Samsung Electro-Mechanics',
          package: '0805',
          category: 'Passive',
          value: '22uF 16V X5R',
          lcscPart: 'C45783',
          description: 'Output stability tantalum/ceramic capacitor',
          x: 380,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'D1',
          name: '3.3V Power LED (Blue)',
          mpn: 'KT-0603B',
          manufacturer: 'Hubei KENTO Elec',
          package: '0603',
          category: 'Discrete',
          value: 'Blue 20mA',
          lcscPart: 'C2288',
          description: 'Output power rail active indicator LED',
          x: 480,
          y: 80,
          pins: [
            { number: '1', name: 'A', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: 'K', type: 'passive', connectedNet: 'NET_PWR_LED_K' },
          ],
        },
        {
          id: 'R1',
          name: 'LED Ballast Resistor 1.5k',
          mpn: 'RC0402FR-071K5L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '1.5k 1% 1/16W',
          lcscPart: 'C25879',
          description: 'Current limiting resistor for 3.3V indicator LED',
          x: 480,
          y: 160,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'NET_PWR_LED_K' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
      ],
      nets: [
        {
          id: 'GND',
          name: 'GND',
          netClass: 'ground',
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
          netClass: 'power',
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
          netClass: 'power',
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
          netClass: 'signal',
          connections: [
            { componentId: 'D1', pinNumber: '2' },
            { componentId: 'R1', pinNumber: '1' },
          ],
        },
      ],
      ercReport: [],
    },
  },
];

