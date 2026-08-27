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
  | 'usb';

export interface ComponentPin {
  number: string;
  name: string;
  type: PinType;
  voltageLevel?: number; // e.g. 3.3, 5.0, 1.8
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

/** Starter Design Templates */
export const STARTER_TEMPLATES: { id: string; name: string; description: string; graph: PCBGraph }[] = [
  {
    id: 'esp32s3-sensor-node',
    name: 'ESP32-S3 IoT Environmental Sensor Node',
    description: 'ESP32-S3 with BME680 Sensor, Type-C Power with ESD, and 3.3V LDO Regulator.',
    graph: {
      metadata: {
        projectId: 'prj-esp32-node',
        name: 'ESP32-S3 Environmental Sensor Node',
        revision: 'v1.0',
        author: 'SuperAgent ECAD Co-Pilot',
        targetEcad: 'kicad8',
        created: '2026-08-27',
        updated: '2026-08-27',
      },
      powerRails: [
        { id: 'VBUS_5V', voltage: 5.0, maxCurrent_mA: 1500, sourceComponentId: 'J1', sourcePinNumber: 'A4' },
        { id: '+3V3', voltage: 3.3, maxCurrent_mA: 600, sourceComponentId: 'U2', sourcePinNumber: '5' },
      ],
      components: [
        {
          id: 'U1',
          name: 'ESP32-S3-WROOM-1',
          mpn: 'ESP32-S3-WROOM-1-N8R8',
          manufacturer: 'Espressif Systems',
          package: 'Module-41',
          category: 'MCU',
          lcscPart: 'C2913199',
          description: '2.4 GHz Wi-Fi & Bluetooth 5 (LE) MCU Module',
          x: 400,
          y: 120,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: '3V3', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '3', name: 'EN / CHIP_PU', type: 'input', voltageLevel: 3.3, connectedNet: 'NET_RESET' },
            { number: '4', name: 'IO4 / I2C_SDA', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SDA' },
            { number: '5', name: 'IO5 / I2C_SCL', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SCL' },
            { number: '19', name: 'USB_D-', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_USB_DM' },
            { number: '20', name: 'USB_D+', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_USB_DP' },
            { number: '41', name: 'GND_PAD', type: 'power_in', connectedNet: 'GND' },
          ],
        },
        {
          id: 'U2',
          name: 'AP2112K-3.3 LDO',
          mpn: 'AP2112K-3.3TRG1',
          manufacturer: 'Diodes Inc',
          package: 'SOT-23-5',
          category: 'Power',
          lcscPart: 'C52377',
          description: '600mA Low Dropout Linear Voltage Regulator',
          x: 180,
          y: 140,
          pins: [
            { number: '1', name: 'VIN', type: 'power_in', voltageLevel: 5.0, connectedNet: 'VBUS_5V' },
            { number: '2', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '3', name: 'EN', type: 'input', voltageLevel: 5.0, connectedNet: 'VBUS_5V' },
            { number: '5', name: 'VOUT', type: 'power_out', voltageLevel: 3.3, connectedNet: '+3V3' },
          ],
        },
        {
          id: 'U3',
          name: 'BME680 Gas/Temp/Humidity Sensor',
          mpn: 'BME680',
          manufacturer: 'Bosch Sensortec',
          package: 'LGA-8',
          category: 'Sensor',
          lcscPart: 'C125866',
          description: 'Low power gas, pressure, temperature & humidity sensor',
          x: 680,
          y: 130,
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: 'CSB', type: 'input', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '3', name: 'SDI / SDA', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SDA' },
            { number: '4', name: 'SCK / SCL', type: 'input', voltageLevel: 3.3, connectedNet: 'NET_I2C_SCL' },
            { number: '5', name: 'SDO / ADDR', type: 'input', voltageLevel: 3.3, connectedNet: 'GND' },
            { number: '6', name: 'VDDIO', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '8', name: 'VDD', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
          ],
        },
        {
          id: 'J1',
          name: 'USB Type-C Connector',
          mpn: 'TYPE-C-31-M-12',
          manufacturer: 'Korean Hroparts',
          package: 'USB-C-16P',
          category: 'Connector',
          lcscPart: 'C165948',
          description: 'USB Type-C Receptacle 16-Pin with 5.1k CC pull-downs',
          x: 40,
          y: 220,
          pins: [
            { number: 'A1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: 'A4', name: 'VBUS', type: 'power_out', voltageLevel: 5.0, connectedNet: 'VBUS_5V' },
            { number: 'A5', name: 'CC1', type: 'passive', connectedNet: 'NET_CC1' },
            { number: 'A6', name: 'DP1', type: 'bidirectional', connectedNet: 'NET_USB_DP' },
            { number: 'A7', name: 'DN1', type: 'bidirectional', connectedNet: 'NET_USB_DM' },
            { number: 'B5', name: 'CC2', type: 'passive', connectedNet: 'NET_CC2' },
          ],
        },
        {
          id: 'U4',
          name: 'USBLC6-2SC6 ESD Protection',
          mpn: 'USBLC6-2SC6',
          manufacturer: 'STMicroelectronics',
          package: 'SOT-23-6',
          category: 'Discrete',
          lcscPart: 'C7519',
          description: 'Very low capacitance ESD protection array for high speed data lines',
          x: 200,
          y: 320,
          pins: [
            { number: '1', name: 'I/O1', type: 'passive', connectedNet: 'NET_USB_DP' },
            { number: '2', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '3', name: 'I/O2', type: 'passive', connectedNet: 'NET_USB_DM' },
            { number: '5', name: 'VBUS', type: 'power_in', voltageLevel: 5.0, connectedNet: 'VBUS_5V' },
          ],
        },
        {
          id: 'R1',
          name: 'I2C Pull-Up SDA',
          mpn: 'RC0402JR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '4.7k',
          lcscPart: 'C25900',
          description: '4.7k Ohm 1% 0402 Pull-up Resistor for I2C SDA',
          x: 550,
          y: 80,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'NET_I2C_SDA' },
          ],
        },
        {
          id: 'R2',
          name: 'I2C Pull-Up SCL',
          mpn: 'RC0402JR-074K7L',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '4.7k',
          lcscPart: 'C25900',
          description: '4.7k Ohm 1% 0402 Pull-up Resistor for I2C SCL',
          x: 550,
          y: 180,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'NET_I2C_SCL' },
          ],
        },
        {
          id: 'C1',
          name: 'LDO Input Cap',
          mpn: 'CL05A106MP5NUNC',
          manufacturer: 'Samsung',
          package: '0402',
          category: 'Passive',
          value: '10uF 10V X5R',
          lcscPart: 'C19702',
          description: '10uF Ceramic Decoupling Capacitor on VIN',
          x: 120,
          y: 90,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'VBUS_5V' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'C2',
          name: 'LDO Output Bulk Cap',
          mpn: 'CL05A106MP5NUNC',
          manufacturer: 'Samsung',
          package: '0402',
          category: 'Passive',
          value: '10uF 10V X5R',
          lcscPart: 'C19702',
          description: '10uF Output Bulk Stability Capacitor on +3V3',
          x: 280,
          y: 90,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
        {
          id: 'C3',
          name: 'BME680 Decoupling Cap',
          mpn: 'CC0402KRX7R9BB104',
          manufacturer: 'Yageo',
          package: '0402',
          category: 'Passive',
          value: '100nF 50V X7R',
          lcscPart: 'C1525',
          description: '100nF High-frequency Decoupling Capacitor for Sensor VDD',
          x: 640,
          y: 220,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
            { number: '2', name: '2', type: 'passive', connectedNet: 'GND' },
          ],
        },
      ],
      nets: [
        {
          id: 'VBUS_5V',
          name: 'VBUS_5V',
          netClass: 'power',
          voltage: 5.0,
          connections: [
            { componentId: 'J1', pinNumber: 'A4' },
            { componentId: 'U2', pinNumber: '1' },
            { componentId: 'U2', pinNumber: '3' },
            { componentId: 'U4', pinNumber: '5' },
            { componentId: 'C1', pinNumber: '1' },
          ],
        },
        {
          id: '+3V3',
          name: '+3V3',
          netClass: 'power',
          voltage: 3.3,
          connections: [
            { componentId: 'U2', pinNumber: '5' },
            { componentId: 'U1', pinNumber: '2' },
            { componentId: 'U3', pinNumber: '2' },
            { componentId: 'U3', pinNumber: '6' },
            { componentId: 'U3', pinNumber: '8' },
            { componentId: 'R1', pinNumber: '1' },
            { componentId: 'R2', pinNumber: '1' },
            { componentId: 'C2', pinNumber: '1' },
            { componentId: 'C3', pinNumber: '1' },
          ],
        },
        {
          id: 'GND',
          name: 'GND',
          netClass: 'ground',
          voltage: 0.0,
          connections: [
            { componentId: 'J1', pinNumber: 'A1' },
            { componentId: 'U2', pinNumber: '2' },
            { componentId: 'U1', pinNumber: '1' },
            { componentId: 'U1', pinNumber: '41' },
            { componentId: 'U3', pinNumber: '1' },
            { componentId: 'U3', pinNumber: '5' },
            { componentId: 'U4', pinNumber: '2' },
            { componentId: 'C1', pinNumber: '2' },
            { componentId: 'C2', pinNumber: '2' },
            { componentId: 'C3', pinNumber: '2' },
          ],
        },
        {
          id: 'NET_I2C_SDA',
          name: 'I2C_SDA',
          netClass: 'i2c',
          connections: [
            { componentId: 'U1', pinNumber: '4' },
            { componentId: 'U3', pinNumber: '3' },
            { componentId: 'R1', pinNumber: '2' },
          ],
          properties: { pullUpRequired: true, pullUpResistorValue: '4.7k' },
        },
        {
          id: 'NET_I2C_SCL',
          name: 'I2C_SCL',
          netClass: 'i2c',
          connections: [
            { componentId: 'U1', pinNumber: '5' },
            { componentId: 'U3', pinNumber: '4' },
            { componentId: 'R2', pinNumber: '2' },
          ],
          properties: { pullUpRequired: true, pullUpResistorValue: '4.7k' },
        },
        {
          id: 'NET_USB_DP',
          name: 'USB_DP',
          netClass: 'usb',
          connections: [
            { componentId: 'J1', pinNumber: 'A6' },
            { componentId: 'U4', pinNumber: '1' },
            { componentId: 'U1', pinNumber: '20' },
          ],
          properties: { diffPairMatch: 'NET_USB_DM' },
        },
        {
          id: 'NET_USB_DM',
          name: 'USB_DM',
          netClass: 'usb',
          connections: [
            { componentId: 'J1', pinNumber: 'A7' },
            { componentId: 'U4', pinNumber: '3' },
            { componentId: 'U1', pinNumber: '19' },
          ],
          properties: { diffPairMatch: 'NET_USB_DP' },
        },
      ],
      ercReport: [],
    },
  },
  {
    id: 'rp2040-macropad',
    name: 'RP2040 Dual-Core USB Controller',
    description: 'Raspberry Pi RP2040 MCU with 16MB QSPI Flash, 12MHz Crystal oscillator, and USB-C.',
    graph: {
      metadata: {
        projectId: 'prj-rp2040-ctrl',
        name: 'RP2040 USB Controller Subsystem',
        revision: 'v1.0',
        author: 'SuperAgent ECAD Co-Pilot',
        targetEcad: 'kicad8',
        created: '2026-08-27',
        updated: '2026-08-27',
      },
      powerRails: [
        { id: 'VBUS_5V', voltage: 5.0, maxCurrent_mA: 1000, sourceComponentId: 'J1', sourcePinNumber: 'VBUS' },
        { id: '+3V3', voltage: 3.3, maxCurrent_mA: 500, sourceComponentId: 'U2', sourcePinNumber: 'VOUT' },
        { id: '+1V1_CORE', voltage: 1.1, maxCurrent_mA: 100, sourceComponentId: 'U1', sourcePinNumber: 'VREG_VOUT' },
      ],
      components: [
        {
          id: 'U1',
          name: 'RP2040 Dual-Core ARM MCU',
          mpn: 'RP2040',
          manufacturer: 'Raspberry Pi',
          package: 'QFN-56',
          category: 'MCU',
          lcscPart: 'C2040',
          description: 'Dual Cortex-M0+ MCU with 264KB SRAM and PIO',
          x: 380,
          y: 130,
          pins: [
            { number: '1', name: 'IOVDD', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '10', name: 'IOVDD', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '44', name: 'VREG_VIN', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '45', name: 'VREG_VOUT', type: 'power_out', voltageLevel: 1.1, connectedNet: '+1V1_CORE' },
            { number: '57', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '47', name: 'USB_DP', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_USB_DP' },
            { number: '46', name: 'USB_DM', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_USB_DM' },
            { number: '20', name: 'XIN', type: 'input', connectedNet: 'NET_OSC_IN' },
            { number: '21', name: 'XOUT', type: 'output', connectedNet: 'NET_OSC_OUT' },
          ],
        },
        {
          id: 'U2',
          name: 'RT9013-33GB 3.3V LDO',
          mpn: 'RT9013-33GB',
          manufacturer: 'Richtek',
          package: 'SOT-23-5',
          category: 'Power',
          lcscPart: 'C28803',
          description: '500mA Ultra-Low Dropout LDO Regulator',
          x: 140,
          y: 130,
          pins: [
            { number: 'VIN', name: 'VIN', type: 'power_in', voltageLevel: 5.0, connectedNet: 'VBUS_5V' },
            { number: 'GND', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: 'VOUT', name: 'VOUT', type: 'power_out', voltageLevel: 3.3, connectedNet: '+3V3' },
          ],
        },
        {
          id: 'Y1',
          name: '12MHz Crystal Oscillator',
          mpn: 'X322512MOB4SI',
          manufacturer: 'Yangxing Tech',
          package: 'SMD-3225',
          category: 'Discrete',
          value: '12.000MHz 10pF',
          lcscPart: 'C9002',
          description: '12MHz ±10ppm Crystal for MCU PLL clocking',
          x: 580,
          y: 190,
          pins: [
            { number: '1', name: '1', type: 'passive', connectedNet: 'NET_OSC_IN' },
            { number: '2', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '3', name: '2', type: 'passive', connectedNet: 'NET_OSC_OUT' },
            { number: '4', name: 'GND', type: 'power_in', connectedNet: 'GND' },
          ],
        },
      ],
      nets: [
        {
          id: '+3V3',
          name: '+3V3',
          netClass: 'power',
          voltage: 3.3,
          connections: [
            { componentId: 'U2', pinNumber: 'VOUT' },
            { componentId: 'U1', pinNumber: '1' },
            { componentId: 'U1', pinNumber: '10' },
            { componentId: 'U1', pinNumber: '44' },
          ],
        },
        {
          id: '+1V1_CORE',
          name: '+1V1_CORE',
          netClass: 'power',
          voltage: 1.1,
          connections: [{ componentId: 'U1', pinNumber: '45' }],
        },
        {
          id: 'GND',
          name: 'GND',
          netClass: 'ground',
          voltage: 0.0,
          connections: [
            { componentId: 'U1', pinNumber: '57' },
            { componentId: 'U2', pinNumber: 'GND' },
            { componentId: 'Y1', pinNumber: '2' },
            { componentId: 'Y1', pinNumber: '4' },
          ],
        },
      ],
      ercReport: [],
    },
  },
];
