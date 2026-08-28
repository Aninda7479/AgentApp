import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sun,
  Moon,
  Zap,
  Tag,
  Plus,
  Trash2,
  MousePointer,
  Grid,
  Download,
  Info,
  CheckCircle2,
  Move,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Layers,
  Cpu,
  Radio,
} from 'lucide-react';
import { PCBGraph, ComponentInstance, Net, ComponentPin, PinEndpoint } from './types';

interface ECADSchematicCanvasProps {
  graph: PCBGraph;
  selectedCompId: string | null;
  selectedNetId: string | null;
  onSelectComponent: (id: string | null) => void;
  onSelectNet: (id: string | null) => void;
  onUpdateGraph: (graph: PCBGraph) => void;
}

export type SchematicSymbolType =
  | 'resistor'
  | 'capacitor'
  | 'polarized_capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zener'
  | 'transistor_nmos'
  | 'transistor_pmos'
  | 'transistor_bjt'
  | 'transformer'
  | 'crystal'
  | 'fuse'
  | 'varistor'
  | 'connector'
  | 'ic';

/**
 * Classifies a component instance into standard ECAD schematic symbol types based on model properties
 */
export function classifyComponentSymbol(comp: ComponentInstance): SchematicSymbolType {
  const cat = comp.category;
  const name = comp.name.toLowerCase();
  const desc = (comp.description || '').toLowerCase();
  const mpn = (comp.mpn || '').toLowerCase();
  const id = comp.id.toUpperCase();
  const pkg = (comp.package || '').toLowerCase();

  // 1. Crystal / Oscillator
  if (id.startsWith('Y') || id.startsWith('X') || name.includes('crystal') || name.includes('oscillator') || desc.includes('crystal')) {
    return 'crystal';
  }

  // 2. Transformer
  if (id.startsWith('T') || name.includes('transformer') || desc.includes('transformer') || (comp.pins.some((p) => p.name.includes('PRI')) && comp.pins.some((p) => p.name.includes('SEC')))) {
    return 'transformer';
  }

  // 3. Fuses & Varistors (MOV)
  if (id.startsWith('RV') || id.startsWith('MOV') || name.includes('varistor') || name.includes('mov')) {
    return 'varistor';
  }
  if (id.startsWith('F') || name.includes('fuse') || desc.includes('fuse')) {
    return 'fuse';
  }

  // 4. Passives (Resistors, Capacitors, Inductors)
  if (cat === 'Passive' || id.startsWith('R') || id.startsWith('C') || id.startsWith('L')) {
    if (id.startsWith('R') || name.includes('resistor') || name.includes('potentiometer') || desc.includes('resistor')) {
      return 'resistor';
    }
    if (id.startsWith('C') || name.includes('capacitor') || name.includes('cap') || desc.includes('capacitor')) {
      const isPolarized =
        name.includes('electrolytic') ||
        name.includes('tantalum') ||
        name.includes('bulk') ||
        name.includes('polymer') ||
        pkg.includes('radial') ||
        comp.pins.some((p) => p.name === '+' || p.name === '-');
      return isPolarized ? 'polarized_capacitor' : 'capacitor';
    }
    if (id.startsWith('L') || name.includes('inductor') || name.includes('choke') || name.includes('ferrite') || desc.includes('inductor')) {
      return 'inductor';
    }
  }

  // 5. Discretes (Diodes, Transistors, MOSFETs)
  if (cat === 'Discrete' || id.startsWith('D') || id.startsWith('Q') || id.startsWith('SW')) {
    if (id.startsWith('D') || name.includes('diode') || name.includes('led') || name.includes('zener') || name.includes('schottky') || desc.includes('diode')) {
      if (name.includes('led') || desc.includes('led')) return 'led';
      if (name.includes('zener') || desc.includes('zener')) return 'zener';
      return 'diode';
    }
    if (id.startsWith('Q') || name.includes('mosfet') || name.includes('transistor') || desc.includes('mosfet')) {
      if (name.includes('p-mos') || desc.includes('p-channel')) return 'transistor_pmos';
      if (name.includes('bjt') || name.includes('npn') || name.includes('pnp')) return 'transistor_bjt';
      return 'transistor_nmos';
    }
  }

  // 6. Connectors
  if (cat === 'Connector' || id.startsWith('J') || name.includes('connector') || name.includes('header') || name.includes('usb') || pkg.includes('usb') || pkg.includes('hdr')) {
    return 'connector';
  }

  // 7. Default to Multi-Pin IC / Module / Controller / Sensor
  return 'ic';
}

/**
 * Calculates topological layout positions dynamically for all components in the graph
 */
