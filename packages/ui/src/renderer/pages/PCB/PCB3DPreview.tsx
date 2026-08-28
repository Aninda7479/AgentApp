import React, { useState, useMemo } from 'react';
import {
  Layers,
  Sparkles,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Cpu,
  Box,
  Palette,
} from 'lucide-react';
import { PCBGraph, ComponentInstance } from './types';

interface PCB3DPreviewProps {
  graph: PCBGraph;
  selectedCompId: string | null;
  onSelectComponent?: (id: string | null) => void;
  className?: string;
}

type MaskColor = 'black' | 'green' | 'blue' | 'purple' | 'white' | 'red';

export const PCB3DPreview: React.FC<PCB3DPreviewProps> = ({
  graph,
  selectedCompId,
  onSelectComponent,
  className = '',
}) => {
  const [maskColor, setMaskColor] = useState<MaskColor>('black');
  const [rotation, setRotation] = useState<number>(0);
  const [showSilkscreen, setShowSilkscreen] = useState<boolean>(true);
  const [showPads, setShowPads] = useState<boolean>(true);
  const [showTraces, setShowTraces] = useState<boolean>(true);
  const [showComponents, setShowComponents] = useState<boolean>(true);

  // Mask color palettes
  const colorScheme = useMemo(() => {
    switch (maskColor) {
      case 'green':
        return {
          boardBg: '#0f3d1f',
          boardBorder: '#1e6833',
          copperTraces: '#185228',
          silkscreen: '#ffffff',
          goldPad: '#e5c07b',
          edgeGlow: 'rgba(34, 197, 94, 0.2)',
        };
      case 'blue':
        return {
          boardBg: '#0c2340',
          boardBorder: '#1d4ed8',
          copperTraces: '#1e3a8a',
          silkscreen: '#ffffff',
          goldPad: '#facc15',
          edgeGlow: 'rgba(59, 130, 246, 0.2)',
        };
      case 'purple':
        return {
          boardBg: '#28103d',
          boardBorder: '#7e22ce',
          copperTraces: '#581c87',
          silkscreen: '#ffffff',
          goldPad: '#fbbf24',
          edgeGlow: 'rgba(168, 85, 247, 0.2)',
        };
      case 'white':
        return {
          boardBg: '#e2e8f0',
          boardBorder: '#cbd5e1',
          copperTraces: '#94a3b8',
          silkscreen: '#0f172a',
          goldPad: '#d97706',
          edgeGlow: 'rgba(255, 255, 255, 0.3)',
        };
      case 'red':
        return {
          boardBg: '#3d1010',
          boardBorder: '#b91c1c',
          copperTraces: '#7f1d1d',
          silkscreen: '#ffffff',
          goldPad: '#fcd34d',
          edgeGlow: 'rgba(239, 68, 68, 0.2)',
        };
      case 'black':
      default:
        return {
          boardBg: '#12151b',
          boardBorder: '#272f3d',
          copperTraces: '#1c222c',
          silkscreen: '#e2e8f0',
          goldPad: '#eab308',
          edgeGlow: 'rgba(234, 179, 8, 0.15)',
        };
    }
  }, [maskColor]);

  // Compute placed components for board rendering
  const placedComponents = useMemo(() => {
    return graph.components.map((comp, idx) => {
      const pkg = (comp.package || '').toUpperCase();
      const isQFN = pkg.includes('QFN') || pkg.includes('DFN') || pkg.includes('LQFP');
      const isSOIC = pkg.includes('SOIC') || pkg.includes('SOP') || pkg.includes('SOT');
      const isPass = pkg.includes('0402') || pkg.includes('0603') || pkg.includes('0805') || pkg.includes('1206');
      const isConn = comp.category === 'Connector' || pkg.includes('USB') || pkg.includes('HDR') || pkg.includes('CON');
      const isLarge =
        comp.name.toLowerCase().includes('transformer') ||
        pkg.includes('RADIAL') ||
        pkg.includes('DISC') ||
        pkg.includes('EE') ||
        pkg.includes('TO-');

      const w = isLarge ? 80 : isConn ? 70 : isQFN ? 56 : isSOIC ? 52 : isPass ? 32 : 46;
      const h = isLarge ? 80 : isConn ? 48 : isQFN ? 56 : isSOIC ? 40 : isPass ? 22 : 38;

      const cols = Math.max(3, Math.ceil(Math.sqrt(graph.components.length * 1.6)));
      let x = comp.x && comp.x > 0 ? comp.x * 0.85 : 80 + (idx % cols) * 170;
      let y = comp.y && comp.y > 0 ? comp.y * 0.85 : 80 + Math.floor(idx / cols) * 130;

      return {
        ...comp,
        layoutX: x,
        layoutY: y,
        w,
        h,
        isQFN,
        isSOIC,
        isPass,
        isConn,
        isLarge,
      };
    });
  }, [graph.components]);

  // Dynamic board size
  const { boardW, boardH } = useMemo(() => {
    let maxX = 640;
    let maxY = 380;
    placedComponents.forEach((c) => {
      if (c.layoutX + c.w > maxX) maxX = c.layoutX + c.w;
      if (c.layoutY + c.h > maxY) maxY = c.layoutY + c.h;
    });
    return {
      boardW: Math.max(760, Math.ceil((maxX + 90) / 20) * 20),
      boardH: Math.max(450, Math.ceil((maxY + 90) / 20) * 20),
    };
  }, [placedComponents]);

  // Generate synthetic copper traces between connected components
  const simulatedTraces = useMemo(() => {
    const traces: { d: string; isPwr: boolean }[] = [];
    graph.nets.forEach((net) => {
      const endpoints: { x: number; y: number }[] = [];
      net.connections.forEach((conn) => {
        const comp = placedComponents.find((c) => c.id === conn.componentId);
        if (comp) {
          endpoints.push({
            x: comp.layoutX + comp.w / 2,
            y: comp.layoutY + comp.h / 2,
          });
        }
      });

      if (endpoints.length >= 2) {
        for (let i = 0; i < endpoints.length - 1; i++) {
          const p1 = endpoints[i];
          const p2 = endpoints[i + 1];
          const midX = (p1.x + p2.x) / 2;
          traces.push({
            d: `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`,
            isPwr: net.netClass === 'power' || net.netClass === 'ground',
          });
        }
      }
    });
    return traces;
  }, [graph.nets, placedComponents]);

  return (
    <div className={`flex flex-col h-full bg-black/40 select-none overflow-hidden relative ${className}`}>
      {/* 3D View Toolbar */}
      <div className="px-3 py-2 border-b border-brand-border/30 flex items-center justify-between bg-black/30 backdrop-blur-sm text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-brand-border/30">
            {(
              [
                { id: 'black', label: 'Matte Black', color: '#18181b' },
                { id: 'green', label: 'Classic Green', color: '#15803d' },
                { id: 'blue', label: 'Royal Blue', color: '#1d4ed8' },
                { id: 'purple', label: 'Purple OSH', color: '#7e22ce' },
                { id: 'red', label: 'Crimson Red', color: '#b91c1c' },
                { id: 'white', label: 'White Silk', color: '#e2e8f0' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                onClick={() => setMaskColor(c.id)}
                className={`w-5 h-5 rounded-md transition-all cursor-pointer flex items-center justify-center ${
                  maskColor === c.id ? 'ring-2 ring-emerald-400 scale-110' : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.color }}
                title={`Solder Mask: ${c.label}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-brand-textMuted font-mono hidden sm:inline">
            {maskColor.toUpperCase()} FR-4
          </span>
        </div>

        {/* Layer Toggles & Rotation */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setShowSilkscreen(!showSilkscreen)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              showSilkscreen
                ? 'bg-white/10 text-white border-white/20'
                : 'text-brand-textMuted/50 border-brand-border/20 line-through'
            }`}
          >
            Silk
          </button>
          <button
            onClick={() => setShowPads(!showPads)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              showPads
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'text-brand-textMuted/50 border-brand-border/20 line-through'
            }`}
          >
            ENIG Pads
          </button>
          <button
            onClick={() => setShowTraces(!showTraces)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              showTraces
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'text-brand-textMuted/50 border-brand-border/20 line-through'
            }`}
          >
            Traces
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Rotate Board 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Board Rendering Area */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-gradient-to-b from-black/60 to-black/90">
        <div
          className="transition-transform duration-300 relative"
          style={{
            transform: `rotate(${rotation}deg)`,
            boxShadow: `0 25px 60px -15px ${colorScheme.edgeGlow}, 0 0 1px 1px ${colorScheme.boardBorder}`,
            borderRadius: '16px',
          }}
        >
          <svg
            width={boardW}
            height={boardH}
            viewBox={`0 0 ${boardW} ${boardH}`}
            className="rounded-2xl overflow-hidden block"
            style={{ backgroundColor: colorScheme.boardBg }}
          >
            <defs>
              {/* Gold ENIG Pad Pattern */}
              <radialGradient id="enigGold" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="60%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#a16207" />
              </radialGradient>

              {/* SMD IC Package Shading */}
              <linearGradient id="icBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#27272a" />
                <stop offset="50%" stopColor="#18181b" />
                <stop offset="100%" stopColor="#09090b" />
              </linearGradient>

              {/* Passive Resistor/Cap Ceramic Shading */}
              <linearGradient id="passiveBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#71717a" />
                <stop offset="25%" stopColor="#3f3f46" />
                <stop offset="75%" stopColor="#3f3f46" />
                <stop offset="100%" stopColor="#71717a" />
              </linearGradient>

              {/* Board Bevel Edge */}
              <filter id="pcbDropShadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.5" floodColor="#000000" />
              </filter>
            </defs>

            {/* Board Edge Routing Cutout Border */}
            <rect
              x="8"
              y="8"
              width={boardW - 16}
              height={boardH - 16}
              rx="12"
              fill="none"
              stroke={colorScheme.boardBorder}
              strokeWidth="2"
            />

            {/* Corner Mounting Holes with Gold Annular Rings */}
            {[
              { x: 30, y: 30 },
              { x: boardW - 30, y: 30 },
              { x: 30, y: boardH - 30 },
              { x: boardW - 30, y: boardH - 30 },
            ].map((hole, i) => (
              <g key={`hole-${i}`}>
                <circle cx={hole.x} cy={hole.y} r="14" fill="none" stroke="url(#enigGold)" strokeWidth="3" />
                <circle cx={hole.x} cy={hole.y} r="8" fill="#000000" />
              </g>
            ))}

            {/* Copper Traces Layer */}
            {showTraces && (
              <g opacity="0.65">
                {simulatedTraces.map((tr, i) => (
                  <path
                    key={`trace-${i}`}
                    d={tr.d}
                    fill="none"
                    stroke={colorScheme.copperTraces}
                    strokeWidth={tr.isPwr ? '6' : '3'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            )}

            {/* Silkscreen Board Branding & Metadata */}
            {showSilkscreen && (
              <g fill={colorScheme.silkscreen} opacity="0.85">
                <text x="35" y={boardH - 45} fontSize="13" fontFamily="monospace" fontWeight="bold">
                  {graph.metadata.name.toUpperCase()}
                </text>
                <text x="35" y={boardH - 28} fontSize="10" fontFamily="monospace" opacity="0.6">
                  REV {graph.metadata.revision} • DESIGNED WITH SUPERAGENT AI
                </text>
                <text x={boardW - 180} y={boardH - 28} fontSize="10" fontFamily="monospace" opacity="0.6">
                  ROHS COMPLIANT ⚡
                </text>

                {/* Silkscreen Alignment Crosshairs */}
                <g stroke={colorScheme.silkscreen} strokeWidth="1" opacity="0.4">
                  <line x1="60" y1="25" x2="60" y2="35" />
                  <line x1="55" y1="30" x2="65" y2="30" />
                  <line x1={boardW - 60} y1="25" x2={boardW - 60} y2="35" />
                  <line x1={boardW - 65} y1="30" x2={boardW - 55} y2="30" />
                </g>
              </g>
            )}

            {/* Placed Physical Components */}
            {placedComponents.map((comp) => {
              const isSelected = selectedCompId === comp.id;
              const halfPins = Math.ceil(comp.pins.length / 2);

              return (
                <g
                  key={comp.id}
                  onClick={() => onSelectComponent?.(comp.id)}
                  className="cursor-pointer transition-all"
                >
                  {/* Selection Indicator Halo */}
                  {isSelected && (
                    <rect
                      x={comp.layoutX - 8}
                      y={comp.layoutY - 8}
                      width={comp.w + 16}
                      height={comp.h + 16}
                      rx="8"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Silkscreen Component Outline & Designator */}
                  {showSilkscreen && (
                    <g fill={colorScheme.silkscreen} stroke={colorScheme.silkscreen} opacity="0.9">
                      <rect
                        x={comp.layoutX - 3}
                        y={comp.layoutY - 3}
                        width={comp.w + 6}
                        height={comp.h + 6}
                        fill="none"
                        strokeWidth="1"
                        strokeDasharray={comp.isPass ? 'none' : '2 2'}
                        rx="3"
                      />
                      {/* Pin 1 dot */}
                      {!comp.isPass && (
                        <circle cx={comp.layoutX - 6} cy={comp.layoutY + 6} r="2.5" fill={colorScheme.silkscreen} />
                      )}
                      <text
                        x={comp.layoutX + comp.w / 2}
                        y={comp.layoutY - 6}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        stroke="none"
                      >
                        {comp.id}
                      </text>
                    </g>
                  )}

                  {/* Gold SMT Solder Pads */}
                  {showPads && (
                    <g>
                      {comp.isPass && comp.pins.length === 2 ? (
                        <>
                          <rect
                            x={comp.layoutX - 4}
                            y={comp.layoutY + 2}
                            width="8"
                            height={comp.h - 4}
                            rx="1.5"
                            fill="url(#enigGold)"
                          />
                          <rect
                            x={comp.layoutX + comp.w - 4}
                            y={comp.layoutY + 2}
                            width="8"
                            height={comp.h - 4}
                            rx="1.5"
                            fill="url(#enigGold)"
                          />
                        </>
                      ) : (
                        comp.pins.map((pin, pIdx) => {
                          const isLeft = pIdx < halfPins;
                          const padY = isLeft
                            ? comp.layoutY + 6 + pIdx * ((comp.h - 12) / Math.max(1, halfPins - 1))
                            : comp.layoutY +
                              6 +
                              (pIdx - halfPins) * ((comp.h - 12) / Math.max(1, comp.pins.length - halfPins - 1));
                          const padX = isLeft ? comp.layoutX - 6 : comp.layoutX + comp.w - 2;

                          return (
                            <rect
                              key={`pad-${pin.number}`}
                              x={padX}
                              y={padY - 3}
                              width="8"
                              height="6"
                              rx="1.5"
                              fill="url(#enigGold)"
                            />
                          );
                        })
                      )}
                    </g>
                  )}

                  {/* Physical 3D Package Body */}
                  {showComponents && (
                    <g filter="url(#pcbDropShadow)">
                      <rect
                        x={comp.layoutX}
                        y={comp.layoutY}
                        width={comp.w}
                        height={comp.h}
                        rx={comp.isPass ? 2 : 4}
                        fill={comp.isPass ? 'url(#passiveBodyGrad)' : 'url(#icBodyGrad)'}
                        stroke="#3f3f46"
                        strokeWidth="1"
                      />

                      {/* IC Orientation Notch */}
                      {!comp.isPass && (
                        <circle
                          cx={comp.layoutX + 8}
                          cy={comp.layoutY + 8}
                          r="2.5"
                          fill="#09090b"
                          stroke="#27272a"
                          strokeWidth="0.5"
                        />
                      )}

                      {/* IC Top Laser Engraved Part Number */}
                      <text
                        x={comp.layoutX + comp.w / 2}
                        y={comp.layoutY + comp.h / 2 + 3}
                        fontSize={comp.isLarge ? '11' : comp.isPass ? '7' : '8'}
                        fontFamily="monospace"
                        fontWeight="semibold"
                        fill="#a1a1aa"
                        textAnchor="middle"
                      >
                        {comp.mpn.length > 10 ? comp.mpn.slice(0, 9) + '…' : comp.mpn}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
