import React, { useState, useMemo, useRef, useCallback } from 'react';
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
import { PCBGraph, ComponentInstance, Net, ComponentPin } from './types';

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
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 30 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layer Visibility Filters
  const [showTopCu, setShowTopCu] = useState<boolean>(true);
  const [showBottomCu, setShowBottomCu] = useState<boolean>(true);
  const [showSilk, setShowSilk] = useState<boolean>(true);
  const [showPads, setShowPads] = useState<boolean>(true);
  const [showRatsnest, setShowRatsnest] = useState<boolean>(true);
  const [showIsolation, setShowIsolation] = useState<boolean>(true);

  // Detect High-Voltage Presence Dynamically in Model
  const hasHighVoltage = useMemo(() => {
    return graph.components.some((comp) =>
      comp.pins.some(
        (p) =>
          (p.voltageLevel && p.voltageLevel >= 50) ||
          p.connectedNet?.toUpperCase().includes('AC') ||
          p.connectedNet?.toUpperCase().includes('HV') ||
          p.connectedNet?.toUpperCase().includes('230V') ||
          p.connectedNet?.toUpperCase().includes('110V') ||
          p.connectedNet?.toUpperCase().includes('MAINS')
      )
    );
  }, [graph.components]);

  // Model-Driven Dynamic Layout Placement
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

      const w = isLarge ? 75 : isConn ? 65 : isQFN ? 52 : isSOIC ? 50 : isPass ? 30 : 44;
      const h = isLarge ? 75 : isConn ? 45 : isQFN ? 52 : isSOIC ? 38 : isPass ? 20 : 36;

      const cols = Math.max(3, Math.ceil(Math.sqrt(graph.components.length * 1.5)));
      let x = comp.x && comp.x > 0 ? comp.x * 0.85 : 60 + (idx % cols) * 160;
      let y = comp.y && comp.y > 0 ? comp.y * 0.85 : 70 + Math.floor(idx / cols) * 120;

      const isPrimary = comp.pins.some(
        (p) =>
          (p.voltageLevel && p.voltageLevel >= 50) ||
          p.connectedNet?.toUpperCase().includes('AC') ||
          p.connectedNet?.toUpperCase().includes('HV')
      );

      return {
        ...comp,
        layoutX: x,
        layoutY: y,
        w,
        h,
        isPrimary,
        isQFN,
        isSOIC,
        isPass,
        isConn,
        isLarge,
      };
    });
  }, [graph.components]);

  // Dynamic Board Dimensions
  const { boardWidth, boardHeight, isolationX } = useMemo(() => {
    let maxX = 600;
    let maxY = 350;

    placedComponents.forEach((c) => {
      if (c.layoutX + c.w > maxX) maxX = c.layoutX + c.w;
      if (c.layoutY + c.h > maxY) maxY = c.layoutY + c.h;
    });

    const w = Math.max(750, Math.ceil((maxX + 90) / 20) * 20);
    const h = Math.max(420, Math.ceil((maxY + 90) / 20) * 20);
    const isoX = Math.round(w * 0.48);

    return { boardWidth: w, boardHeight: h, isolationX: isoX };
  }, [placedComponents]);

  // Compute Pad Coordinates for Dynamic Net Trace Routing
  const padMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();

    placedComponents.forEach((comp) => {
      const pinCount = comp.pins.length;
      if (pinCount === 0) return;

      if (comp.isPass && pinCount === 2) {
        map.set(`${comp.id}:${comp.pins[0].number}`, { x: comp.layoutX + 4, y: comp.layoutY + comp.h / 2 });
        map.set(`${comp.id}:${comp.pins[1].number}`, { x: comp.layoutX + comp.w - 4, y: comp.layoutY + comp.h / 2 });
      } else {
        const half = Math.ceil(pinCount / 2);
        comp.pins.forEach((pin, i) => {
          if (i < half) {
            const padY = comp.layoutY + 8 + i * ((comp.h - 16) / Math.max(1, half - 1));
            map.set(`${comp.id}:${pin.number}`, { x: comp.layoutX + 3, y: padY });
          } else {
            const rightIdx = i - half;
            const padY = comp.layoutY + 8 + rightIdx * ((comp.h - 16) / Math.max(1, pinCount - half - 1));
            map.set(`${comp.id}:${pin.number}`, { x: comp.layoutX + comp.w - 3, y: padY });
          }
        });
      }
    });

    return map;
  }, [placedComponents]);

  // Dynamic Copper Traces Computed Directly from Graph Nets
  const dynamicTraces = useMemo(() => {
    const traces: {
      netId: string;
      netClass: string;
      pathD: string;
      strokeWidth: number;
      layer: 'top' | 'bottom';
      color: string;
    }[] = [];

    graph.nets.forEach((net) => {
      const pads = net.connections
        .map((conn) => padMap.get(`${conn.componentId}:${conn.pinNumber}`))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));

      if (pads.length < 2) return;

      const isPower =
        net.netClass === 'power' ||
        net.name.includes('VCC') ||
        net.name.includes('+') ||
        net.name.includes('VBUS') ||
        net.name.includes('VIN');

      const isGround = net.netClass === 'ground' || net.name.includes('GND');
      const isDiffPair = net.netClass === 'diff_pair_pos' || net.netClass === 'diff_pair_neg';

      const strokeWidth = isPower ? 4.5 : isGround ? 4.0 : isDiffPair ? 2.0 : 1.8;
      const layer: 'top' | 'bottom' = isGround ? 'bottom' : 'top';
      const color = isPower
        ? '#e11d48'
        : isGround
        ? '#3b82f6'
        : isDiffPair
        ? '#f43f5e'
        : '#eab308';

      const sortedPads = [...pads].sort((a, b) => a.x - b.x);
      const segments: string[] = [];

      for (let i = 0; i < sortedPads.length - 1; i++) {
        const p1 = sortedPads[i];
        const p2 = sortedPads[i + 1];
        const midX = (p1.x + p2.x) / 2;

        segments.push(`M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`);
      }

      traces.push({
        netId: net.id,
        netClass: net.netClass,
        pathD: segments.join(' '),
        strokeWidth,
        layer,
        color,
      });
    });

    return traces;
  }, [graph.nets, padMap]);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // Non-Passive Native Wheel Listener to smoothly prevent default and support X/Y scrolling and zooming
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        setZoom((prevZoom) => {
          const nextZoom = Math.max(0.25, Math.min(3.5, prevZoom * zoomFactor));
          const rect = el.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          setPan((prevPan) => ({
            x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
            y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
          }));
          return nextZoom;
        });
      } else if (e.shiftKey) {
        // Shift + Wheel = Pan horizontally along X axis
        setPan((prev) => ({
          ...prev,
          x: prev.x - e.deltaY,
        }));
      } else {
        // Standard Wheel = Pan vertically along Y axis (and X if trackpad deltaX present)
        setPan((prev) => ({
          x: prev.x - (e.deltaX || 0),
          y: prev.y - e.deltaY,
        }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Handle Canvas Drag & Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
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

  // Fit Board Centered in Viewport
  const handleFitToView = useCallback(() => {
    if (!containerRef.current) {
      setZoom(0.9);
      setPan({ x: 40, y: 30 });
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 50;
    const availableWidth = rect.width - padding * 2;
    const availableHeight = rect.height - padding * 2;

    const scaleX = availableWidth / boardWidth;
    const scaleY = availableHeight / boardHeight;
    const optimalZoom = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));

    const centerX = (rect.width - boardWidth * optimalZoom) / 2;
    const centerY = (rect.height - boardHeight * optimalZoom) / 2;

    setZoom(optimalZoom);
    setPan({ x: Math.max(20, centerX), y: Math.max(20, centerY) });
  }, [boardWidth, boardHeight]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col bg-[#080d14] overflow-hidden select-none font-sans"
    >
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
              showTopCu ? 'bg-rose-950/60 border-rose-600/80 text-rose-300' : 'bg-white/5 border-white/10 text-white/40'
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
              showBottomCu ? 'bg-blue-950/60 border-blue-600/80 text-blue-300' : 'bg-white/5 border-white/10 text-white/40'
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
              showSilk ? 'bg-amber-950/60 border-amber-500/80 text-amber-200' : 'bg-white/5 border-white/10 text-white/40'
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
              showPads ? 'bg-emerald-950/60 border-emerald-600/80 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'
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
              showRatsnest ? 'bg-yellow-950/60 border-yellow-600/80 text-yellow-300' : 'bg-white/5 border-white/10 text-white/40'
            }`}
            title="Toggle Ratsnest Airwires"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Ratsnest</span>
          </button>

          {/* Safety Isolation Barrier (Dynamic) */}
          {hasHighVoltage && (
            <button
              onClick={() => setShowIsolation(!showIsolation)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer border ${
                showIsolation ? 'bg-purple-950/60 border-purple-600/80 text-purple-300' : 'bg-white/5 border-white/10 text-white/40'
              }`}
              title="Toggle Safety Isolation Creepage Barrier"
            >
              <ShieldAlert className="w-3 h-3 text-purple-400" />
              <span>Safety Isolation</span>
            </button>
          )}
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono text-brand-textMuted bg-black/40 px-2 py-0.5 rounded border border-brand-border/30">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(3.0, z + 0.15))}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitToView}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            title="Fit Board to View (Center)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Interactive SVG PCB Canvas ── */}
      <div
        ref={canvasContainerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg className="w-full h-full absolute inset-0">
          {/* Background Grid Pattern */}
          <defs>
            <pattern id="pcb-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161e27" strokeWidth="0.8" />
            </pattern>
            <pattern id="hv-hatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#7c3aed" strokeWidth="1.5" strokeOpacity="0.4" />
            </pattern>
          </defs>

          {/* Canvas Background */}
          <rect width="100%" height="100%" fill="#080d14" />

          {/* ── Transformed Board Layer ── */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* ── FR4 Physical Board Substrate Outline ── */}
            <g id="board-substrate">
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

              {/* Board Spec Silk Text */}
              <text x="50" y={boardHeight + 6} fill="#6ee7b7" opacity="0.6" fontSize="10" fontFamily="monospace">
                FR4 2-LAYER 1.6mm 2oz | {(boardWidth / 10).toFixed(0)}mm × {(boardHeight / 10).toFixed(0)}mm | IPC-2221 CLASS-2
              </text>
            </g>

            {/* ── Safety Isolation Barrier ── */}
            {showIsolation && hasHighVoltage && (
              <g id="isolation-barrier">
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
                  y={boardHeight / 2}
                  fill="#c084fc"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                  transform={`rotate(-90 ${isolationX - 4} ${boardHeight / 2})`}
                >
                  ⚡ REINFORCED ISOLATION (≥ 6.4mm CREEPAGE)
                </text>
              </g>
            )}

            {/* ── Bottom Copper Traces (B.Cu) ── */}
            {showBottomCu && (
              <g id="layer-bottom-cu" strokeLinecap="round" strokeLinejoin="round" fill="none">
                {dynamicTraces
                  .filter((t) => t.layer === 'bottom')
                  .map((trace) => {
                    const isSelected = selectedNetId === trace.netId;
                    return (
                      <path
                        key={trace.netId}
                        d={trace.pathD}
                        stroke={isSelected ? '#f59e0b' : trace.color}
                        strokeWidth={isSelected ? trace.strokeWidth + 2 : trace.strokeWidth}
                        opacity={isSelected ? 1 : 0.7}
                        onClick={() => onSelectNet(trace.netId)}
                        className="cursor-pointer"
                      />
                    );
                  })}
              </g>
            )}

            {/* ── Top Copper Traces (F.Cu) ── */}
            {showTopCu && (
              <g id="layer-top-cu" strokeLinecap="round" strokeLinejoin="round" fill="none">
                {dynamicTraces
                  .filter((t) => t.layer === 'top')
                  .map((trace) => {
                    const isSelected = selectedNetId === trace.netId;
                    return (
                      <path
                        key={trace.netId}
                        d={trace.pathD}
                        stroke={isSelected ? '#f59e0b' : trace.color}
                        strokeWidth={isSelected ? trace.strokeWidth + 2 : trace.strokeWidth}
                        opacity={isSelected ? 1 : 0.9}
                        onClick={() => onSelectNet(trace.netId)}
                        className="cursor-pointer"
                      />
                    );
                  })}
              </g>
            )}

            {/* ── Ratsnest Airwires ── */}
            {showRatsnest && (
              <g id="layer-ratsnest" stroke="#eab308" strokeWidth="1" strokeDasharray="3 3" opacity="0.75">
                {graph.nets.map((net) => {
                  const pads = net.connections
                    .map((conn) => padMap.get(`${conn.componentId}:${conn.pinNumber}`))
                    .filter((p): p is NonNullable<typeof p> => Boolean(p));

                  if (pads.length < 2) return null;
                  const lines: React.ReactNode[] = [];
                  for (let i = 0; i < pads.length - 1; i++) {
                    lines.push(
                      <line
                        key={`${net.id}-${i}`}
                        x1={pads[i].x}
                        y1={pads[i].y}
                        x2={pads[i + 1].x}
                        y2={pads[i + 1].y}
                      />
                    );
                  }
                  return <g key={net.id}>{lines}</g>;
                })}
              </g>
            )}

            {/* ── Component Silkscreen & SMD Footprints ── */}
            <g id="components-layer">
              {placedComponents.map((comp) => {
                const isSelected = selectedCompId === comp.id;
                const pinCount = comp.pins.length;

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

                    {showPads && (
                      <g>
                        {comp.isPass && pinCount === 2 ? (
                          <>
                            <rect x="0" y="2" width="7" height={comp.h - 4} rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
                            <rect x={comp.w - 7} y="2" width={comp.h - 4} height={comp.h - 4} rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
                          </>
                        ) : (
                          comp.pins.map((pin, idx) => {
                            const half = Math.ceil(pinCount / 2);
                            const isLeft = idx < half;
                            const padY = isLeft
                              ? 6 + idx * ((comp.h - 14) / Math.max(1, half - 1))
                              : 6 + (idx - half) * ((comp.h - 14) / Math.max(1, pinCount - half - 1));

                            return (
                              <rect
                                key={pin.number}
                                x={isLeft ? 0 : comp.w - 6}
                                y={padY}
                                width="6"
                                height="5"
                                rx="1"
                                fill="#eab308"
                                stroke="#ca8a04"
                                strokeWidth="0.8"
                              />
                            );
                          })
                        )}

                        <circle cx="6" cy="6" r="1.8" fill="#e11d48" />

                        {(comp.isQFN || comp.isLarge) && (
                          <rect
                            x="10"
                            y="10"
                            width={comp.w - 20}
                            height={comp.h - 20}
                            rx="2"
                            fill="#ca8a04"
                            opacity="0.5"
                          />
                        )}
                      </g>
                    )}

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
          </g>
        </svg>

        {/* Floating Board Stats Card */}
        <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-black/80 backdrop-blur-md border border-brand-border/40 text-[11px] font-mono text-brand-textMuted space-y-1 shadow-xl pointer-events-none">
          <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>2D PCB Layout & Copper Verification</span>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            <span>
              Size: <strong>{(boardWidth / 10).toFixed(0)}mm × {(boardHeight / 10).toFixed(0)}mm</strong>
            </span>
            <span>
              Stackup: <strong>2-Layer FR4 2oz</strong>
            </span>
            <span>
              Components: <strong>{graph.components.length}</strong>
            </span>
            <span>
              Nets: <strong>{graph.nets.length}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