export function computeTopologicalLayout(
  components: ComponentInstance[],
  nets: Net[]
): Map<string, { x: number; y: number; w: number; h: number; symbolType: SchematicSymbolType }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number; symbolType: SchematicSymbolType }>();
  if (components.length === 0) return map;

  // Build net adjacency
  const compNetCount = new Map<string, number>();
  const compNeighbors = new Map<string, Set<string>>();

  components.forEach((c) => {
    compNetCount.set(c.id, 0);
    compNeighbors.set(c.id, new Set());
  });

  nets.forEach((net) => {
    const connectedComps = Array.from(new Set(net.connections.map((c) => c.componentId)));
    connectedComps.forEach((c1) => {
      compNetCount.set(c1, (compNetCount.get(c1) || 0) + 1);
      connectedComps.forEach((c2) => {
        if (c1 !== c2 && compNeighbors.has(c1)) {
          compNeighbors.get(c1)!.add(c2);
        }
      });
    });
  });

  // Categorize components into logical signal flow stages (0: Input -> 1: Power/Primary -> 2: MCU/Core -> 3: Secondary/Interface -> 4: Output)
  const stageColumns = new Map<number, ComponentInstance[]>();

  components.forEach((comp) => {
    const symbol = classifyComponentSymbol(comp);
    let stage = 2; // Default core stage

    const hasInputPins = comp.pins.some(
      (p) =>
        p.type === 'power_in' ||
        p.type === 'input' ||
        p.name.toUpperCase().includes('IN') ||
        p.name.toUpperCase().includes('AC') ||
        p.name.toUpperCase().includes('VIN') ||
        p.name.toUpperCase().includes('MAINS')
    );

    const hasOutputPins = comp.pins.some(
      (p) =>
        p.type === 'power_out' ||
        p.type === 'output' ||
        p.name.toUpperCase().includes('OUT') ||
        p.name.toUpperCase().includes('VBUS') ||
        p.name.toUpperCase().includes('TX')
    );

    if (symbol === 'connector' && (hasInputPins || !hasOutputPins)) {
      stage = 0; // Input connector
    } else if (symbol === 'fuse' || symbol === 'varistor') {
      stage = 0; // Protection
    } else if (symbol === 'connector' && hasOutputPins) {
      stage = 4; // Output connector
    } else if (symbol === 'transformer') {
      stage = 2; // Central isolation
    } else if (comp.category === 'MCU' || comp.category === 'Sensor') {
      stage = 2; // Central logic / MCU
    } else if (comp.category === 'Power') {
      stage = 1; // Power stage
    } else if (symbol === 'transistor_nmos' || symbol === 'transistor_pmos' || symbol === 'transistor_bjt') {
      stage = 3; // Secondary switches
    } else if (symbol === 'resistor' || symbol === 'capacitor' || symbol === 'polarized_capacitor' || symbol === 'inductor' || symbol === 'crystal') {
      const neighbors = Array.from(compNeighbors.get(comp.id) || []);
      const parentIC = components.find((c) => neighbors.includes(c.id) && (c.category === 'MCU' || c.category === 'Power' || c.category === 'Interface' || c.category === 'Sensor'));
      if (parentIC) {
        stage = 2;
      } else if (hasInputPins) {
        stage = 1;
      } else {
        stage = 2;
      }
    }

    if (!stageColumns.has(stage)) stageColumns.set(stage, []);
    stageColumns.get(stage)!.push(comp);
  });

  const sortedStages = Array.from(stageColumns.keys()).sort((a, b) => a - b);
  let currentX = 80;
  const colSpacing = 280;

  sortedStages.forEach((stage) => {
    const comps = stageColumns.get(stage) || [];
    let currentY = 120;

    comps.forEach((comp) => {
      const symbolType = classifyComponentSymbol(comp);
      const pinCount = comp.pins.length;

      let w = 140;
      let h = 80;

      if (symbolType === 'resistor' || symbolType === 'fuse' || symbolType === 'varistor') {
        w = 110;
        h = 50;
      } else if (symbolType === 'capacitor' || symbolType === 'polarized_capacitor') {
        w = 110;
        h = 55;
      } else if (symbolType === 'inductor') {
        w = 120;
        h = 55;
      } else if (symbolType === 'diode' || symbolType === 'led' || symbolType === 'zener') {
        w = 110;
        h = 50;
      } else if (symbolType === 'transistor_nmos' || symbolType === 'transistor_pmos' || symbolType === 'transistor_bjt') {
        w = 120;
        h = 75;
      } else if (symbolType === 'crystal') {
        w = 120;
        h = 60;
      } else if (symbolType === 'transformer') {
        w = 150;
        h = Math.max(90, Math.ceil(pinCount / 2) * 26 + 30);
      } else if (symbolType === 'connector') {
        w = 140;
        h = Math.max(70, pinCount * 22 + 36);
      } else {
        const longestNameLen = Math.max(...comp.pins.map((p) => p.name.length), 4);
        w = Math.max(160, longestNameLen * 8 + 80);
        const pinsPerSide = Math.ceil(pinCount / 2);
        h = Math.max(80, pinsPerSide * 24 + 44);
      }

      const x = comp.x !== undefined ? comp.x : currentX;
      const y = comp.y !== undefined ? comp.y : currentY;

      map.set(comp.id, { x, y, w, h, symbolType });
      currentY += h + 50;
    });

    currentX += colSpacing;
  });

  return map;
}

