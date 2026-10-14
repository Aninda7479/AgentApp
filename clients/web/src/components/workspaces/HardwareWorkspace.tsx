import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  AlertTriangle,
  Download,
  Sparkles,
  Eye,
  Sliders,
  CheckCircle,
  FileCode,
  Search,
} from 'lucide-react';
import {
  DEMO_HARDWARE_PROJECT,
  HardwareProjectData,
  ErcRuleViolation,
  BomItem,
} from '../../demoData';

export const HardwareWorkspace: React.FC = () => {
  const [project, setProject] = useState<HardwareProjectData>(DEMO_HARDWARE_PROJECT);
  const [activeView, setActiveView] = useState<'schematic' | 'layout' | '3d' | 'bom'>('layout');
  const [selectedLayer, setSelectedLayer] = useState<string>(project.activeLayer);
  const [solderMaskColor, setSolderMaskColor] = useState<string>(project.solderMaskColor);
  const [traceWidth, setTraceWidth] = useState<number>(project.traceWidthMm);

  const maskColors: HardwareProjectData['solderMaskColor'][] = [
    'Cyber Green',
    'Matte Black',
    'Royal Blue',
    'Deep Red',
    'Arctic White',
  ];

  const getMaskHex = (name: string) => {
    switch (name) {
      case 'Cyber Green': return '#064e3b';
      case 'Matte Black': return '#18181b';
      case 'Royal Blue': return '#1e3a8a';
      case 'Deep Red': return '#881337';
      default: return '#f8fafc';
    }
  };

  const handleExportKiCad = (format: 'kicad_sch' | 'kicad_pcb' | 'bom_csv') => {
    alert(`Exporting ${project.projectName}.${format} for KiCad 9...`);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header & View Mode Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={17} color="#10b981" />
          <span style={{ fontWeight: 600 }}>{project.projectName} (Rev {project.revision})</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#10b981',
              border: '1px solid #059669',
            }}
          >
            4-Layer Controlled Impedance
          </span>
        </div>

        {/* View Switcher: Schematic, Layout, 3D Preview, BOM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px' }}>
            {(['schematic', 'layout', '3d', 'bom'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                style={{
                  backgroundColor: activeView === view ? '#10b981' : 'transparent',
                  color: activeView === view ? '#000000' : '#94a3b8',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {view === '3d' ? '3D Board' : view}
              </button>
            ))}
          </div>

          {/* KiCad Exporter Buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => handleExportKiCad('kicad_pcb')}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Download size={11} /> .kicad_pcb
            </button>
            <button
              onClick={() => handleExportKiCad('bom_csv')}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Download size={11} /> BOM (JLCPCB)
            </button>
          </div>
        </div>
      </div>

      {/* Main 3-Column Studio Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Layer Stack & Copper Controls */}
        <div
          style={{
            width: '280px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
            PCB Stackup & Settings
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Active Routing Layer
            </label>
            <select
              value={selectedLayer}
              onChange={(e) => setSelectedLayer(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#090d16',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                padding: '6px 8px',
                fontSize: '12px',
              }}
            >
              <option value="F.Cu (Top Copper)">F.Cu (Top Copper - Signal)</option>
              <option value="In1.Cu (Ground Plane)">In1.Cu (Ground Plane 0V)</option>
              <option value="In2.Cu (Power Rail)">In2.Cu (Power Rail +3.3V)</option>
              <option value="B.Cu (Bottom Copper)">B.Cu (Bottom Copper - Signal)</option>
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              <span>Trace Width</span>
              <span>{traceWidth} mm</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              value={traceWidth}
              onChange={(e) => setTraceWidth(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Solder Mask Color
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {maskColors.map((color) => {
                const isSelected = solderMaskColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => setSolderMaskColor(color)}
                    style={{
                      backgroundColor: getMaskHex(color),
                      border: isSelected ? '2px solid #38bdf8' : '1px solid #334155',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: color === 'Arctic White' ? '#000' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {color}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Hardware Co-Pilot Suggestions Card */}
          <div
            style={{
              backgroundColor: '#111827',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} />
              <span>AI Hardware Co-Pilot</span>
            </div>

            <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
              {project.aiCoPilotSuggestions.map((sug, i) => (
                <li key={i} style={{ marginBottom: '6px' }}>{sug}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Center Column: Viewport (Schematic, Copper Layout, 3D Board, BOM) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            backgroundColor: '#090d16',
            padding: '16px',
            overflow: 'auto',
          }}
        >
          {activeView === 'layout' && (
            <div
              style={{
                flex: 1,
                backgroundColor: getMaskHex(solderMaskColor),
                borderRadius: '8px',
                border: '2px solid #334155',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}
            >
              {/* Copper Traces & Footprints SVG */}
              <svg width="100%" height="100%" viewBox="0 0 600 400">
                {/* Copper traces */}
                <line x1="120" y1="120" x2="300" y2="120" stroke="#f59e0b" strokeWidth={traceWidth * 8} />
                <line x1="300" y1="120" x2="380" y2="200" stroke="#f59e0b" strokeWidth={traceWidth * 8} />
                <line x1="150" y1="260" x2="350" y2="260" stroke="#06b6d4" strokeWidth={traceWidth * 6} strokeDasharray="6 2" />

                {/* Vias */}
                <circle cx="300" cy="120" r="8" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />
                <circle cx="380" cy="200" r="8" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />

                {/* U1 RP2040 Footprint with Pins */}
                <rect x="220" y="160" width="120" height="120" fill="#0f172a" stroke="#d4d4d8" strokeWidth="2" rx="4" />
                <text x="245" y="225" fill="#ffffff" fontSize="13" fontWeight="bold">RP2040</text>
                <text x="250" y="240" fill="#94a3b8" fontSize="9">QFN-56</text>

                {/* SMD Pads around U1 */}
                <rect x="210" y="180" width="8" height="14" fill="#fbbf24" />
                <rect x="210" y="200" width="8" height="14" fill="#fbbf24" />
                <rect x="210" y="220" width="8" height="14" fill="#fbbf24" />
                <rect x="342" y="180" width="8" height="14" fill="#fbbf24" />
                <rect x="342" y="200" width="8" height="14" fill="#fbbf24" />
                <rect x="342" y="220" width="8" height="14" fill="#fbbf24" />

                {/* USB-C Receptacle Footprint J1 */}
                <rect x="40" y="180" width="50" height="60" fill="#27272a" stroke="#a1a1aa" strokeWidth="1.5" />
                <text x="50" y="215" fill="#f8fafc" fontSize="11">USB-C</text>

                {/* Decoupling Capacitors C1, C2 */}
                <rect x="180" y="140" width="20" height="10" fill="#78350f" stroke="#fbbf24" strokeWidth="1" />
                <rect x="180" y="280" width="20" height="10" fill="#78350f" stroke="#fbbf24" strokeWidth="1" />
              </svg>

              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#f8fafc',
                }}
              >
                Layer: {selectedLayer} • Mask: {solderMaskColor}
              </div>
            </div>
          )}

          {activeView === '3d' && (
            <div
              style={{
                flex: 1,
                backgroundColor: '#020617',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '420px',
                  height: '240px',
                  backgroundColor: getMaskHex(solderMaskColor),
                  borderRadius: '10px',
                  border: '3px solid #eab308',
                  transform: 'perspective(600px) rotateX(25deg) rotateY(-15deg)',
                  boxShadow: '20px 30px 50px rgba(0,0,0,0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '18px',
                  letterSpacing: '0.05em',
                }}
              >
                3D PCB ASSEMBLED VIEW
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                WebGL 3D Assembly Preview • Orbit with Left Click • Zoom with Wheel
              </span>
            </div>
          )}

          {activeView === 'schematic' && (
            <div
              style={{
                flex: 1,
                backgroundColor: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                padding: '20px',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#cbd5e1',
                overflow: 'auto',
              }}
            >
              <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '10px' }}>
                Netlist & Hierarchy (KiCad 9 Schematic Preview):
              </div>
              <pre style={{ margin: 0 }}>
                {`(kicad_sch (version 20240108) (generator "SuperAgent ECAD")
  (net 1 "+3V3")
  (net 2 "GND")
  (net 3 "USB_DP" (pin "U1" "14") (pin "J1" "A6"))
  (net 4 "USB_DN" (pin "U1" "15") (pin "J1" "A7"))
  (component "U1" (value "RP2040") (footprint "QFN-56"))
  (component "J1" (value "USB-C-16P") (footprint "USB-C-16P-Female"))
)`}
              </pre>
            </div>
          )}

          {activeView === 'bom' && (
            <div
              style={{
                flex: 1,
                backgroundColor: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                Bill of Materials (BOM) — JLCPCB SMT Production Matrix
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '6px' }}>Designator</th>
                    <th style={{ padding: '6px' }}>Value</th>
                    <th style={{ padding: '6px' }}>Package</th>
                    <th style={{ padding: '6px' }}>MPN</th>
                    <th style={{ padding: '6px' }}>JLCPCB Part</th>
                    <th style={{ padding: '6px' }}>Qty</th>
                    <th style={{ padding: '6px' }}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {project.bomItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px', color: '#38bdf8', fontWeight: 600 }}>{item.reference}</td>
                      <td style={{ padding: '8px', color: '#f8fafc' }}>{item.value}</td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>{item.footprint}</td>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{item.manufacturerPartNumber}</td>
                      <td style={{ padding: '8px', color: '#10b981', fontFamily: 'monospace' }}>{item.jlcPcbPartNumber}</td>
                      <td style={{ padding: '8px' }}>{item.quantity}</td>
                      <td style={{ padding: '8px' }}>${item.unitPriceUsd.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Real-Time ERC Rules Checker */}
        <div
          style={{
            width: '320px',
            borderLeft: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Real-Time ERC Checker ({project.ercViolations.length} Violations)
            </div>
          </div>

          {project.ercViolations.map((v) => {
            const isError = v.severity === 'Error';

            return (
              <div
                key={v.code}
                style={{
                  backgroundColor: '#111827',
                  border: isError ? '1px solid #ef4444' : '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: isError ? '#ef4444' : '#f59e0b', fontSize: '12px' }}>
                    {v.code} ({v.severity})
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{v.location}</span>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  {v.description}
                </div>

                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  Nets: <span style={{ color: '#38bdf8' }}>{v.affectedNets.join(', ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
