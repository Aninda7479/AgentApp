import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar } from './TitleBar';
import { PCBWorkspacePage } from '../pages/PCB/PCBWorkspacePage';
import { PCB3DPreview } from '../pages/PCB/PCB3DPreview';
import { runElectricalRulesCheck } from '../pages/PCB/ercEngine';
import { STARTER_TEMPLATES } from '../pages/PCB/types';
import { exportToKiCad, exportToAltiumNetlist, exportToSKiDL, exportToBOM } from '../pages/PCB/exporters';

describe('TitleBar Top Bar - PCB Workspace Link', () => {
  it('renders TitleBar with PCB Workspace link in top bar and File menu', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        onOpenArtifacts={vi.fn()}
        onOpenPCBWorkspace={vi.fn()}
      />
    );
    expect(html).toContain('titlebar-pcb-workspace-link');
    expect(html).toContain('PCB Workspace');
    expect(html).toContain('titlebar-artifacts-link');
    expect(html).toContain('Artifacts');
  });
});

describe('PCBWorkspacePage Glass View Selector Workspace Component', () => {
  it('renders Glass View Selector Studio, view switcher, and AI Co-Pilot command deck', () => {
    const html = renderToStaticMarkup(
      <PCBWorkspacePage
        triggerToast={vi.fn()}
        onBack={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    expect(html).toContain('Schematic &amp; Chips');
    expect(html).toContain('What would you like to change or create?');
    expect(html).toContain('Export');
  });

  it('renders 3D physical board preview with solder mask & SMD chip packages', () => {
    const sampleGraph = STARTER_TEMPLATES[0].graph;
    const html = renderToStaticMarkup(
      <PCB3DPreview
        graph={sampleGraph}
        selectedCompId={null}
      />
    );
    expect(html).toContain('Rotate Board 90°');
    expect(html).toContain('Toggle ENIG Pads');
    expect(html).toContain('Traces');
  });
});

describe('Electrical Rules Checking (ERC) Engine', () => {
  const testGraph = {
    ...STARTER_TEMPLATES[0].graph,
    components: [
      {
        id: 'U1',
        name: 'MCU',
        mpn: 'TEST-MCU-1',
        manufacturer: 'Generic',
        package: 'QFN-32',
        category: 'MCU' as const,
        description: 'Test MCU',
        pins: [
          { number: '1', name: 'VCC', type: 'power_in' as const, connectedNet: '+3V3' },
          { number: '2', name: 'GND', type: 'power_in' as const, connectedNet: 'GND' },
        ],
      },
    ],
    nets: [
      { id: '+3V3', name: '+3V3', netClass: 'power' as const, connections: [{ componentId: 'U1', pinNumber: '1' }] },
      { id: 'GND', name: 'GND', netClass: 'ground' as const, connections: [{ componentId: 'U1', pinNumber: '2' }] },
    ],
  };

  it('passes on valid circuit with zero short circuits', () => {
    const errors = runElectricalRulesCheck(testGraph);
    const shorts = errors.filter((e) => e.category === 'power');
    expect(shorts.length).toBe(0);
  });

  it('flags direct power-to-ground short circuits', () => {
    const brokenGraph = JSON.parse(JSON.stringify(testGraph));
    // Intentionally short +3V3 to GND on pin
    brokenGraph.nets.find((n: any) => n.id === 'GND')?.connections.push({ componentId: 'U1', pinNumber: '1' });
    const errors = runElectricalRulesCheck(brokenGraph);
    const powerShort = errors.find((e) => e.id.includes('erc-short'));
    expect(powerShort).toBeDefined();
    expect(powerShort?.severity).toBe('error');
  });
});

describe('ECAD Multi-Format Exporters', () => {
  const sampleGraph = {
    ...STARTER_TEMPLATES[0].graph,
    metadata: {
      ...STARTER_TEMPLATES[0].graph.metadata,
      name: 'Dynamic Sensor Board',
    },
    components: [
      {
        id: 'U1',
        name: 'Microcontroller',
        mpn: 'MCU-001',
        manufacturer: 'Generic',
        package: 'QFN-32',
        category: 'MCU' as const,
        description: 'Main MCU',
        lcscPart: 'C12345',
        pins: [
          { number: '1', name: 'SDA', type: 'bidirectional' as const, connectedNet: 'I2C_SDA' },
        ],
      },
    ],
    nets: [
      { id: 'I2C_SDA', name: 'I2C_SDA', netClass: 'i2c' as const, connections: [{ componentId: 'U1', pinNumber: '1' }] },
    ],
  };

  it('exports valid KiCad 8/9 S-Expression schematic', () => {
    const { schematic, project } = exportToKiCad(sampleGraph);
    expect(schematic).toContain('(kicad_sch');
    expect(schematic).toContain('U1');
    expect(schematic).toContain('(global_label "I2C_SDA"');
    expect(project).toContain('kicad_pro');
  });

  it('exports valid Altium Protel 2 Netlist', () => {
    const netlist = exportToAltiumNetlist(sampleGraph);
    expect(netlist).toContain('PROTEL ADVANCED PCB NETLIST 2.0');
    expect(netlist).toContain('MCU-001');
    expect(netlist).toContain('I2C_SDA');
  });

  it('exports valid SKiDL Python code', () => {
    const skidl = exportToSKiDL(sampleGraph);
    expect(skidl).toContain('from skidl import *');
    expect(skidl).toContain('set_default_tool(KICAD8)');
  });

  it('exports manufacturing BOM CSV with JLCPCB / LCSC part numbers', () => {
    const bom = exportToBOM(sampleGraph);
    expect(bom).toContain('Designator,Quantity,Name,Value,Package,Manufacturer,MPN,LCSC Part #,Description');
    expect(bom).toContain('C12345');
  });
});
