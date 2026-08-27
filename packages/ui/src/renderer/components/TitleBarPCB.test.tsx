import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar } from './TitleBar';
import { PCBWorkspacePage } from '../pages/PCB/PCBWorkspacePage';
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

describe('PCBWorkspacePage Component', () => {
  it('renders PCB Workspace header, chips canvas, and AI Co-Pilot', () => {
    const html = renderToStaticMarkup(
      <PCBWorkspacePage
        triggerToast={vi.fn()}
        onBack={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    expect(html).toContain('ESP32-S3 Environmental Sensor Node');
    expect(html).toContain('Schematic &amp; Chips');
    expect(html).toContain('AI Hardware Co-Pilot');
    expect(html).toContain('ECAD Export');
    expect(html).toContain('BME680');
    expect(html).toContain('AP2112K-3.3');
  });
});

describe('Electrical Rules Checking (ERC) Engine', () => {
  it('passes on valid starter template with zero short circuits', () => {
    const graph = STARTER_TEMPLATES[0].graph;
    const errors = runElectricalRulesCheck(graph);
    const shorts = errors.filter((e) => e.category === 'power');
    expect(shorts.length).toBe(0);
  });

  it('flags direct power-to-ground short circuits', () => {
    const brokenGraph = JSON.parse(JSON.stringify(STARTER_TEMPLATES[0].graph));
    // Intentionally short +3V3 to GND on pin
    brokenGraph.nets.find((n: any) => n.id === 'GND')?.connections.push({ componentId: 'U2', pinNumber: '5' });
    const errors = runElectricalRulesCheck(brokenGraph);
    const powerShort = errors.find((e) => e.id.includes('erc-short'));
    expect(powerShort).toBeDefined();
    expect(powerShort?.severity).toBe('error');
  });
});

describe('ECAD Multi-Format Exporters', () => {
  const sampleGraph = STARTER_TEMPLATES[0].graph;

  it('exports valid KiCad 8/9 S-Expression schematic', () => {
    const { schematic, project } = exportToKiCad(sampleGraph);
    expect(schematic).toContain('(kicad_sch');
    expect(schematic).toContain('ESP32-S3');
    expect(schematic).toContain('(global_label "I2C_SDA"');
    expect(project).toContain('kicad_pro');
  });

  it('exports valid Altium Protel 2 Netlist', () => {
    const netlist = exportToAltiumNetlist(sampleGraph);
    expect(netlist).toContain('PROTEL ADVANCED PCB NETLIST 2.0');
    expect(netlist).toContain('ESP32-S3-WROOM-1-N8R8');
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
    expect(bom).toContain('C2913199'); // ESP32 LCSC Part
  });
});
