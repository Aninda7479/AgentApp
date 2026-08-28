import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Cpu,
  Zap,
  Activity,
  Layers,
  FileCode,
  Download,
  Share2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Send,
  Sparkles,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Database,
  Copy,
  Check,
  Code2,
  Settings,
  ChevronDown,
  ChevronUp,
  Box,
  Radio,
  FileText,
  MousePointer,
  Hand,
  Eye,
  EyeOff,
  HelpCircle,
  Undo2,
  Redo2,
  Sliders,
  RotateCcw,
  Compass,
  Mic,
  ArrowUp,
  Flame,
  LayoutGrid,
  Filter,
} from 'lucide-react';
import {
  PCBGraph,
  ComponentInstance,
  Net,
  ERCResult,
  STARTER_TEMPLATES,
  ExportFormat,
  createEmptyProjectGraph,
} from './types';
import { runElectricalRulesCheck } from './ercEngine';
import {
  exportToKiCad,
  exportToAltiumNetlist,
  exportToSKiDL,
  exportToEasyEDA,
  exportToBOM,
} from './exporters';
import { processHardwarePrompt, PCBSettingsConfig, DEFAULT_PCB_SETTINGS } from './hardwareAiEngine';
import { PCBSettingsModal } from './PCBSettingsModal';
import { PCBLayoutCanvas } from './PCBLayoutCanvas';
import { ECADSchematicCanvas } from './ECADSchematicCanvas';
import { PCB3DPreview } from './PCB3DPreview';
import { useModelList } from '../../hooks/useModelList';
import { useProviderStore } from '../../stores/providerStore';

