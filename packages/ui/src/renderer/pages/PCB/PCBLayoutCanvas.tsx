import React, { useState, useMemo, useRef } from 'react';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  ShieldAlert,
  Zap,
  Info,
  CheckCircle2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { PCBGraph, ComponentInstance, Net } from './types';

interface PCBLayoutCanvasProps {
  graph: PCBGraph;
  selectedCompId: string | null;
  selectedNetId: string | null;
  onSelectComponent: (id: string | null) => void;
  onSelectNet: (id: string | null) => void;
}

export const PCBLayoutCanvas: React.FC<PCBLayoutCanvasProps> = ({
  graph,
  selectedCompId,
  selectedNetId,
  onSelectComponent,
  onSelectNet,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 30 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Layer Visibility Filters
  const [showTopCu, setShowTopCu] = useState<boolean>(true);
  const [showBottomCu, setShowBottomCu] = useState<boolean>(true);
  const [showSilk, setShowSilk] = useState<boolean>(true);
  const [showPads, setShowPads] = useState<boolean>(true);
  const [showRatsnest, setShowRatsnest] = useState<boolean>(true);
  const [showIsolation, setShowIsolation] = useState<boolean>(true);

  // Board Physical Dimensions (mm scaled to SVG coordinates: 1mm = 10px)
  const boardWidth = 860;
  const boardHeight = 460;
  const isolationX = 420; // 6.4mm creepage slot location

  // Map components into realistic layout coordinates
  const placedComponents = useMemo(() => {
    return graph.components.map((comp, idx) => {
      // Deterministic layout placement on the board
      let x = 60 + (idx % 4) * 190;
      let y = 70 + Math.floor(idx / 4) * 130;

      // Group High-Voltage Primary components on left of isolation slot, Low-Voltage Secondary on right
      const isPrimary =
        comp.id.startsWith('F') ||
        comp.id.startsWith('RV') ||
        comp.id.startsWith('BD') ||
        comp.id.startsWith('L') ||
        comp.id.includes('BULK') ||
        comp.id.includes('PRI') ||
        comp.name.includes('Fuse') ||
        comp.name.includes('Bridge') ||
        comp.name.includes('Varistor');

      const isTransformer = comp.id.startsWith('T') || comp.name.includes('Transformer');

      if (isTransformer) {
        x = isolationX - 45;
        y = 140;
      } else if (isPrimary) {
        x = Math.min(x, isolationX - 110);
      } else {
        x = Math.max(x, isolationX + 60);
      }

      // Footprint package dimensions
      const isQFN = comp.package.includes('QFN') || comp.package.includes('DFN');
      const isSOIC = comp.package.includes('SOIC') || comp.package.includes('SOP');
      const isPass = comp.package.includes('0402') || comp.package.includes('0603') || comp.package.includes('0805');
      const isConn = comp.package.includes('USB') || comp.category === 'Connector';
      const isLarge = isTransformer || comp.package.includes('Radial') || comp.package.includes('Disc');

      const w = isLarge ? 80 : isConn ? 65 : isQFN ? 50 : isSOIC ? 55 : isPass ? 32 : 44;
      const h = isLarge ? 80 : isConn ? 45 : isQFN ? 50 : isSOIC ? 40 : isPass ? 20 : 36;

      return {
        ...comp,
        layoutX: x,
        layoutY: y,
        w,
        h,
        isPrimary,
        isTransformer,
      };
    });
  }, [graph.components]);

  // Handle Canvas Drag & Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0b0f14] overflow-hidden select-none font-sans">
      {/* ── Top PCB View Toolbar & Layer Switches ── */}
      <div className="h-10 px-4 border-b border-brand-border/40 bg-black/40 flex items-center justify-between shrink-0 text-xs">
        {/* Layer Visibility Pills */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-brand-textMuted uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Layers:
          </span>

          {/* Top Copper F.Cu */}
          <button
            onClick={() => setShowTopCu(!showTopCu)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showTopCu
                ? 'bg-rose-950/60 border-rose-600/80 text-rose-300'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Top Copper Layer (F.Cu)"
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>F.Cu (Top)</span>
          </button>

          {/* Bottom Copper B.Cu */}
          <button
            onClick={() => setShowBottomCu(!showBottomCu)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showBottomCu
                ? 'bg-blue-950/60 border-blue-600/80 text-blue-300'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Bottom Copper Layer (B.Cu)"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>B.Cu (Bottom)</span>
          </button>

          {/* Silkscreen F.SilkS */}
          <button
            onClick={() => setShowSilk(!showSilk)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showSilk
                ? 'bg-amber-950/60 border-amber-500/80 text-amber-200'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Silkscreen Layer (F.SilkS)"
          >
            <span className="w-2 h-2 rounded-full bg-amber-300" />
            <span>F.SilkS</span>
          </button>

          {/* Pads */}
          <button
            onClick={() => setShowPads(!showPads)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showPads
                ? 'bg-emerald-950/60 border-emerald-600/80 text-emerald-300'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Solder Pads"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Pads</span>
          </button>

          {/* Ratsnest Airwires */}
          <button
            onClick={() => setShowRatsnest(!showRatsnest)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showRatsnest
                ? 'bg-yellow-950/60 border-yellow-600/80 text-yellow-300'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Ratsnest Airwires"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Ratsnest</span>
          </button>

          {/* Isolation Barrier */}
          <button
            onClick={() => setShowIsolation(!showIsolation)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
              showIsolation
                ? 'bg-purple-950/60 border-purple-600/80 text-purple-300'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Safety Isolation Barrier & Cutout Slot"
          >
            <ShieldAlert className="w-3 h-3 text-purple-400" />
            <span>6.4mm Creepage</span>
          </button>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono text-brand-textMuted bg-black/40 px-2 py-0.5 rounded border border-brand-border/30">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 40, y: 30 });
            }}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Fit Board to View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Interactive SVG PCB Canvas ── */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Background Grid Pattern */}
          <defs>
            <pattern id="pcb-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161e27" strokeWidth="0.8" />
            </pattern>
            {/* High-Voltage Hash Hatching */}
            <pattern id="hv-hatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#7c3aed" strokeWidth="1.5" strokeOpacity="0.4" />
            </pattern>
          </defs>

          <rect width="2000" height="1500" fill="url(#pcb-grid)" />

          {/* ── FR4 Physical Board Substrate Outline ── */}
          <g id="board-substrate">
            {/* Board Core Surface */}
            <rect
              x="20"
              y="20"
              width={boardWidth}
              height={boardHeight}
              rx="16"
              fill="#062215"
              stroke="#10b981"
              strokeWidth="2.5"
              className="drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]"
            />

            {/* Corner Mounting Holes */}
            {[
              { cx: 45, cy: 45 },
              { cx: boardWidth - 5, cy: 45 },
              { cx: 45, cy: boardHeight - 5 },
              { cx: boardWidth - 5, cy: boardHeight - 5 },
            ].map((hole, i) => (
              <g key={i}>
                <circle cx={hole.cx} cy={hole.cy} r="12" fill="#04120b" stroke="#eab308" strokeWidth="2.5" />
                <circle cx={hole.cx} cy={hole.cy} r="6" fill="#0b0f14" />
              </g>
            ))}

            {/* Board Dimensions & Spec Silk Text */}
            <text x="50" y="boardHeight - 20" fill="#6ee7b7" opacity="0.6" fontSize="10" fontFamily="monospace">
              FR4 2-LAYER 1.6mm 2oz | 86mm x 46mm | IPC-2221 CLASS-2
            </text>
          </g>

          {/* ── Safety Isolation Barrier & High Voltage Slot ── */}
          {showIsolation && (
            <g id="isolation-barrier">
              {/* Isolation Milling Slot Cutout */}
              <rect
                x={isolationX}
                y="35"
                width="14"
                height={boardHeight - 30}
                rx="6"
                fill="#0b0f14"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <rect
                x={isolationX - 15}
                y="35"
                width="44"
                height={boardHeight - 30}
                fill="url(#hv-hatch)"
                opacity="0.35"
              />
              <text
                x={isolationX - 4}
                y="240"
                fill="#c084fc"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                transform={`rotate(-90 ${isolationX - 4} 240)`}
              >
                ⚡ REINFORCED ISOLATION (≥ 6.4mm CREEPAGE)
              </text>
            </g>
          )}

          {/* ── Bottom Copper Traces (B.Cu - Blue) ── */}
          {showBottomCu && (
            <g id="layer-bottom-cu" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" fill="none">
              {/* Primary Star Ground Return Polygon */}
              <path d="M 60 400 L 360 400 L 360 300 L 180 300 Z" strokeWidth="4" opacity="0.4" strokeDasharray="6 3" />
              {/* Secondary Clean Star GND Plane */}
              <path d="M 480 400 L 800 400 L 800 280 L 520 280 Z" strokeWidth="5" opacity="0.4" strokeDasharray="6 3" />
              {/* HV DC Return Trace */}
              <path d="M 120 180 L 120 350 L 260 350 L 260 220" strokeWidth="3" opacity="0.8" />
              {/* Aux Supply Track */}
              <path d="M 380 200 L 380 260 L 300 260 L 300 210" strokeWidth="2" opacity="0.8" />
            </g>
          )}

          {/* ── Top Copper Traces (F.Cu - Red / Burgundy) ── */}
          {showTopCu && (
            <g id="layer-top-cu" stroke="#e11d48" strokeLinecap="round" strokeLinejoin="round" fill="none">
              {/* AC Input High-Current Phase & Neutral Traces */}
              <path d="M 60 90 L 140 90 L 140 140 L 200 140" strokeWidth="4" opacity="0.9" />
              <path d="M 60 140 L 100 140 L 100 190 L 200 190" strokeWidth="4" opacity="0.9" />

              {/* High Voltage DC Bus 380V */}
              <path d="M 260 140 L 310 140 L 310 190 L 380 190" strokeWidth="4.5" opacity="0.95" />

              {/* Secondary Synchronous Rectification Track */}
              <path d="M 440 180 L 490 180 L 490 130 L 560 130" strokeWidth="5" opacity="0.95" />

              {/* USB-PD VBUS High-Current 45W Output Track */}
              <path d="M 560 130 L 640 130 L 640 180 L 780 180" strokeWidth="6" opacity="0.95" />

              {/* USB 2.0 D+/D- Differential Pair (90Ω Impedance Matched) */}
              <path d="M 620 220 L 700 220 L 740 200 L 780 200" strokeWidth="1.8" stroke="#f43f5e" />
              <path d="M 620 226 L 700 226 L 740 206 L 780 206" strokeWidth="1.8" stroke="#f43f5e" />

              {/* CC1 / CC2 Negotiation Lines */}
              <path d="M 620 250 L 710 250 L 740 220 L 780 220" strokeWidth="1.6" stroke="#fb7185" />
              <path d="M 620 265 L 710 265 L 740 235 L 780 235" strokeWidth="1.6" stroke="#fb7185" />
            </g>
          )}

          {/* ── Ratsnest Airwires (Unrouted / Signal Net Lines) ── */}
          {showRatsnest && (
            <g id="layer-ratsnest" stroke="#eab308" strokeWidth="1" strokeDasharray="3 3" opacity="0.75">
              {placedComponents.map((c, i) => {
                const next = placedComponents[i + 1];
                if (!next) return null;
                return (
                  <line
                    key={i}
                    x1={c.layoutX + c.w / 2}
                    y1={c.layoutY + c.h / 2}
                    x2={next.layoutX + next.w / 2}
                    y2={next.layoutY + next.h / 2}
                  />
                );
              })}
            </g>
          )}

          {/* ── Component Silkscreen & SMD Footprints ── */}
          <g id="components-layer">
            {placedComponents.map((comp) => {
              const isSelected = selectedCompId === comp.id;

              return (
                <g
                  key={comp.id}
                  transform={`translate(${comp.layoutX}, ${comp.layoutY})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectComponent(comp.id);
                  }}
                  className="cursor-pointer group"
                >
                  {/* Footprint Selection Halo */}
                  {isSelected && (
                    <rect
                      x="-6"
                      y="-6"
                      width={comp.w + 12}
                      height={comp.h + 12}
                      rx="6"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                      className="animate-pulse"
                    />
                  )}

                  {/* Silkscreen Box Outline */}
                  {showSilk && (
                    <rect
                      x="0"
                      y="0"
                      width={comp.w}
                      height={comp.h}
                      rx="3"
                      fill="#04180f"
                      stroke={comp.isPrimary ? '#fbbf24' : '#fef08a'}
                      strokeWidth="1.2"
                      opacity="0.9"
                    />
                  )}

                  {/* Silkscreen Reference Designator */}
                  {showSilk && (
                    <text
                      x={comp.w / 2}
                      y="-4"
                      textAnchor="middle"
                      fill={comp.isPrimary ? '#fbbf24' : '#fef08a'}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {comp.id}
                    </text>
                  )}

                  {/* Footprint Solder Pads */}
                  {showPads && (
                    <g>
                      {/* Left / Top SMD Pads */}
                      <rect x="-3" y="6" width="6" height="6" rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
                      <rect x="-3" y={comp.h - 12} width="6" height="6" rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />

                      {/* Right / Bottom SMD Pads */}
                      <rect x={comp.w - 3} y="6" width="6" height="6" rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
                      <rect x={comp.w - 3} y={comp.h - 12} width="6" height="6" rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />

                      {/* Pin 1 Marker Dot */}
                      <circle cx="6" cy="6" r="1.8" fill="#e11d48" />

                      {/* Thermal Center Ground Pad for Power ICs / MOSFETs */}
                      {(comp.package.includes('QFN') || comp.package.includes('DFN') || comp.isTransformer) && (
                        <rect
                          x="10"
                          y="10"
                          width={comp.w - 20}
                          height={comp.h - 20}
                          rx="2"
                          fill="#ca8a04"
                          opacity="0.6"
                        />
                      )}
                    </g>
                  )}

                  {/* Component Value / Name Text inside package */}
                  <text
                    x={comp.w / 2}
                    y={comp.h / 2 + 3}
                    textAnchor="middle"
                    fill="#a7f3d0"
                    fontSize="7.5"
                    fontFamily="monospace"
                    className="pointer-events-none font-semibold"
                  >
                    {comp.value || comp.mpn.slice(0, 8)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* ── Thermal Vias & Ground Stitching Array ── */}
          <g id="vias-layer">
            {[
              { cx: 320, cy: 220 },
              { cx: 335, cy: 220 },
              { cx: 320, cy: 235 },
              { cx: 335, cy: 235 },
              { cx: 580, cy: 140 },
              { cx: 595, cy: 140 },
              { cx: 580, cy: 155 },
              { cx: 595, cy: 155 },
            ].map((via, i) => (
              <g key={i}>
                <circle cx={via.cx} cy={via.cy} r="4" fill="#04180f" stroke="#eab308" strokeWidth="1.5" />
                <circle cx={via.cx} cy={via.cy} r="1.5" fill="#0b0f14" />
              </g>
            ))}
          </g>
        </svg>

        {/* Floating Board Stats Card */}
        <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-black/80 backdrop-blur-md border border-brand-border/40 text-[11px] font-mono text-brand-textMuted space-y-1 shadow-xl pointer-events-none">
          <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>2D PCB Layout & Copper Verification</span>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            <span>Size: <strong>86mm × 46mm</strong></span>
            <span>Stackup: <strong>2-Layer FR4 2oz</strong></span>
            <span>Creepage: <strong className="text-purple-400">≥6.4mm (PASS)</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
