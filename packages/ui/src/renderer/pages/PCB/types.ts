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

/** Starter Design Templates */
export function create45WUsbPdChargerGraph(): PCBGraph {
  return {
    metadata: {
      projectId: 'prj-usbpd-45w',
      name: '45W USB-PD Fast Charger (AC-DC QR Flyback)',
      revision: 'v1.0',
      author: 'SuperAgent ECAD Co-Pilot',
      targetEcad: 'kicad8',
      created: '2026-08-27',
      updated: '2026-08-27',
    },
    powerRails: [
      { id: 'AC_LIVE', voltage: 230, maxCurrent_mA: 2000, sourceComponentId: 'F1', sourcePinNumber: '1' },
      { id: 'HV_DC_BUS', voltage: 380, maxCurrent_mA: 500, sourceComponentId: 'BD1', sourcePinNumber: '1' },
      { id: 'VBUS_OUT', voltage: 20, maxCurrent_mA: 2250, sourceComponentId: 'Q_VBUS', sourcePinNumber: '3' },
      { id: 'V_AUX', voltage: 12, maxCurrent_mA: 100, sourceComponentId: 'T1', sourcePinNumber: '3' },
      { id: '+3V3_PD', voltage: 3.3, maxCurrent_mA: 50, sourceComponentId: 'U_PD', sourcePinNumber: '1' },
    ],
    components: [
      {
        id: 'F1',
        name: 'AC Input Fuse 2A 250V Time-Lag',
        mpn: '0215002.MXP',
        manufacturer: 'Littelfuse',
        package: 'Axial-5x20mm',
        category: 'Passive',
        value: '2A 250V',
        lcscPart: 'C97123',
        description: '2A 250V Slow-Blow Ceramic Body Cartridge Fuse for AC mains overcurrent safety',
        x: 60,
        y: 80,
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
        description: '14mm 470V Metal Oxide Varistor for AC line surge and lightning protection',
        x: 60,
        y: 190,
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
        description: 'Dual winding common-mode filter inductor for conducted EMI suppression',
        x: 170,
        y: 120,
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
        description: 'Full-bridge rectifier 1000V VRRM for AC to high-voltage DC rectification',
        x: 280,
        y: 120,
        pins: [
          { number: '1', name: '+', type: 'power_out', voltageLevel: 380, connectedNet: 'HV_DC_BUS' },
          { number: '2', name: '-', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '3', name: '~1', type: 'power_in', connectedNet: 'NET_CMC_L' },
          { number: '4', name: '~2', type: 'power_in', connectedNet: 'NET_CMC_N' },
        ],
      },
      {
        id: 'C_BULK',
        name: 'High-Voltage Bulk Electrolytic Cap',
        mpn: '400YXG68MEFC12.5X20',
        manufacturer: 'Rubycon',
        package: 'Radial-12.5x20',
        category: 'Passive',
        value: '68uF 400V',
        lcscPart: 'C45192',
        description: '400V 68µF 105°C High ripple current primary reservoir capacitor',
        x: 370,
        y: 120,
        pins: [
          { number: '1', name: '+', type: 'passive', connectedNet: 'HV_DC_BUS' },
          { number: '2', name: '-', type: 'passive', connectedNet: 'GND_PRI' },
        ],
      },
      {
        id: 'U_PRI',
        name: 'InnoSwitch3-Pro Off-Line Switcher',
        mpn: 'INN3378C-H302',
        manufacturer: 'Power Integrations',
        package: 'InSOP-24D',
        category: 'Power',
        lcscPart: 'C289139',
        description: 'Integrated 750V PowiGaN Primary Switch, FluxLink Feedback & Synchronous Rectification Driver',
        x: 480,
        y: 120,
        pins: [
          { number: '1', name: 'DRAIN', type: 'power_in', voltageLevel: 380, connectedNet: 'NET_PRI_DRAIN' },
          { number: '2', name: 'SOURCE', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '3', name: 'BPP', type: 'passive', connectedNet: 'NET_PRI_BPP' },
          { number: '4', name: 'V', type: 'input', voltageLevel: 380, connectedNet: 'HV_DC_BUS' },
          { number: '13', name: 'BPS', type: 'power_in', connectedNet: 'NET_SEC_BPS' },
          { number: '14', name: 'SR', type: 'output', connectedNet: 'NET_SR_GATE' },
          { number: '15', name: 'GND_SEC', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '16', name: 'FB', type: 'input', connectedNet: 'NET_SEC_FB' },
          { number: '17', name: 'SDA', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SDA' },
          { number: '18', name: 'SCL', type: 'input', voltageLevel: 3.3, connectedNet: 'NET_I2C_SCL' },
        ],
      },
      {
        id: 'T1',
        name: 'EE19 45W Isolation Transformer',
        mpn: 'CST-EE19-45W-PD',
        manufacturer: 'Custom Power Magnetics',
        package: 'EE19-SMD-10P',
        category: 'Passive',
        value: '45W 130kHz',
        lcscPart: 'C99210',
        description: 'Reinforced 6.4mm Creepage isolation transformer with primary, secondary, and auxiliary bias windings',
        x: 600,
        y: 120,
        pins: [
          { number: '1', name: 'PRI_P1', type: 'passive', connectedNet: 'HV_DC_BUS' },
          { number: '2', name: 'PRI_P2', type: 'passive', connectedNet: 'NET_PRI_DRAIN' },
          { number: '3', name: 'AUX+', type: 'power_out', voltageLevel: 12, connectedNet: 'V_AUX' },
          { number: '4', name: 'AUX-', type: 'power_in', connectedNet: 'GND_PRI' },
          { number: '5', name: 'SEC_S1', type: 'power_out', voltageLevel: 20, connectedNet: 'NET_SEC_RAW' },
          { number: '6', name: 'SEC_S2', type: 'power_in', connectedNet: 'GND_SEC' },
        ],
      },
      {
        id: 'Q_SR',
        name: 'Synchronous Rectifier N-MOSFET',
        mpn: 'AON6260',
        manufacturer: 'Alpha & Omega',
        package: 'DFN5x6',
        category: 'Discrete',
        value: '60V 50A 2.5mΩ',
        lcscPart: 'C48291',
        description: '60V 50A ultra-low Rds(on) Synchronous Rectifier for high efficiency 94%+ secondary side rectification',
        x: 720,
        y: 80,
        pins: [
          { number: '1', name: 'S', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '2', name: 'G', type: 'input', connectedNet: 'NET_SR_GATE' },
          { number: '3', name: 'D', type: 'power_in', connectedNet: 'NET_SEC_RAW' },
        ],
      },
      {
        id: 'U_PD',
        name: 'CYPD3177 EZ-PD USB-PD Controller',
        mpn: 'CYPD3177-24LQXQ',
        manufacturer: 'Infineon / Cypress',
        package: 'QFN-24',
        category: 'Interface',
        lcscPart: 'C284918',
        description: 'Hardware USB Type-C PD 3.0 & PPS Controller supporting 5V/3A, 9V/3A, 15V/3A, 20V/2.25A (45W Max)',
        x: 720,
        y: 220,
        pins: [
          { number: '1', name: 'VDDD', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3_PD' },
          { number: '2', name: 'VSS', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '3', name: 'VBUS_IN', type: 'power_in', voltageLevel: 20, connectedNet: 'NET_SEC_RAW' },
          { number: '4', name: 'VBUS_GATE', type: 'output', connectedNet: 'NET_VBUS_GATE' },
          { number: '5', name: 'CC1', type: 'bidirectional', connectedNet: 'NET_CC1' },
          { number: '6', name: 'CC2', type: 'bidirectional', connectedNet: 'NET_CC2' },
          { number: '7', name: 'DP', type: 'bidirectional', connectedNet: 'NET_USB_DP' },
          { number: '8', name: 'DM', type: 'bidirectional', connectedNet: 'NET_USB_DM' },
          { number: '9', name: 'I2C_SDA', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SDA' },
          { number: '10', name: 'I2C_SCL', type: 'input', voltageLevel: 3.3, connectedNet: 'NET_I2C_SCL' },
        ],
      },
      {
        id: 'Q_VBUS',
        name: 'Dual Back-to-Back N-MOSFET VBUS Switch',
        mpn: 'EMB04N03H',
        manufacturer: 'Excelliance MOS',
        package: 'PDFN3333',
        category: 'Discrete',
        value: '30V 20A 4.2mΩ',
        lcscPart: 'C98124',
        description: 'Dual common-drain N-Channel MOSFET power gating switch to protect against reverse current',
        x: 840,
        y: 120,
        pins: [
          { number: '1', name: 'S1', type: 'power_in', connectedNet: 'NET_SEC_RAW' },
          { number: '2', name: 'G1', type: 'input', connectedNet: 'NET_VBUS_GATE' },
          { number: '3', name: 'D1/D2', type: 'power_out', voltageLevel: 20, connectedNet: 'VBUS_OUT' },
        ],
      },
      {
        id: 'C_OUT',
        name: 'Solid Polymer Output Filter Cap',
        mpn: '25SEPF470M',
        manufacturer: 'Panasonic',
        package: 'SMD-8x10',
        category: 'Passive',
        value: '470uF 25V',
        lcscPart: 'C89182',
        description: '25V 470µF Ultra-low ESR Solid Conductive Polymer Aluminum Capacitor for ripple smoothing',
        x: 840,
        y: 220,
        pins: [
          { number: '1', name: '+', type: 'passive', connectedNet: 'VBUS_OUT' },
          { number: '2', name: '-', type: 'passive', connectedNet: 'GND_SEC' },
        ],
      },
      {
        id: 'J_USBC',
        name: 'USB Type-C 24-Pin Receptacle',
        mpn: 'TYPE-C-31-M-12',
        manufacturer: 'Korean Hroparts',
        package: 'USB-C-24P',
        category: 'Connector',
        lcscPart: 'C165948',
        description: 'USB Type-C Female Connector for 45W Power Delivery output sink connection',
        x: 960,
        y: 160,
        pins: [
          { number: 'A1', name: 'GND', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: 'A4', name: 'VBUS', type: 'power_out', voltageLevel: 20, connectedNet: 'VBUS_OUT' },
          { number: 'A5', name: 'CC1', type: 'bidirectional', connectedNet: 'NET_CC1' },
          { number: 'A6', name: 'DP1', type: 'bidirectional', connectedNet: 'NET_USB_DP' },
          { number: 'A7', name: 'DN1', type: 'bidirectional', connectedNet: 'NET_USB_DM' },
          { number: 'B5', name: 'CC2', type: 'bidirectional', connectedNet: 'NET_CC2' },
          { number: 'B12', name: 'GND', type: 'power_in', connectedNet: 'GND_SEC' },
        ],
      },
      {
        id: 'U_ESD',
        name: 'USBLC6-2SC6 ESD Array',
        mpn: 'USBLC6-2SC6',
        manufacturer: 'STMicroelectronics',
        package: 'SOT-23-6',
        category: 'Discrete',
        lcscPart: 'C7519',
        description: 'Very low capacitance ESD protection array for Type-C high speed data and CC lines',
        x: 960,
        y: 270,
        pins: [
          { number: '1', name: 'I/O1', type: 'passive', connectedNet: 'NET_USB_DP' },
          { number: '2', name: 'GND', type: 'power_in', connectedNet: 'GND_SEC' },
          { number: '3', name: 'I/O2', type: 'passive', connectedNet: 'NET_USB_DM' },
          { number: '4', name: 'I/O3', type: 'passive', connectedNet: 'NET_CC1' },
          { number: '5', name: 'VBUS', type: 'power_in', voltageLevel: 20, connectedNet: 'VBUS_OUT' },
          { number: '6', name: 'I/O4', type: 'passive', connectedNet: 'NET_CC2' },
        ],
      },
    ],
    nets: [
      { id: 'AC_LIVE', name: 'AC_LIVE', netClass: 'power', voltage: 230, connections: [{ componentId: 'F1', pinNumber: '1' }] },
      { id: 'AC_NEUTRAL', name: 'AC_NEUTRAL', netClass: 'power', voltage: 0, connections: [{ componentId: 'RV1', pinNumber: '2' }, { componentId: 'L1', pinNumber: '3' }] },
      { id: 'NET_FUSE_OUT', name: 'FUSE_OUT', netClass: 'power', connections: [{ componentId: 'F1', pinNumber: '2' }, { componentId: 'RV1', pinNumber: '1' }, { componentId: 'L1', pinNumber: '1' }] },
      { id: 'NET_CMC_L', name: 'CMC_L', netClass: 'power', connections: [{ componentId: 'L1', pinNumber: '2' }, { componentId: 'BD1', pinNumber: '3' }] },
      { id: 'NET_CMC_N', name: 'CMC_N', netClass: 'power', connections: [{ componentId: 'L1', pinNumber: '4' }, { componentId: 'BD1', pinNumber: '4' }] },
      { id: 'HV_DC_BUS', name: 'HV_DC_BUS', netClass: 'power', voltage: 380, connections: [{ componentId: 'BD1', pinNumber: '1' }, { componentId: 'C_BULK', pinNumber: '1' }, { componentId: 'T1', pinNumber: '1' }, { componentId: 'U_PRI', pinNumber: '4' }] },
      { id: 'GND_PRI', name: 'GND_PRI', netClass: 'ground', voltage: 0, connections: [{ componentId: 'BD1', pinNumber: '2' }, { componentId: 'C_BULK', pinNumber: '2' }, { componentId: 'U_PRI', pinNumber: '2' }, { componentId: 'T1', pinNumber: '4' }] },
      { id: 'NET_PRI_DRAIN', name: 'PRI_DRAIN', netClass: 'power', connections: [{ componentId: 'T1', pinNumber: '2' }, { componentId: 'U_PRI', pinNumber: '1' }] },
      { id: 'NET_SEC_RAW', name: 'SEC_RAW', netClass: 'power', voltage: 20, connections: [{ componentId: 'T1', pinNumber: '5' }, { componentId: 'Q_SR', pinNumber: '3' }, { componentId: 'U_PD', pinNumber: '3' }, { componentId: 'Q_VBUS', pinNumber: '1' }] },
      { id: 'GND_SEC', name: 'GND_SEC', netClass: 'ground', voltage: 0, connections: [{ componentId: 'T1', pinNumber: '6' }, { componentId: 'Q_SR', pinNumber: '1' }, { componentId: 'U_PRI', pinNumber: '15' }, { componentId: 'U_PD', pinNumber: '2' }, { componentId: 'C_OUT', pinNumber: '2' }, { componentId: 'J_USBC', pinNumber: 'A1' }, { componentId: 'J_USBC', pinNumber: 'B12' }, { componentId: 'U_ESD', pinNumber: '2' }] },
      { id: 'NET_SR_GATE', name: 'SR_GATE', netClass: 'signal', connections: [{ componentId: 'U_PRI', pinNumber: '14' }, { componentId: 'Q_SR', pinNumber: '2' }] },
      { id: 'VBUS_OUT', name: 'VBUS_OUT', netClass: 'power', voltage: 20, connections: [{ componentId: 'Q_VBUS', pinNumber: '3' }, { componentId: 'C_OUT', pinNumber: '1' }, { componentId: 'J_USBC', pinNumber: 'A4' }, { componentId: 'U_ESD', pinNumber: '5' }] },
      { id: 'NET_VBUS_GATE', name: 'VBUS_GATE', netClass: 'signal', connections: [{ componentId: 'U_PD', pinNumber: '4' }, { componentId: 'Q_VBUS', pinNumber: '2' }] },
      { id: 'NET_CC1', name: 'CC1', netClass: 'signal', connections: [{ componentId: 'U_PD', pinNumber: '5' }, { componentId: 'J_USBC', pinNumber: 'A5' }, { componentId: 'U_ESD', pinNumber: '4' }] },
      { id: 'NET_CC2', name: 'CC2', netClass: 'signal', connections: [{ componentId: 'U_PD', pinNumber: '6' }, { componentId: 'J_USBC', pinNumber: 'B5' }, { componentId: 'U_ESD', pinNumber: '6' }] },
      { id: 'NET_USB_DP', name: 'USB_DP', netClass: 'diff_pair_pos', connections: [{ componentId: 'U_PD', pinNumber: '7' }, { componentId: 'J_USBC', pinNumber: 'A6' }, { componentId: 'U_ESD', pinNumber: '1' }] },
      { id: 'NET_USB_DM', name: 'USB_DM', netClass: 'diff_pair_neg', connections: [{ componentId: 'U_PD', pinNumber: '8' }, { componentId: 'J_USBC', pinNumber: 'A7' }, { componentId: 'U_ESD', pinNumber: '3' }] },
      { id: 'NET_I2C_SDA', name: 'I2C_SDA', netClass: 'i2c', connections: [{ componentId: 'U_PRI', pinNumber: '17' }, { componentId: 'U_PD', pinNumber: '9' }] },
      { id: 'NET_I2C_SCL', name: 'I2C_SCL', netClass: 'i2c', connections: [{ componentId: 'U_PRI', pinNumber: '18' }, { componentId: 'U_PD', pinNumber: '10' }] },
    ],
    ercReport: [],
  };
}

export const STARTER_TEMPLATES: { id: string; name: string; description: string; graph: PCBGraph }[] = [
  {
    id: 'empty',
    name: 'New Empty Design',
    description: 'Start with a clean blank canvas with zero components or nets.',
    graph: createEmptyProjectGraph(),
  },
  {
    id: 'usbpd-45w-charger',
    name: 'Template: 45W USB-PD AC-DC Charger',
    description: '45W USB Power Delivery 3.0 & PPS AC-DC QR Flyback Converter with InnoSwitch3-Pro, CYPD3177 and Type-C.',
    graph: create45WUsbPdChargerGraph(),
  },
  {
    id: 'esp32s3-sensor-node',
    name: 'Template: ESP32-S3 Sensor Node',
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