interface PCBWorkspacePageProps {
  ipc?: any;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
  onBack?: () => void;
  onNewChat?: (promptText?: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  actionDiff?: {
    addedComponents?: string[];
    modifiedNets?: string[];
    explanation?: string;
  };
}

type CanvasTool = 'select' | 'hand' | 'measure';
type BoardViewId = 'schematic' | 'layout' | '3d' | 'power' | 'bom' | 'erc' | 'exporter';

export const PCBWorkspacePage: React.FC<PCBWorkspacePageProps> = ({
  ipc,
  triggerToast,
  onBack,
  onNewChat,
}) => {
  // Connected AI models
  const { enabledModels } = useModelList();
  const storeLastUsedModel = useProviderStore((s) => s.lastUsedModel);
  const allStoreModels = useProviderStore((s) => s.models) || [];
  const availableModels = enabledModels.length > 0 ? enabledModels : allStoreModels;

  // Active Project Graph
  const [graph, setGraph] = useState<PCBGraph>(() => createEmptyProjectGraph());

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<PCBGraph[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Active Selection
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);

  // Canvas Viewport Transformation
  const [zoom, setZoom] = useState<number>(0.7);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 70 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // Active Tool
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');

  // Focused Board (null = multi-board canvas view)
  const [focusedBoard, setFocusedBoard] = useState<BoardViewId | null>(null);

  // Visible Boards Filter
  const [visibleBoards, setVisibleBoards] = useState<Record<BoardViewId, boolean>>({
    schematic: true,
    layout: true,
    '3d': true,
    power: true,
    bom: true,
    erc: true,
    exporter: true,
  });

  // Floating AI Co-Pilot & Agent Log State
  const [chatInput, setChatInput] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [isAgentLogOpen, setIsAgentLogOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'agent',
      text: 'PCB Design Studio & Co-Pilot active. Design canvas is ready. What hardware system would you like to synthesize? (e.g. "Create an STM32 with USB-C, LDO, and I2C sensors", or prompt below).',
      timestamp: 'Just now',
    },
  ]);

  // Copy message state
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // PCB Settings Modal
  const [pcbSettings, setPcbSettings] = useState<PCBSettingsConfig>(DEFAULT_PCB_SETTINGS);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Shortcuts & Help Modal
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Export Modal
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('kicad');
  const [copiedExport, setCopiedExport] = useState<boolean>(false);

  // Add Component Modal
  const [showAddCompModal, setShowAddCompModal] = useState<boolean>(false);
  const [newCompCategory, setNewCompCategory] = useState<ComponentInstance['category']>('Sensor');
  const [newCompName, setNewCompName] = useState<string>('');
  const [newCompMpn, setNewCompMpn] = useState<string>('');
  const [newCompPkg, setNewCompPkg] = useState<string>('0402');

  // Zoom dropdown menu
  const [showZoomMenu, setShowZoomMenu] = useState<boolean>(false);

  // Minimap visibility
  const [showMinimap, setShowMinimap] = useState<boolean>(false);

  // Resolve active connected model dynamically
  const resolvedModelName = useMemo(() => {
    if (
      pcbSettings.selectedModel &&
      availableModels.some((m) => m.name === pcbSettings.selectedModel || m.id === pcbSettings.selectedModel)
    ) {
      return pcbSettings.selectedModel;
    }
    if (
      storeLastUsedModel &&
      availableModels.some((m) => m.name === storeLastUsedModel || m.id === storeLastUsedModel)
    ) {
      return storeLastUsedModel;
    }
    if (availableModels.length > 0) {
      return availableModels[0].name;
    }
    return '3 Flash';
  }, [pcbSettings.selectedModel, storeLastUsedModel, availableModels]);

  // Sync ERC on Graph Changes
  const updateGraph = useCallback(
    (newGraph: PCBGraph, recordHistory = true) => {
      const validated = { ...newGraph, ercReport: runElectricalRulesCheck(newGraph) };
      if (recordHistory) {
        setHistory((prev) => [...prev.slice(0, historyIndex + 1), graph]);
        setHistoryIndex((prev) => prev + 1);
      }
      setGraph(validated);
    },
    [graph, historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex >= 0 && history[historyIndex]) {
      const prev = history[historyIndex];
      setGraph(prev);
      setHistoryIndex((i) => i - 1);
      triggerToast?.('Reverted last edit');
    }
  }, [history, historyIndex, triggerToast]);

  const handleRedo = useCallback(() => {
    if (historyIndex + 1 < history.length) {
      const next = history[historyIndex + 1];
      setGraph(next);
      setHistoryIndex((i) => i + 1);
      triggerToast?.('Redone edit');
    }
  }, [history, historyIndex, triggerToast]);

  // Hardware AI Command Execution
  const runAiCommand = async (promptText: string) => {
    if (!promptText.trim() || isAiThinking) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiThinking(true);
    setIsAgentLogOpen(true);

    try {
      const effectiveSettings = { ...pcbSettings, selectedModel: resolvedModelName };
      const result = await processHardwarePrompt(promptText, graph, effectiveSettings, ipc);

      if (result.graph) {
        updateGraph(result.graph);
        triggerToast?.('PCB synthesized & ERC verified');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'agent',
          text: result.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionDiff: result.actionDiff,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'agent',
          text: `Error synthesizing hardware instruction: ${err?.message || 'Unknown error'}. Please retry.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Canvas Container Ref
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);

  // Precision Mouse Wheel Handler:
  // - Simple mouse scroll => X-axis scroll (pan.x -= deltaY)
  // - Shift + mouse scroll => Y-axis scroll (pan.y -= deltaY)
  // - Ctrl/Cmd + mouse scroll => Precision cursor-anchored zoom in / zoom out
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Ctrl + Mouse Wheel = Precision Cursor-Anchored Zoom
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setZoom((prevZoom) => {
          const nextZoom = Math.max(0.05, Math.min(3.5, prevZoom * zoomFactor));
          setPan((prevPan) => ({
            x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
            y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
          }));
          return nextZoom;
        });
      } else if (e.shiftKey) {
        // Shift + Mouse Wheel = Y-axis scroll
        const dy = e.deltaY || e.deltaX;
        setPan((prev) => ({
          ...prev,
          y: prev.y - dy,
        }));
      } else {
        // Simple Mouse Wheel = X-axis scroll (and deltaX if trackpad 2-finger scroll)
        const dx = e.deltaY || e.deltaX;
        setPan((prev) => ({
          x: prev.x - dx,
          y: prev.y - (e.deltaX ? e.deltaY : 0),
        }));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input / textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setShowShortcutsModal((prev) => !prev);
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitToScreen();
      } else if (e.key === '=' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom((z) => Math.min(3.5, z * 1.2));
      } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom((z) => Math.max(0.05, z * 0.8));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
      } else if (e.key === 'Escape') {
        setFocusedBoard(null);
        setShowShortcutsModal(false);
        setShowExportModal(false);
        setShowAddCompModal(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed, handleUndo, handleRedo]);

  // Fit View / Center all boards
  const fitToScreen = useCallback(() => {
    setZoom(0.65);
    setPan({ x: 60, y: 60 });
    setFocusedBoard(null);
    triggerToast?.('Fitted canvas to view');
  }, [triggerToast]);

  // Focus specific board
  const handleFocusBoard = (boardId: BoardViewId) => {
    if (focusedBoard === boardId) {
      setFocusedBoard(null);
    } else {
      setFocusedBoard(boardId);
      setZoom(0.95);
      setPan({ x: 40, y: 40 });
    }
  };

  // Canvas Mouse Drag Panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan on middle click, hand tool, or space+drag or direct canvas background click
    const isTargetCanvasBg =
      (e.target as HTMLElement)?.dataset?.canvasBackground === 'true' ||
      (e.target as HTMLElement) === canvasViewportRef.current;

    if (e.button === 1 || activeTool === 'hand' || spacePressed || isTargetCanvasBg) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  // Generated Export Code
  const exportPayload = useMemo(() => {
    switch (exportFormat) {
      case 'kicad':
        return exportToKiCad(graph).schematic;
      case 'altium':
        return exportToAltiumNetlist(graph);
      case 'skidl':
        return exportToSKiDL(graph);
      case 'easyeda':
        return exportToEasyEDA(graph);
      case 'bom':
        return exportToBOM(graph);
      case 'json':
        return JSON.stringify(graph, null, 2);
    }
  }, [graph, exportFormat]);

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportPayload);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
    triggerToast?.(`Copied ${exportFormat.toUpperCase()} to clipboard`);
  };

  const handleDownloadExport = () => {
    const filenameMap: Record<ExportFormat, string> = {
      kicad: `${graph.metadata.projectId}.kicad_sch`,
      altium: `${graph.metadata.projectId}.net`,
      skidl: `design_${graph.metadata.projectId}.py`,
      easyeda: `${graph.metadata.projectId}_easyeda.json`,
      bom: `BOM_${graph.metadata.projectId}.csv`,
      json: `${graph.metadata.projectId}_graph.json`,
    };
    const blob = new Blob([exportPayload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filenameMap[exportFormat];
    link.click();
    URL.revokeObjectURL(url);
    triggerToast?.(`Downloaded ${filenameMap[exportFormat]}`);
  };

  const ercErrors = graph.ercReport.filter((r) => r.severity === 'error');
  const ercWarnings = graph.ercReport.filter((r) => r.severity === 'warning');

  // Selected Component Details
  const selectedComp = useMemo(() => {
    return graph.components.find((c) => c.id === selectedCompId) || null;
  }, [graph.components, selectedCompId]);

  // Selected Net Details
  const selectedNet = useMemo(() => {
    return graph.nets.find((n) => n.id === selectedNetId) || null;
  }, [graph.nets, selectedNetId]);

  // Boards list
  const boardsList = useMemo(() => {
    return [
      { id: 'schematic' as const, title: 'Schematic & Chips', subtitle: `${graph.components.length} components • ${graph.nets.length} nets`, icon: Cpu },
      { id: 'layout' as const, title: 'PCB Layout & Copper Traces', subtitle: '2-Layer FR-4 • Top/Bottom Cu & Silkscreen', icon: Layers },
      { id: '3d' as const, title: '3D Board Preview', subtitle: 'Physical Solder Mask & SMD Packages', icon: Box },
      { id: 'power' as const, title: 'Power Tree & Rails Budget', subtitle: `${graph.powerRails.length} Regulated Rails`, icon: Zap },
      { id: 'bom' as const, title: 'BOM & SMT Sourcing', subtitle: 'JLCPCB / LCSC SMT Automated CPL', icon: Database },
      { id: 'erc' as const, title: 'ERC Validation & DRC Audit', subtitle: ercErrors.length === 0 ? 'Passed (0 Errors)' : `${ercErrors.length} Violations`, icon: CheckCircle2 },
      { id: 'exporter' as const, title: 'Lossless ECAD Code', subtitle: 'KiCad 8/9, Altium, SKiDL, EasyEDA Pro', icon: FileCode },
    ];
  }, [graph, ercErrors]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] text-brand-textMain overflow-hidden select-none relative font-sans">
      {/* ── Dynamic Dotted Canvas Viewport ── */}
      <div
        ref={canvasViewportRef}
        data-canvas-background="true"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        className={`flex-1 w-full h-full relative overflow-hidden ${
          activeTool === 'hand' || spacePressed
            ? 'cursor-grab active:cursor-grabbing'
            : isDraggingCanvas
            ? 'cursor-grabbing'
            : 'cursor-default'
        }`}
        style={{
          backgroundColor: '#0b0f15',
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1.25px, transparent 1.25px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Transformable Canvas Content Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute top-0 left-0 transition-transform duration-75 will-change-transform"
        >
          {/* Multi-Board Canvas Strip / Grid */}
          <div className="flex items-start gap-8 p-12 min-w-max">
            {/* ── BOARD 1: Schematic & Chips ── */}
            {(!focusedBoard || focusedBoard === 'schematic') && visibleBoards.schematic && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'schematic'
                    ? 'w-[1400px] h-[850px] border-emerald-500/50 shadow-emerald-500/10'
                    : 'w-[820px] h-[640px] border-white/10 hover:border-emerald-500/40'
                }`}
              >
                {/* Board Header Bar */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">Schematic &amp; Chips</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        {graph.components.length} components • {graph.nets.length} nets
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('schematic')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'schematic' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'schematic' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Board Content */}
                <div className="flex-1 overflow-hidden relative rounded-b-2xl">
                  <ECADSchematicCanvas
                    graph={graph}
                    selectedCompId={selectedCompId}
                    selectedNetId={selectedNetId}
                    onSelectComponent={(id) => {
                      setSelectedCompId(id);
                      setSelectedNetId(null);
                    }}
                    onSelectNet={(id) => {
                      setSelectedNetId(id);
                      setSelectedCompId(null);
                    }}
                    onUpdateGraph={updateGraph}
                  />
                </div>
              </div>
            )}

            {/* ── BOARD 2: PCB 2D Layout & Copper Traces ── */}
            {(!focusedBoard || focusedBoard === 'layout') && visibleBoards.layout && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'layout'
                    ? 'w-[1400px] h-[850px] border-emerald-500/50 shadow-emerald-500/10'
                    : 'w-[780px] h-[640px] border-white/10 hover:border-emerald-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">PCB Layout &amp; Copper Traces</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        Top/Bottom Cu • Pads • Ratsnest
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('layout')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'layout' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'layout' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden relative rounded-b-2xl">
                  <PCBLayoutCanvas
                    graph={graph}
                    selectedCompId={selectedCompId}
                    selectedNetId={selectedNetId}
                    onSelectComponent={(id) => {
                      setSelectedCompId(id);
                      setSelectedNetId(null);
                    }}
                    onSelectNet={(id) => {
                      setSelectedNetId(id);
                      setSelectedCompId(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── BOARD 3: 3D Physical Board Preview ── */}
            {(!focusedBoard || focusedBoard === '3d') && visibleBoards['3d'] && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === '3d'
                    ? 'w-[1400px] h-[850px] border-emerald-500/50 shadow-emerald-500/10'
                    : 'w-[780px] h-[640px] border-white/10 hover:border-emerald-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Box className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">3D Board Preview</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        FR-4 Solder Mask • ENIG Pads • SMD 3D
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('3d')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === '3d' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === '3d' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden relative rounded-b-2xl">
                  <PCB3DPreview
                    graph={graph}
                    selectedCompId={selectedCompId}
                    onSelectComponent={(id) => {
                      setSelectedCompId(id);
                      setSelectedNetId(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── BOARD 4: Power Tree & Rails Budget ── */}
            {(!focusedBoard || focusedBoard === 'power') && visibleBoards.power && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'power'
                    ? 'w-[1200px] h-[800px] border-amber-500/50 shadow-amber-500/10'
                    : 'w-[680px] h-[640px] border-white/10 hover:border-amber-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">Power Tree &amp; Rails Budget</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        {graph.powerRails.length} Regulated Rails
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('power')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'power' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'power' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-5 space-y-4 rounded-b-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {graph.powerRails.map((rail) => (
                      <div key={rail.id} className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-sm text-emerald-400">{rail.id}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono">
                            {rail.voltage}V
                          </span>
                        </div>
                        <div className="text-xs text-brand-textMuted flex items-center justify-between">
                          <span>Max Budget:</span>
                          <span className="font-mono text-brand-textMain font-semibold">{rail.maxCurrent_mA} mA</span>
                        </div>
                        <div className="text-xs text-brand-textMuted flex items-center justify-between">
                          <span>Source Component:</span>
                          <span className="font-mono text-amber-300">{rail.sourceComponentId}.{rail.sourcePinNumber}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── BOARD 5: BOM & SMT Sourcing ── */}
            {(!focusedBoard || focusedBoard === 'bom') && visibleBoards.bom && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'bom'
                    ? 'w-[1300px] h-[800px] border-blue-500/50 shadow-blue-500/10'
                    : 'w-[750px] h-[640px] border-white/10 hover:border-blue-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">BOM &amp; SMT Sourcing</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        {graph.components.length} SMT Components
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('bom')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'bom' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'bom' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 rounded-b-2xl">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-white/10 text-brand-textMuted text-[11px]">
                        <th className="pb-2">Designator</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2">MPN</th>
                        <th className="pb-2">Package</th>
                        <th className="pb-2">LCSC Part #</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {graph.components.map((comp) => (
                        <tr key={comp.id} className="hover:bg-white/[0.03]">
                          <td className="py-2.5 font-bold text-emerald-400">{comp.id}</td>
                          <td className="py-2.5 font-sans text-brand-textMain font-medium">{comp.name}</td>
                          <td className="py-2.5 text-brand-textMuted">{comp.mpn}</td>
                          <td className="py-2.5 text-amber-300">{comp.package}</td>
                          <td className="py-2.5 text-blue-400">{comp.lcscPart || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── BOARD 6: ERC Validation & DRC Audit ── */}
            {(!focusedBoard || focusedBoard === 'erc') && visibleBoards.erc && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'erc'
                    ? 'w-[1200px] h-[800px] border-emerald-500/50 shadow-emerald-500/10'
                    : 'w-[680px] h-[640px] border-white/10 hover:border-emerald-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">ERC Validation &amp; DRC Audit</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        {ercErrors.length === 0 ? 'Passed (0 Errors)' : `${ercErrors.length} Violations`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('erc')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'erc' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'erc' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-5 space-y-3 rounded-b-2xl">
                  {graph.ercReport.length === 0 ? (
                    <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center text-xs text-emerald-300">
                      ✅ 0 ERC Errors &amp; 0 Warnings. Circuit passes all electrical and pinmux rules checks.
                    </div>
                  ) : (
                    graph.ercReport.map((erc) => (
                      <div
                        key={erc.id}
                        className={`p-3.5 rounded-xl border ${
                          erc.severity === 'error'
                            ? 'border-rose-500/40 bg-rose-500/10'
                            : 'border-amber-500/40 bg-amber-500/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-bold mb-1">
                          {erc.severity === 'error' ? (
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                          ) : (
                            <Info className="w-4 h-4 text-amber-400" />
                          )}
                          <span className={erc.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>
                            {erc.title}
                          </span>
                        </div>
                        <p className="text-xs text-brand-textMuted mb-2">{erc.message}</p>
                        {erc.suggestedFix && (
                          <div className="text-[11px] font-mono text-emerald-400 bg-black/40 p-2 rounded">
                            💡 Suggestion: {erc.suggestedFix}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── BOARD 7: Lossless ECAD Code Exporter ── */}
            {(!focusedBoard || focusedBoard === 'exporter') && visibleBoards.exporter && (
              <div
                className={`flex flex-col bg-[#161b22]/95 border rounded-2xl shadow-2xl backdrop-blur-xl transition-all ${
                  focusedBoard === 'exporter'
                    ? 'w-[1300px] h-[800px] border-purple-500/50 shadow-purple-500/10'
                    : 'w-[750px] h-[640px] border-white/10 hover:border-purple-500/40'
                }`}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                      <FileCode className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white">Lossless ECAD Code Exporter</span>
                      <span className="text-[10px] text-brand-textMuted ml-2 font-mono">
                        KiCad 8/9 • Altium • SKiDL • EasyEDA
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFocusBoard('exporter')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                      title={focusedBoard === 'exporter' ? 'Exit Focus View' : 'Focus Board'}
                    >
                      {focusedBoard === 'exporter' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Exporter Formats Switcher */}
                <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-black/30 text-xs">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {(
                      [
                        { id: 'kicad', label: 'KiCad 8/9' },
                        { id: 'altium', label: 'Altium' },
                        { id: 'skidl', label: 'SKiDL Python' },
                        { id: 'easyeda', label: 'EasyEDA Pro' },
                        { id: 'bom', label: 'BOM CSV' },
                        { id: 'json', label: 'Graph JSON' },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        onClick={() => setExportFormat(fmt.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                          exportFormat === fmt.id
                            ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                            : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopyExport}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-white border border-white/10 transition-colors cursor-pointer"
                    >
                      {copiedExport ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedExport ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={handleDownloadExport}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white font-semibold transition-colors cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 bg-black/60 font-mono text-xs text-brand-textMain/90 rounded-b-2xl">
                  <pre className="whitespace-pre-wrap">{exportPayload}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating Top Header Bar (Inspired by reference screenshot) ── */}
      <div className="absolute top-3 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        {/* Left: Project Title & Navigation */}
        <div className="flex items-center gap-2 pointer-events-auto bg-[#161b22]/90 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 shadow-xl">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
              title="Return to Main App"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-white tracking-tight">
              Remix of {graph.metadata.name}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30">
              {graph.metadata.revision}
            </span>
          </div>

          {/* Quick Template Picker */}
          <div className="h-4 w-px bg-white/10 mx-1" />
          <select
            onChange={(e) => {
              const tmpl = STARTER_TEMPLATES.find((t) => t.id === e.target.value);
              if (tmpl) {
                const nextGraph = JSON.parse(JSON.stringify(tmpl.graph));
                updateGraph(nextGraph);
                triggerToast?.(`Loaded ${tmpl.name}`);
              }
            }}
            className="bg-black/40 border border-white/10 text-brand-textMuted text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {STARTER_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Actions (Export, Share, Settings) */}
        <div className="flex items-center gap-2 pointer-events-auto bg-[#161b22]/90 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 shadow-xl">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(graph, null, 2));
              triggerToast?.('Project JSON copied to clipboard');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 text-xs font-medium transition-colors cursor-pointer"
            title="Share or Copy Project JSON"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 transition-colors cursor-pointer"
            title="Settings & Model"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* ── Floating Right Tool Palette (Inspired by reference screenshot) ── */}
      <div className="absolute right-4 top-20 z-40 flex flex-col gap-1.5 bg-[#161b22]/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-2xl">
        <button
          onClick={() => setActiveTool('select')}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            activeTool === 'select'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
          title="Select Tool (V)"
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('hand')}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            activeTool === 'hand'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
          title="Hand / Pan Tool (H / Space+Drag)"
        >
          <Hand className="w-4 h-4" />
        </button>

        <button
          onClick={fitToScreen}
          className="p-2 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Fit All Boards to View (Ctrl + 0)"
        >
          <Compass className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowAddCompModal(true)}
          className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          title="Add Component (+)"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            showMinimap
              ? 'bg-white/20 text-white'
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
          title="Toggle Canvas Minimap"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowShortcutsModal(true)}
          className="p-2 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Keyboard Shortcuts & Gestures (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* ── Collapsible Minimap ── */}
      {showMinimap && (
        <div className="absolute left-4 bottom-24 z-40 bg-[#161b22]/95 border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md w-56">
          <div className="flex items-center justify-between text-[11px] font-bold text-white mb-2">
            <span>Canvas Minimap</span>
            <button
              onClick={() => setShowMinimap(false)}
              className="text-brand-textMuted hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-brand-textMuted">
            {boardsList.map((b) => (
              <button
                key={b.id}
                onClick={() => handleFocusBoard(b.id)}
                className={`p-1.5 rounded text-left border transition-colors cursor-pointer truncate ${
                  focusedBoard === b.id
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-black/30 border-white/10 hover:bg-white/5'
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Floating Bottom AI Prompt / Co-Pilot Command Deck (Inspired by reference screenshot) ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col bg-[#161b22]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
          {/* Expandable Agent Log / Chat Diff Drawer */}
          {isAgentLogOpen && (
            <div className="p-3 border-b border-white/10 max-h-56 overflow-y-auto space-y-2 text-xs bg-black/40">
              <div className="flex items-center justify-between text-[11px] font-bold text-brand-textMuted pb-1 border-b border-white/5">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Hardware Co-Pilot Activity Log
                </span>
                <button
                  onClick={() => setIsAgentLogOpen(false)}
                  className="text-brand-textMuted hover:text-white cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2.5 rounded-xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-200'
                      : 'bg-black/30 border border-white/10 text-brand-textMain/90'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.actionDiff && (
                    <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] font-mono space-y-0.5">
                      {msg.actionDiff.addedComponents && (
                        <div className="text-emerald-400">+ Added: {msg.actionDiff.addedComponents.join(', ')}</div>
                      )}
                      {msg.actionDiff.modifiedNets && (
                        <div className="text-amber-300">~ Modified: {msg.actionDiff.modifiedNets.join(', ')}</div>
                      )}
                    </div>
                  )}
                  {msg.sender === 'agent' && (
                    <div className="mt-1.5 flex items-center justify-between text-[9px] text-brand-textMuted">
                      <span>{msg.timestamp}</span>
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="flex items-center gap-1 hover:text-white cursor-pointer"
                      >
                        {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {isAiThinking && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 p-2 bg-emerald-500/10 rounded-lg animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing PCB pinmux &amp; circuit topology diff...</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Hardware Synthesis Action Chips */}
          <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-black/20 text-[10px]">
            <button
              onClick={() => runAiCommand('Synthesize a regulated power supply circuit with input protection, filtering, and power rail outputs')}
              className="px-2 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 shrink-0 cursor-pointer font-medium"
            >
              ⚡ Power Supply
            </button>
            <button
              onClick={() => runAiCommand('Synthesize an STM32 MCU subsystem with crystal oscillator, decoupling caps, reset button, and SWD header')}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 shrink-0 cursor-pointer"
            >
              🧠 STM32 MCU
            </button>
            <button
              onClick={() => runAiCommand('Synthesize an IoT sensor node circuit with environmental sensing, I2C bus, and status LEDs')}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 shrink-0 cursor-pointer"
            >
              📡 IoT Sensor Node
            </button>
            <button
              onClick={() => runAiCommand('Analyze all Electrical Rules Check violations in this circuit and synthesize missing pullups, decoupling caps, and pin connections to fix them')}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 shrink-0 cursor-pointer"
            >
              🛡️ Auto-Fix ERC
            </button>
          </div>

          {/* Prompt Bar Input Deck */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAiCommand(chatInput);
            }}
            className="px-3 py-2 flex items-center gap-2"
          >
            {/* Toggle Agent Log Button */}
            <button
              type="button"
              onClick={() => setIsAgentLogOpen(!isAgentLogOpen)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer shrink-0"
              title="Toggle Agent Activity Log"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </button>

            {/* Input */}
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="What would you like to change or create?"
              className="flex-1 bg-transparent text-xs text-white placeholder:text-brand-textMuted/60 focus:outline-none"
            />

            {/* Model Selector Pill */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] font-mono text-emerald-400 hover:bg-white/5 cursor-pointer shrink-0"
              title="Change Connected Model"
            >
              <span className="max-w-[80px] truncate">{resolvedModelName}</span>
              <ChevronDown className="w-3 h-3 text-emerald-400" />
            </button>

            {/* Submit Arrow */}
            <button
              type="submit"
              disabled={!chatInput.trim() || isAiThinking}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-all cursor-pointer shrink-0"
              title="Submit prompt"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* ── Floating Bottom-Right Zoom HUD & Navigation Dock (Inspired by reference screenshot) ── */}
      <div className="absolute right-4 bottom-4 z-40 flex items-center gap-1.5 bg-[#161b22]/90 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1 shadow-2xl">
        <button
          onClick={handleUndo}
          disabled={historyIndex < 0}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleRedo}
          disabled={historyIndex + 1 >= history.length}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors cursor-pointer"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* Zoom Percentage Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>{Math.round(zoom * 100)}%</span>
            <ChevronDown className="w-3 h-3 text-brand-textMuted" />
          </button>

          {showZoomMenu && (
            <div className="absolute bottom-8 right-0 bg-[#161b22] border border-white/10 rounded-xl p-1 shadow-2xl w-28 text-xs font-mono space-y-0.5 z-50">
              {[0.25, 0.5, 0.75, 1.0, 1.5, 2.0].map((zVal) => (
                <button
                  key={zVal}
                  onClick={() => {
                    setZoom(zVal);
                    setShowZoomMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                    Math.round(zoom * 100) === Math.round(zVal * 100)
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {Math.round(zVal * 100)}%
                </button>
              ))}
              <div className="h-px bg-white/10 my-0.5" />
              <button
                onClick={() => {
                  fitToScreen();
                  setShowZoomMenu(false);
                }}
                className="w-full text-left px-2.5 py-1 rounded-lg text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
              >
                Fit Screen
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setZoom((z) => Math.max(0.05, z * 0.8))}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Zoom Out (Ctrl + -)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Zoom In (Ctrl + +)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        <button
          onClick={() => setShowShortcutsModal(true)}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Keyboard Shortcuts & Gestures (?)"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Modal: Keyboard Shortcuts & Gesture Cheat Sheet ── */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl p-5 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">Canvas Shortcuts &amp; Gestures</span>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-brand-textMuted hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Simple Mouse Scroll</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  X-Axis Horizontal Scroll
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Shift + Mouse Scroll</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  Y-Axis Vertical Scroll
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Ctrl + Mouse Scroll</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  Cursor-Anchored Zoom In / Out
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Space + Drag or Hand Tool</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  2D Free Pan
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Fit All Boards</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  Ctrl + 0
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                <span className="text-brand-textMuted">Undo / Redo</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-300">
                  Ctrl + Z / Ctrl + Y
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Lossless ECAD Export Dialog ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">Lossless ECAD &amp; Netlist Export</span>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded text-brand-textMuted hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target Formats Selector */}
            <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 bg-black/30 overflow-x-auto text-xs">
              {(
                [
                  { id: 'kicad', label: 'KiCad 8/9 (.kicad_sch)' },
                  { id: 'altium', label: 'Altium Netlist (.NET)' },
                  { id: 'skidl', label: 'SKiDL Python' },
                  { id: 'easyeda', label: 'EasyEDA Pro JSON' },
                  { id: 'bom', label: 'BOM / CPL (CSV)' },
                  { id: 'json', label: 'Canonical PCBGraph JSON' },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setExportFormat(fmt.id)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                    exportFormat === fmt.id
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                      : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>

            {/* Export Code Preview */}
            <div className="flex-1 overflow-auto p-4 bg-black/60 font-mono text-xs text-brand-textMain/90 leading-relaxed max-h-96">
              <pre className="whitespace-pre-wrap">{exportPayload}</pre>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between bg-[#161b22]">
              <span className="text-[11px] text-brand-textMuted font-mono">
                {graph.components.length} components • {graph.nets.length} nets • {graph.powerRails.length} power rails
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  {copiedExport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedExport ? 'Copied!' : 'Copy Code'}</span>
                </button>
                <button
                  onClick={handleDownloadExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Component ── */}
      {showAddCompModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-sm text-white">Add New Component</span>
              <button
                onClick={() => setShowAddCompModal(false)}
                className="p-1 rounded text-brand-textMuted hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Category</label>
                <select
                  value={newCompCategory}
                  onChange={(e) => setNewCompCategory(e.target.value as any)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none"
                >
                  <option value="Sensor">Sensor</option>
                  <option value="MCU">Microcontroller (MCU)</option>
                  <option value="Power">Power / PMIC / LDO</option>
                  <option value="Interface">Interface / Driver</option>
                  <option value="Passive">Passive (R / C / L)</option>
                  <option value="Discrete">Discrete / Diode / Transistor</option>
                  <option value="Connector">Connector</option>
                </select>
              </div>

              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Friendly Name</label>
                <input
                  type="text"
                  placeholder="e.g. BME280 Environmental Sensor"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Manufacturer Part # (MPN)</label>
                <input
                  type="text"
                  placeholder="e.g. BME280"
                  value={newCompMpn}
                  onChange={(e) => setNewCompMpn(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Package Footprint</label>
                <input
                  type="text"
                  placeholder="e.g. LGA-8 / 0402"
                  value={newCompPkg}
                  onChange={(e) => setNewCompPkg(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAddCompModal(false)}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-brand-textMuted hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newCompName.trim()) return;
                  const g = JSON.parse(JSON.stringify(graph)) as PCBGraph;
                  const newId = `U${g.components.length + 1}`;
                  g.components.push({
                    id: newId,
                    name: newCompName,
                    mpn: newCompMpn || newCompName,
                    manufacturer: 'Generic',
                    package: newCompPkg || 'Standard',
                    category: newCompCategory,
                    description: `${newCompCategory} module`,
                    pins: [
                      { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
                      { number: '2', name: 'VCC', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
                    ],
                  });
                  updateGraph(g);
                  setShowAddCompModal(false);
                  setNewCompName('');
                  setNewCompMpn('');
                  triggerToast?.(`Added component ${newId}`);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm"
              >
                Add to Canvas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: PCB Workspace Settings ── */}
      <PCBSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={{ ...pcbSettings, selectedModel: resolvedModelName }}
        onSaveSettings={(newSettings) => {
          setPcbSettings(newSettings);
          triggerToast?.(`Model updated to ${newSettings.selectedModel}`);
        }}
      />
    </div>
  );
};