export const ECADSchematicCanvas: React.FC<ECADSchematicCanvasProps> = ({
  graph,
  selectedCompId,
  selectedNetId,
  onSelectComponent,
  onSelectNet,
  onUpdateGraph,
}) => {
  // Viewport State
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 25 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Theme
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Active Tool: 'select' | 'wire' | 'delete'
  const [activeTool, setActiveTool] = useState<'select' | 'wire' | 'delete'>('select');

  // Interactive Wiring State
  const [wireStartPin, setWireStartPin] = useState<{ compId: string; pinNumber: string; x: number; y: number } | null>(null);
  const [wireMousePos, setWireMousePos] = useState<{ x: number; y: number } | null>(null);

  // Component Dragging State
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [compDragOffset, setCompDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Theme Colors
  const colors = useMemo(() => {
    if (theme === 'light') {
      return {
        bg: '#f8fafc',
        sheetBg: '#ffffff',
        grid: '#e2e8f0',
        border: '#94a3b8',
        titleBox: '#f1f5f9',
        titleText: '#0f172a',
        subText: '#475569',
        wire: '#2563eb',
        wireSelected: '#d97706',
        junction: '#1e40af',
        icFill: '#fffbeb',
        icStroke: '#b45309',
        icText: '#78350f',
        pinText: '#1e293b',
        pinNumber: '#64748b',
        pinStroke: '#94a3b8',
        passiveStroke: '#0f172a',
        passiveFill: '#f8fafc',
        powerText: '#dc2626',
        powerSymbol: '#dc2626',
        gndText: '#475569',
        gndSymbol: '#334155',
        tagFill: '#fef3c7',
        tagStroke: '#d97706',
        tagText: '#92400e',
      };
    } else {
      return {
        bg: '#080d14',
        sheetBg: '#0f172a',
        grid: '#1e293b',
        border: '#334155',
        titleBox: '#1e293b',
        titleText: '#f8fafc',
        subText: '#94a3b8',
        wire: '#60a5fa',
        wireSelected: '#f59e0b',
        junction: '#93c5fd',
        icFill: '#131e32',
        icStroke: '#38bdf8',
        icText: '#38bdf8',
        pinText: '#f1f5f9',
        pinNumber: '#64748b',
        pinStroke: '#475569',
        passiveStroke: '#e2e8f0',
        passiveFill: '#1e293b',
        powerText: '#f87171',
        powerSymbol: '#ef4444',
        gndText: '#94a3b8',
        gndSymbol: '#94a3b8',
        tagFill: '#451a03',
        tagStroke: '#f59e0b',
        tagText: '#fef08a',
      };
    }
  }, [theme]);

  // Model-Driven Topological Auto-Layout
  const componentPositions = useMemo(() => {
    return computeTopologicalLayout(graph.components, graph.nets);
  }, [graph.components, graph.nets]);

  // Dynamic Drawing Sheet Bounding Box
  const { sheetWidth, sheetHeight } = useMemo(() => {
    let maxX = 1200;
    let maxY = 750;

    componentPositions.forEach((pos) => {
      if (pos.x + pos.w > maxX) maxX = pos.x + pos.w;
      if (pos.y + pos.h > maxY) maxY = pos.y + pos.h;
    });

    const width = Math.max(1650, Math.ceil((maxX + 320) / 50) * 50);
    const height = Math.max(1000, Math.ceil((maxY + 240) / 50) * 50);
    return { sheetWidth: width, sheetHeight: height };
  }, [componentPositions]);

  // Dynamic Sheet Grid Zones (1..N horizontally, A..Z vertically)
  const gridZones = useMemo(() => {
    const cols = Math.max(6, Math.floor((sheetWidth - 80) / 240));
    const rows = Math.max(4, Math.floor((sheetHeight - 80) / 200));

    const colLabels = Array.from({ length: cols }, (_, i) => ({
      num: i + 1,
      x: 60 + i * ((sheetWidth - 100) / cols),
    }));

    const rowLabels = Array.from({ length: rows }, (_, i) => ({
      letter: String.fromCharCode(65 + i),
      y: 90 + i * ((sheetHeight - 120) / rows),
    }));

    return { colLabels, rowLabels };
  }, [sheetWidth, sheetHeight]);

  // Compute Model-Driven Absolute Pin Coordinates
  const pinCoordinates = useMemo(() => {
    const map = new Map<
      string,
      {
        x: number;
        y: number;
        name: string;
        type: string;
        netId?: string;
        isLeft: boolean;
        isRight: boolean;
      }
    >();

    graph.components.forEach((comp) => {
      const pos = componentPositions.get(comp.id);
      if (!pos) return;

      const symbol = pos.symbolType;

      if (
        (symbol === 'resistor' ||
          symbol === 'capacitor' ||
          symbol === 'polarized_capacitor' ||
          symbol === 'inductor' ||
          symbol === 'diode' ||
          symbol === 'led' ||
          symbol === 'zener' ||
          symbol === 'fuse' ||
          symbol === 'varistor') &&
        comp.pins.length === 2
      ) {
        const pin1 = comp.pins[0];
        const pin2 = comp.pins[1];
        const midY = pos.y + pos.h / 2;

        map.set(`${comp.id}:${pin1.number}`, {
          x: pos.x,
          y: midY,
          name: pin1.name,
          type: pin1.type,
          netId: pin1.connectedNet,
          isLeft: true,
          isRight: false,
        });

        map.set(`${comp.id}:${pin2.number}`, {
          x: pos.x + pos.w,
          y: midY,
          name: pin2.name,
          type: pin2.type,
          netId: pin2.connectedNet,
          isLeft: false,
          isRight: true,
        });
        return;
      }

      if (
        (symbol === 'transistor_nmos' || symbol === 'transistor_pmos' || symbol === 'transistor_bjt') &&
        comp.pins.length >= 3
      ) {
        const p1 = comp.pins[0];
        const p2 = comp.pins[1];
        const p3 = comp.pins[2];

        map.set(`${comp.id}:${p1.number}`, {
          x: pos.x,
          y: pos.y + pos.h / 2,
          name: p1.name,
          type: p1.type,
          netId: p1.connectedNet,
          isLeft: true,
          isRight: false,
        });

        map.set(`${comp.id}:${p2.number}`, {
          x: pos.x + pos.w,
          y: pos.y + 20,
          name: p2.name,
          type: p2.type,
          netId: p2.connectedNet,
          isLeft: false,
          isRight: true,
        });

        map.set(`${comp.id}:${p3.number}`, {
          x: pos.x + pos.w,
          y: pos.y + pos.h - 20,
          name: p3.name,
          type: p3.type,
          netId: p3.connectedNet,
          isLeft: false,
          isRight: true,
        });
        return;
      }

      const leftPins: ComponentPin[] = [];
      const rightPins: ComponentPin[] = [];

      comp.pins.forEach((pin, i) => {
        const isInputOrPowerIn =
          pin.type === 'power_in' ||
          pin.type === 'input' ||
          pin.name.toUpperCase().includes('IN') ||
          pin.name.toUpperCase().includes('VCC') ||
          pin.name.toUpperCase().includes('VDD') ||
          pin.name.toUpperCase().includes('PRI');

        const isOutputOrPowerOut =
          pin.type === 'power_out' ||
          pin.type === 'output' ||
          pin.name.toUpperCase().includes('OUT') ||
          pin.name.toUpperCase().includes('VBUS') ||
          pin.name.toUpperCase().includes('SEC');

        if (isInputOrPowerIn) {
          leftPins.push(pin);
        } else if (isOutputOrPowerOut) {
          rightPins.push(pin);
        } else if (i % 2 === 0) {
          leftPins.push(pin);
        } else {
          rightPins.push(pin);
        }
      });

      leftPins.forEach((pin, i) => {
        const pinY = pos.y + 36 + i * 22;
        map.set(`${comp.id}:${pin.number}`, {
          x: pos.x,
          y: pinY,
          name: pin.name,
          type: pin.type,
          netId: pin.connectedNet,
          isLeft: true,
          isRight: false,
        });
      });

      rightPins.forEach((pin, i) => {
        const pinY = pos.y + 36 + i * 22;
        map.set(`${comp.id}:${pin.number}`, {
          x: pos.x + pos.w,
          y: pinY,
          name: pin.name,
          type: pin.type,
          netId: pin.connectedNet,
          isLeft: false,
          isRight: true,
        });
      });
    });

    return map;
  }, [graph.components, componentPositions]);

  // Compute Multi-Point Manhattan Orthogonal Net Wire Routes
  const wireRoutes = useMemo(() => {
    const routes: {
      netId: string;
      netName: string;
      netClass: string;
      pathD: string;
      junctions: { x: number; y: number }[];
    }[] = [];

    graph.nets.forEach((net) => {
      const endpoints = net.connections
        .map((conn) => pinCoordinates.get(`${conn.componentId}:${conn.pinNumber}`))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));

      if (endpoints.length < 2) return;

      const pathSegments: string[] = [];
      const junctions: { x: number; y: number }[] = [];

      const sorted = [...endpoints].sort((a, b) => a.x - b.x);
      const root = sorted[0];

      for (let i = 1; i < sorted.length; i++) {
        const target = sorted[i];

        const stub1 = root.isLeft ? root.x - 22 : root.x + 22;
        const stub2 = target.isLeft ? target.x - 22 : target.x + 22;
        const midX = (stub1 + stub2) / 2;

        pathSegments.push(
          `M ${root.x} ${root.y} L ${stub1} ${root.y} L ${midX} ${root.y} L ${midX} ${target.y} L ${stub2} ${target.y} L ${target.x} ${target.y}`
        );

        if (sorted.length > 2 && i < sorted.length - 1) {
          junctions.push({ x: midX, y: target.y });
        }
      }

      routes.push({
        netId: net.id,
        netName: net.name,
        netClass: net.netClass,
        pathD: pathSegments.join(' '),
        junctions,
      });
    });

    return routes;
  }, [graph.nets, pinCoordinates]);

  // ERC Audit Summary Metrics
  const ercStatus = useMemo(() => {
    const errors = graph.ercReport.filter((r) => r.severity === 'error');
    const warnings = graph.ercReport.filter((r) => r.severity === 'warning');
    const affectedCompSet = new Set<string>();
    graph.ercReport.forEach((r) => r.affectedComponents?.forEach((c) => affectedCompSet.add(c)));

    return {
      errorsCount: errors.length,
      warningsCount: warnings.length,
      isClean: errors.length === 0 && warnings.length === 0,
      affectedComponents: affectedCompSet,
    };
  }, [graph.ercReport]);

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
          const nextZoom = Math.max(0.2, Math.min(3.5, prevZoom * zoomFactor));
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
    if ((e.button === 0 || e.button === 1) && !draggingCompId && activeTool === 'select') {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (draggingCompId && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const rawX = (e.clientX - rect.left) / zoom;
      const rawY = (e.clientY - rect.top) / zoom;

      const snapGrid = 10;
      const snappedX = Math.round((rawX - compDragOffset.x) / snapGrid) * snapGrid;
      const snappedY = Math.round((rawY - compDragOffset.y) / snapGrid) * snapGrid;

      const updated = {
        ...graph,
        components: graph.components.map((c) =>
          c.id === draggingCompId ? { ...c, x: Math.max(30, snappedX), y: Math.max(30, snappedY) } : c
        ),
      };
      onUpdateGraph(updated);
    } else if (wireStartPin && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setWireMousePos({
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingCompId(null);
  };

  // Connect two pins interactively using the Wire tool
  const handlePinClick = (compId: string, pinNumber: string, pinX: number, pinY: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (activeTool === 'wire') {
      if (!wireStartPin) {
        setWireStartPin({ compId, pinNumber, x: pinX, y: pinY });
        setWireMousePos({ x: pinX, y: pinY });
      } else {
        if (wireStartPin.compId === compId && wireStartPin.pinNumber === pinNumber) {
          setWireStartPin(null);
          setWireMousePos(null);
          return;
        }

        const startPin = graph.components
          .find((c) => c.id === wireStartPin.compId)
          ?.pins.find((p) => p.number === wireStartPin.pinNumber);
        const targetPin = graph.components
          .find((c) => c.id === compId)
          ?.pins.find((p) => p.number === pinNumber);

        if (!startPin || !targetPin) {
          setWireStartPin(null);
          setWireMousePos(null);
          return;
        }

        let netId = startPin.connectedNet || targetPin.connectedNet;
        if (!netId) {
          netId = `NET_${startPin.name}_${targetPin.name}`.replace(/[^A-Za-z0-9_]/g, '_');
        }

        const updatedNets = [...graph.nets];
        let existingNet = updatedNets.find((n) => n.id === netId);

        const newConnections: PinEndpoint[] = [
          { componentId: wireStartPin.compId, pinNumber: wireStartPin.pinNumber },
          { componentId: compId, pinNumber },
        ];

        if (existingNet) {
          newConnections.forEach((nc) => {
            if (!existingNet!.connections.some((c) => c.componentId === nc.componentId && c.pinNumber === nc.pinNumber)) {
              existingNet!.connections.push(nc);
            }
          });
        } else {
          updatedNets.push({
            id: netId,
            name: netId.replace(/^NET_/, ''),
            netClass: startPin.type === 'power_in' || startPin.type === 'power_out' ? 'power' : 'signal',
            connections: newConnections,
          });
        }

        const updatedComps = graph.components.map((c) => {
          if (c.id === wireStartPin.compId || c.id === compId) {
            return {
              ...c,
              pins: c.pins.map((p) => {
                if (
                  (c.id === wireStartPin.compId && p.number === wireStartPin.pinNumber) ||
                  (c.id === compId && p.number === pinNumber)
                ) {
                  return { ...p, connectedNet: netId };
                }
                return p;
              }),
            };
          }
          return c;
        });

        onUpdateGraph({
          ...graph,
          components: updatedComps,
          nets: updatedNets,
        });

        setWireStartPin(null);
        setWireMousePos(null);
      }
    }
  };

  // Re-run Auto Layout
  const handleAutoLayout = () => {
    const layout = computeTopologicalLayout(
      graph.components.map((c) => ({ ...c, x: undefined, y: undefined })),
      graph.nets
    );

    const updatedComps = graph.components.map((c) => {
      const pos = layout.get(c.id);
      if (pos) {
        return { ...c, x: pos.x, y: pos.y };
      }
      return c;
    });

    onUpdateGraph({ ...graph, components: updatedComps });
  };

  // Fit Sheet Centered in Viewport
  const handleFitToView = useCallback(() => {
    if (!containerRef.current) {
      setZoom(0.85);
      setPan({ x: 30, y: 25 });
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 50;
    const availableWidth = rect.width - padding * 2;
    const availableHeight = rect.height - padding * 2;

    const scaleX = availableWidth / sheetWidth;
    const scaleY = availableHeight / sheetHeight;
    const optimalZoom = Math.max(0.25, Math.min(1.4, Math.min(scaleX, scaleY)));

    const centerX = (rect.width - sheetWidth * optimalZoom) / 2;
    const centerY = (rect.height - sheetHeight * optimalZoom) / 2;

    setZoom(optimalZoom);
    setPan({ x: Math.max(20, centerX), y: Math.max(20, centerY) });
  }, [sheetWidth, sheetHeight]);

  // Export Schematic as SVG File
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graph.metadata?.name || 'schematic'}.svg`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render Parametric Standard ECAD Symbols
  const renderComponentSymbol = (comp: ComponentInstance) => {
    const pos = componentPositions.get(comp.id);
    if (!pos) return null;

    const isSelected = selectedCompId === comp.id;
    const hasErcIssue = ercStatus.affectedComponents.has(comp.id);
    const symbol = pos.symbolType;

    // 1. Resistor / Fuse / MOV Symbol
    if (symbol === 'resistor' || symbol === 'fuse' || symbol === 'varistor') {
      return (
        <g
          key={comp.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectComponent(comp.id);
            onSelectNet(null);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              setDraggingCompId(comp.id);
              setCompDragOffset({ x: 0, y: 0 });
            }
          }}
          className="cursor-move group"
        >
          {isSelected && (
            <rect x="-6" y="-6" width={pos.w + 12} height={pos.h + 12} rx="4" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
          )}

          <line x1="0" y1={pos.h / 2} x2="24" y2={pos.h / 2} stroke={colors.passiveStroke} strokeWidth="1.6" />
          <line x1={pos.w - 24} y1={pos.h / 2} x2={pos.w} y2={pos.h / 2} stroke={colors.passiveStroke} strokeWidth="1.6" />

          <circle cx="0" cy={pos.h / 2} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />
          <circle cx={pos.w} cy={pos.h / 2} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />

          {symbol === 'resistor' ? (
            <path
              d={`M 24 ${pos.h / 2} l 6 -12 l 10 24 l 10 -24 l 10 24 l 10 -24 l 10 24 l 6 -12`}
              fill="none"
              stroke={isSelected ? '#10b981' : colors.passiveStroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ) : (
            <g>
              <rect x="24" y={pos.h / 2 - 10} width={pos.w - 48} height="20" fill={colors.passiveFill} stroke={colors.passiveStroke} strokeWidth="1.6" />
              <line x1="24" y1={pos.h / 2} x2={pos.w - 24} y2={pos.h / 2} stroke={colors.passiveStroke} strokeWidth="1.2" />
            </g>
          )}

          <text x={pos.w / 2} y={pos.h / 2 - 16} textAnchor="middle" fill={colors.icText} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {comp.id}
          </text>
          <text x={pos.w / 2} y={pos.h / 2 + 24} textAnchor="middle" fill={colors.subText} fontSize="9" fontFamily="monospace">
            {comp.value || comp.mpn.slice(0, 12)}
          </text>

          <text x="4" y={pos.h / 2 - 4} fill={colors.pinNumber} fontSize="8" fontFamily="monospace">
            {comp.pins[0]?.number}
          </text>
          <text x={pos.w - 8} y={pos.h / 2 - 4} textAnchor="end" fill={colors.pinNumber} fontSize="8" fontFamily="monospace">
            {comp.pins[1]?.number}
          </text>
        </g>
      );
    }

    // 2. Capacitor (Standard & Polarized)
    if (symbol === 'capacitor' || symbol === 'polarized_capacitor') {
      const isPolar = symbol === 'polarized_capacitor';
      const midY = pos.h / 2;
      return (
        <g
          key={comp.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectComponent(comp.id);
            onSelectNet(null);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              setDraggingCompId(comp.id);
              setCompDragOffset({ x: 0, y: 0 });
            }
          }}
          className="cursor-move group"
        >
          {isSelected && (
            <rect x="-6" y="-6" width={pos.w + 12} height={pos.h + 12} rx="4" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
          )}

          <line x1="0" y1={midY} x2={pos.w / 2 - 6} y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />
          <line x1={pos.w / 2 + 6} y1={midY} x2={pos.w} y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />

          <line x1={pos.w / 2 - 6} y1={midY - 14} x2={pos.w / 2 - 6} y2={midY + 14} stroke={isSelected ? '#10b981' : colors.passiveStroke} strokeWidth="2.5" />
          {isPolar ? (
            <g>
              <path d={`M ${pos.w / 2 + 6} ${midY - 14} Q ${pos.w / 2 + 10} ${midY} ${pos.w / 2 + 6} ${midY + 14}`} fill="none" stroke={colors.passiveStroke} strokeWidth="2.5" />
              <text x={pos.w / 2 - 14} y={midY - 8} fill={colors.powerText} fontSize="11" fontWeight="bold" fontFamily="monospace">
                +
              </text>
            </g>
          ) : (
            <line x1={pos.w / 2 + 6} y1={midY - 14} x2={pos.w / 2 + 6} y2={midY + 14} stroke={colors.passiveStroke} strokeWidth="2.5" />
          )}

          <circle cx="0" cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />
          <circle cx={pos.w} cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />

          <text x={pos.w / 2} y={midY - 18} textAnchor="middle" fill={colors.icText} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {comp.id}
          </text>
          <text x={pos.w / 2} y={midY + 26} textAnchor="middle" fill={colors.subText} fontSize="9" fontFamily="monospace">
            {comp.value || comp.mpn.slice(0, 12)}
          </text>
        </g>
      );
    }

    // 3. Inductor / Choke
    if (symbol === 'inductor') {
      const midY = pos.h / 2;
      return (
        <g
          key={comp.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectComponent(comp.id);
            onSelectNet(null);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              setDraggingCompId(comp.id);
              setCompDragOffset({ x: 0, y: 0 });
            }
          }}
          className="cursor-move group"
        >
          {isSelected && (
            <rect x="-6" y="-6" width={pos.w + 12} height={pos.h + 12} rx="4" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
          )}

          <line x1="0" y1={midY} x2="22" y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />
          <line x1={pos.w - 22} y1={midY} x2={pos.w} y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />

          <path
            d={`M 22 ${midY} A 8 8 0 0 1 38 ${midY} A 8 8 0 0 1 54 ${midY} A 8 8 0 0 1 70 ${midY} A 8 8 0 0 1 86 ${midY} L ${pos.w - 22} ${midY}`}
            fill="none"
            stroke={isSelected ? '#10b981' : colors.passiveStroke}
            strokeWidth="2"
          />

          <circle cx="0" cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />
          <circle cx={pos.w} cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />

          <text x={pos.w / 2} y={midY - 14} textAnchor="middle" fill={colors.icText} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {comp.id}
          </text>
          <text x={pos.w / 2} y={midY + 22} textAnchor="middle" fill={colors.subText} fontSize="9" fontFamily="monospace">
            {comp.value || comp.mpn.slice(0, 12)}
          </text>
        </g>
      );
    }

    // 4. Diode / LED / Zener
    if (symbol === 'diode' || symbol === 'led' || symbol === 'zener') {
      const midY = pos.h / 2;
      return (
        <g
          key={comp.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectComponent(comp.id);
            onSelectNet(null);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              setDraggingCompId(comp.id);
              setCompDragOffset({ x: 0, y: 0 });
            }
          }}
          className="cursor-move group"
        >
          {isSelected && (
            <rect x="-6" y="-6" width={pos.w + 12} height={pos.h + 12} rx="4" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
          )}

          <line x1="0" y1={midY} x2={pos.w / 2 - 14} y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />
          <line x1={pos.w / 2 + 14} y1={midY} x2={pos.w} y2={midY} stroke={colors.passiveStroke} strokeWidth="1.6" />

          <polygon
            points={`${pos.w / 2 - 14},${midY - 12} ${pos.w / 2 - 14},${midY + 12} ${pos.w / 2 + 14},${midY}`}
            fill={isSelected ? '#10b981' : colors.passiveFill}
            stroke={colors.passiveStroke}
            strokeWidth="1.8"
          />

          <line x1={pos.w / 2 + 14} y1={midY - 12} x2={pos.w / 2 + 14} y2={midY + 12} stroke={colors.passiveStroke} strokeWidth="2.2" />

          {symbol === 'led' && (
            <g transform={`translate(${pos.w / 2}, ${midY - 14})`}>
              <line x1="0" y1="0" x2="8" y2="-8" stroke={colors.powerText} strokeWidth="1.4" />
              <polygon points="8,-8 5,-8 8,-5" fill={colors.powerText} />
              <line x1="6" y1="2" x2="14" y2="-6" stroke={colors.powerText} strokeWidth="1.4" />
              <polygon points="14,-6 11,-6 14,-3" fill={colors.powerText} />
            </g>
          )}

          <circle cx="0" cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />
          <circle cx={pos.w} cy={midY} r="2.5" fill={colors.sheetBg} stroke={colors.passiveStroke} strokeWidth="1.4" />

          <text x={pos.w / 2} y={midY - 18} textAnchor="middle" fill={colors.icText} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {comp.id}
          </text>
          <text x={pos.w / 2} y={midY + 24} textAnchor="middle" fill={colors.subText} fontSize="9" fontFamily="monospace">
            {comp.value || comp.mpn.slice(0, 12)}
          </text>
        </g>
      );
    }

    // 5. Default Multi-Pin Parametric IC / Module / Connector
    const leftPins: ComponentPin[] = [];
    const rightPins: ComponentPin[] = [];

    comp.pins.forEach((pin, i) => {
      const isInputOrPowerIn =
        pin.type === 'power_in' ||
        pin.type === 'input' ||
        pin.name.toUpperCase().includes('IN') ||
        pin.name.toUpperCase().includes('VCC') ||
        pin.name.toUpperCase().includes('VDD') ||
        pin.name.toUpperCase().includes('PRI');

      const isOutputOrPowerOut =
        pin.type === 'power_out' ||
        pin.type === 'output' ||
        pin.name.toUpperCase().includes('OUT') ||
        pin.name.toUpperCase().includes('VBUS') ||
        pin.name.toUpperCase().includes('SEC');

      if (isInputOrPowerIn) {
        leftPins.push(pin);
      } else if (isOutputOrPowerOut) {
        rightPins.push(pin);
      } else if (i % 2 === 0) {
        leftPins.push(pin);
      } else {
        rightPins.push(pin);
      }
    });

    return (
      <g
        key={comp.id}
        transform={`translate(${pos.x}, ${pos.y})`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectComponent(comp.id);
          onSelectNet(null);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (activeTool === 'select') {
            setDraggingCompId(comp.id);
            setCompDragOffset({ x: 0, y: 0 });
          }
        }}
        className="cursor-move group"
      >
        {isSelected && (
          <rect
            x="-8"
            y="-8"
            width={pos.w + 16}
            height={pos.h + 16}
            rx="5"
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 2"
            className="animate-pulse"
          />
        )}

        {hasErcIssue && (
          <rect
            x="-4"
            y="-4"
            width={pos.w + 8}
            height={pos.h + 8}
            rx="4"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.8"
            strokeDasharray="3 3"
          />
        )}

        <rect
          x="0"
          y="0"
          width={pos.w}
          height={pos.h}
          rx="3"
          fill={colors.icFill}
          stroke={isSelected ? '#10b981' : hasErcIssue ? '#ef4444' : colors.icStroke}
          strokeWidth="1.6"
          className="drop-shadow-xs"
        />

        <rect x="0" y="0" width={pos.w} height="26" fill={colors.icStroke} opacity="0.12" />
        <path d={`M ${pos.w / 2 - 6} 0 A 6 6 0 0 0 ${pos.w / 2 + 6} 0 Z`} fill={colors.border} />

        <text x="8" y="18" fill={colors.icText} fontSize="12" fontWeight="bold" fontFamily="monospace">
          {comp.id}
        </text>
        <text x={pos.w - 8} y="17" textAnchor="end" fill={colors.subText} fontSize="8.5" fontFamily="monospace">
          {comp.package || comp.category}
        </text>

        <text x="8" y={pos.h - 8} fill={colors.subText} fontSize="8" fontFamily="monospace" className="truncate">
          {comp.value || comp.mpn.slice(0, 16)}
        </text>

        {leftPins.map((pin, i) => {
          const pinY = 36 + i * 22;
          const isPower = pin.type === 'power_in' || pin.name.includes('VCC') || pin.name.includes('VDD') || pin.name.includes('VIN');
          const isGnd = pin.name.includes('GND') || pin.name.includes('VSS');

          return (
            <g
              key={`l-${pin.number}`}
              onClick={(e) => handlePinClick(comp.id, pin.number, pos.x - 12, pos.y + pinY, e)}
              className="cursor-pointer group/pin"
            >
              <line x1="-12" y1={pinY} x2="0" y2={pinY} stroke={colors.pinStroke} strokeWidth="1.4" />
              <circle
                cx="-12"
                cy={pinY}
                r={wireStartPin?.compId === comp.id && wireStartPin?.pinNumber === pin.number ? 4 : 2}
                fill={wireStartPin?.compId === comp.id && wireStartPin?.pinNumber === pin.number ? '#10b981' : colors.sheetBg}
                stroke={colors.pinStroke}
                strokeWidth="1.4"
                className="group-hover/pin:scale-150 transition-transform"
              />

              <text x="-15" y={pinY - 3} textAnchor="end" fill={colors.pinNumber} fontSize="8" fontFamily="monospace">
                {pin.number}
              </text>

              <text x="8" y={pinY + 3.5} fill={isPower ? colors.powerText : isGnd ? colors.gndText : colors.pinText} fontSize="9" fontWeight="600" fontFamily="monospace">
                {pin.name}
              </text>

              {isPower && pin.connectedNet && (
                <g transform={`translate(-28, ${pinY})`}>
                  <polygon points="0,0 8,-4 8,4" fill={colors.powerSymbol} />
                  <text x="-3" y="-5" textAnchor="end" fill={colors.powerText} fontSize="8" fontWeight="bold" fontFamily="monospace">
                    {pin.connectedNet}
                  </text>
                </g>
              )}

              {isGnd && (
                <g transform={`translate(-20, ${pinY})`}>
                  <line x1="0" y1="0" x2="0" y2="7" stroke={colors.gndSymbol} strokeWidth="1.4" />
                  <line x1="-5" y1="7" x2="5" y2="7" stroke={colors.gndSymbol} strokeWidth="1.6" />
                  <line x1="-3" y1="10" x2="3" y2="10" stroke={colors.gndSymbol} strokeWidth="1.3" />
                  <line x1="-1" y1="13" x2="1" y2="13" stroke={colors.gndSymbol} strokeWidth="1" />
                </g>
              )}
            </g>
          );
        })}

        {rightPins.map((pin, i) => {
          const pinY = 36 + i * 22;
          const isPower = pin.type === 'power_out' || pin.name.includes('VBUS') || pin.name.includes('OUT');
          const isGnd = pin.name.includes('GND') || pin.name.includes('VSS');
          const tagWidth = Math.max(48, (pin.connectedNet?.length || 4) * 6.5 + 14);

          return (
            <g
              key={`r-${pin.number}`}
              onClick={(e) => handlePinClick(comp.id, pin.number, pos.x + pos.w + 12, pos.y + pinY, e)}
              className="cursor-pointer group/pin"
            >
              <line x1={pos.w} y1={pinY} x2={pos.w + 12} y2={pinY} stroke={colors.pinStroke} strokeWidth="1.4" />
              <circle
                cx={pos.w + 12}
                cy={pinY}
                r={wireStartPin?.compId === comp.id && wireStartPin?.pinNumber === pin.number ? 4 : 2}
                fill={wireStartPin?.compId === comp.id && wireStartPin?.pinNumber === pin.number ? '#10b981' : colors.sheetBg}
                stroke={colors.pinStroke}
                strokeWidth="1.4"
                className="group-hover/pin:scale-150 transition-transform"
              />

              <text x={pos.w + 15} y={pinY - 3} fill={colors.pinNumber} fontSize="8" fontFamily="monospace">
                {pin.number}
              </text>

              <text
                x={pos.w - 8}
                y={pinY + 3.5}
                textAnchor="end"
                fill={isPower ? colors.powerText : isGnd ? colors.gndText : colors.pinText}
                fontSize="9"
                fontWeight="600"
                fontFamily="monospace"
              >
                {pin.name}
              </text>

              {pin.connectedNet && !isPower && !isGnd && (
                <g transform={`translate(${pos.w + 18}, ${pinY - 7})`}>
                  <polygon
                    points={`0,7 6,0 ${tagWidth},0 ${tagWidth},14 6,14`}
                    fill={colors.tagFill}
                    stroke={colors.tagStroke}
                    strokeWidth="1"
                  />
                  <text x="10" y="10" fill={colors.tagText} fontSize="8" fontWeight="bold" fontFamily="monospace">
                    {pin.connectedNet}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col overflow-hidden select-none font-sans"
      style={{ backgroundColor: colors.bg }}
    >
      {/* ── Vertical Right-Side Floating Glass Action Bar ── */}
      <div className="absolute right-4 top-20 z-20 flex flex-col items-center gap-1.5 p-2 bg-[#161b22]/80 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] text-xs">
        {/* Tool Palette */}
        <button
          onClick={() => {
            setActiveTool('select');
            setWireStartPin(null);
            setWireMousePos(null);
          }}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'select'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
          title="Pointer Tool (Select & Move)"
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('wire')}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'wire'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
          title="Interactive Pin Wiring Tool"
        >
          <Zap className="w-4 h-4 text-blue-400" />
        </button>

        <button
          onClick={handleAutoLayout}
          className="p-2 rounded-xl text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Auto Layout Schematic"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
        </button>

        <div className="w-5 h-px bg-white/10 my-0.5" />

        {/* Theme Toggle (Light / Dark) */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-2 rounded-xl text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
        </button>

        <button
          onClick={handleExportSVG}
          className="p-2 rounded-xl text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Export Schematic as SVG"
        >
          <Download className="w-4 h-4 text-emerald-400" />
        </button>

        <div className="w-5 h-px bg-white/10 my-0.5" />

        {/* Zoom Controls */}
        <button
          onClick={() => setZoom((z) => Math.min(3.0, z + 0.15))}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] font-mono font-semibold text-brand-textMuted py-0.5">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleFitToView}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Fit Schematic to View"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Main Interactive Schematic SVG Canvas ── */}
      <div
        ref={canvasContainerRef}
        className={`flex-1 overflow-hidden relative ${activeTool === 'wire' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          ref={svgRef}
          className="w-full h-full absolute inset-0"
        >
          <defs>
            <pattern id="ecad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="0.8" fill={colors.grid} />
            </pattern>
          </defs>

          {/* Infinite Canvas Background */}
          <rect width="100%" height="100%" fill={colors.bg} />

          {/* ── Transformed Drawing Plane ── */}
          <g
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            transformOrigin="0 0"
          >
            {/* ── Drawing Sheet Substrate & Frame (Dynamic Dimensions) ── */}
            <g id="schematic-sheet-frame">
              <rect
                x="20"
                y="20"
                width={sheetWidth}
                height={sheetHeight}
                fill={colors.sheetBg}
                stroke={colors.border}
                strokeWidth="2"
                className="drop-shadow-lg"
              />
              <rect x="20" y="20" width={sheetWidth} height={sheetHeight} fill="url(#ecad-grid)" />

              <rect
                x="35"
                y="35"
                width={sheetWidth - 30}
                height={sheetHeight - 30}
                fill="none"
                stroke={colors.border}
                strokeWidth="1.5"
              />

              {gridZones.colLabels.map((zone) => (
                <React.Fragment key={`z-col-${zone.num}`}>
                  <text x={zone.x} y="30" fill={colors.subText} fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {zone.num}
                  </text>
                  <text x={zone.x} y={sheetHeight + 12} fill={colors.subText} fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {zone.num}
                  </text>
                </React.Fragment>
              ))}

              {gridZones.rowLabels.map((zone) => (
                <React.Fragment key={`z-row-${zone.letter}`}>
                  <text x="24" y={zone.y} fill={colors.subText} fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {zone.letter}
                  </text>
                  <text x={sheetWidth + 8} y={zone.y} fill={colors.subText} fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {zone.letter}
                  </text>
                </React.Fragment>
              ))}

              {/* Title Block */}
              <g transform={`translate(${sheetWidth - 360}, ${sheetHeight - 90})`}>
                <rect width="345" height="75" fill={colors.titleBox} stroke={colors.border} strokeWidth="1.2" />
                <line x1="0" y1="26" x2="345" y2="26" stroke={colors.border} strokeWidth="0.8" />
                <line x1="0" y1="50" x2="345" y2="50" stroke={colors.border} strokeWidth="0.8" />
                <line x1="170" y1="26" x2="170" y2="75" stroke={colors.border} strokeWidth="0.8" />

                <text x="10" y="18" fill={colors.titleText} fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                  {graph.metadata?.name || 'Untitled Circuit Design'}
                </text>
                <text x="10" y="42" fill={colors.subText} fontSize="9" fontFamily="monospace">
                  REV: <strong>{graph.metadata?.revision || 'v1.0'}</strong> | ECAD: <strong>{graph.metadata?.targetEcad?.toUpperCase() || 'KICAD 8'}</strong>
                </text>
                <text x="180" y="42" fill={colors.subText} fontSize="9" fontFamily="monospace">
                  DATE: {graph.metadata?.updated || graph.metadata?.created || new Date().toISOString().split('T')[0]}
                </text>
                <text x="10" y="66" fill={colors.subText} fontSize="9" fontFamily="monospace">
                  AUTHOR: {graph.metadata?.author || 'SuperAgent ECAD'}
                </text>
                <text x="180" y="66" fill={colors.subText} fontSize="9" fontFamily="monospace">
                  SHEET: 1 OF 1
                </text>
              </g>
            </g>

            {/* ── Multi-Point Orthogonal Net Wires & Connections ── */}
            <g id="schematic-wires-layer">
              {wireRoutes.map((route) => {
                const isSelected = selectedNetId === route.netId;
                const isPowerNet =
                  route.netClass === 'power' ||
                  route.netName.includes('+') ||
                  route.netName.includes('VCC') ||
                  route.netName.includes('VBUS') ||
                  route.netName.includes('VIN');

                const isGroundNet = route.netClass === 'ground' || route.netName.includes('GND');

                const wireColor = isSelected
                  ? colors.wireSelected
                  : isPowerNet
                  ? theme === 'light'
                    ? '#dc2626'
                    : '#f87171'
                  : isGroundNet
                  ? theme === 'light'
                    ? '#475569'
                    : '#94a3b8'
                  : colors.wire;

                return (
                  <g
                    key={route.netId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectNet(route.netId);
                      onSelectComponent(null);
                    }}
                    className="cursor-pointer group"
                  >
                    <path d={route.pathD} fill="none" stroke="transparent" strokeWidth="14" />
                    <path
                      d={route.pathD}
                      fill="none"
                      stroke={wireColor}
                      strokeWidth={isSelected ? 3.0 : 1.8}
                      strokeLinecap="round"
                      strokeLinejoin="miter"
                    />
                    {route.junctions.map((j, idx) => (
                      <circle
                        key={idx}
                        cx={j.x}
                        cy={j.y}
                        r="3.5"
                        fill={isSelected ? colors.wireSelected : wireColor}
                      />
                    ))}
                  </g>
                );
              })}
            </g>

            {/* Live Interactive Wire */}
            {wireStartPin && wireMousePos && (
              <g id="schematic-interactive-wire">
                <line
                  x1={wireStartPin.x}
                  y1={wireStartPin.y}
                  x2={wireMousePos.x}
                  y2={wireMousePos.y}
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  className="animate-pulse"
                />
                <circle cx={wireMousePos.x} cy={wireMousePos.y} r="3.5" fill="#10b981" />
              </g>
            )}

            {/* Component Symbols Layer */}
            <g id="schematic-components-layer">
              {graph.components.map((comp) => renderComponentSymbol(comp))}
            </g>
          </g>
        </svg>

        {/* Floating Schematic Real-Time ERC & Graph Info Badge */}
        <div
          className="absolute bottom-4 left-4 p-3 rounded-xl border text-[11px] font-mono space-y-1 shadow-xl pointer-events-none backdrop-blur-md"
          style={{ backgroundColor: colors.sheetBg + 'dd', borderColor: colors.border, color: colors.subText }}
        >
          <div className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>ECAD Schematic Capture Engine</span>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            <span>
              Components: <strong className="text-gray-900 dark:text-white">{graph.components.length}</strong>
            </span>
            <span>
              Nets: <strong className="text-gray-900 dark:text-white">{graph.nets.length}</strong>
            </span>
            <span>
              ERC Status:{' '}
              {ercStatus.errorsCount > 0 ? (
                <strong className="text-rose-500 font-bold">{ercStatus.errorsCount} Violations</strong>
              ) : ercStatus.warningsCount > 0 ? (
                <strong className="text-amber-500 font-bold">{ercStatus.warningsCount} Warnings</strong>
              ) : (
                <strong className="text-emerald-500 font-bold">ERC Clean (0 Errors)</strong>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
