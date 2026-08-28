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

  // Glass Type View Selector Dropdown
  const [showViewSelect, setShowViewSelect] = useState<boolean>(false);

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

  const currentActiveBoard = useMemo(() => {
    return boardsList.find((b) => b.id === (focusedBoard ?? 'schematic')) || boardsList[0];
  }, [boardsList, focusedBoard]);

  const CurrentActiveIcon = currentActiveBoard.icon;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] text-brand-textMain overflow-hidden select-none relative font-sans">

      {/* ── 3 Top Floating Glass Panels (Left, Center, Right) ── */}
      <div className="absolute top-3.5 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        {/* 1. Left Floating Glass Card: Back + Project Title + Template Picker */}
        <div className="pointer-events-auto flex items-center gap-2 bg-[#161b22]/80 backdrop-blur-2xl border border-white/15 rounded-2xl px-3.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all hover:border-white/25">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer shrink-0"
              title="Return to Main App"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
          )}
          <span className="font-semibold text-xs text-white tracking-tight truncate max-w-[140px]">
            {graph.metadata.name}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30 shrink-0 font-semibold">
            {graph.metadata.revision}
          </span>
          <div className="h-4 w-px bg-white/10 mx-0.5 shrink-0" />
          <select
            onChange={(e) => {
              const tmpl = STARTER_TEMPLATES.find((t) => t.id === e.target.value);
              if (tmpl) {
                const nextGraph = JSON.parse(JSON.stringify(tmpl.graph));
                updateGraph(nextGraph);
                triggerToast?.(`Loaded ${tmpl.name}`);
              }
            }}
            className="bg-black/40 border border-white/10 text-brand-textMuted text-[11px] rounded-xl px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer shrink-0"
          >
            {STARTER_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Center Floating Glass Card: Glass Type View Selector */}
        <div className="pointer-events-auto relative">
          <button
            onClick={() => setShowViewSelect((prev) => !prev)}
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-2xl bg-[#161b22]/80 backdrop-blur-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all text-white cursor-pointer group hover:border-emerald-500/40"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <CurrentActiveIcon className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-white">
              {currentActiveBoard.title}
            </span>
            {currentActiveBoard.id === 'erc' && ercErrors.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 text-[9px] font-bold border border-rose-500/30">
                {ercErrors.length}
              </span>
            ) : null}
            <ChevronDown className={`w-3.5 h-3.5 text-brand-textMuted group-hover:text-white transition-transform duration-200 ${showViewSelect ? 'rotate-180 text-emerald-400' : ''}`} />
          </button>

          {showViewSelect && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowViewSelect(false)}
              />

              {/* Glass Dropdown Menu */}
              <div className="absolute top-full mt-2.5 left-1/2 -translate-x-1/2 w-80 bg-[#161b22]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-1.5 shadow-2xl z-50 flex flex-col gap-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-textMuted/70 border-b border-white/[0.06] mb-0.5">
                  Workspace Views
                </div>
                {boardsList.map((b) => {
                  const Icon = b.icon;
                  const isSelected = (focusedBoard ?? 'schematic') === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setFocusedBoard(b.id as BoardViewId);
                        setShowViewSelect(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-white'
                          : 'hover:bg-white/[0.06] text-brand-textMuted hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-brand-textMuted border border-white/10'
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <div className={`text-xs font-semibold ${isSelected ? 'text-emerald-300' : 'text-white'}`}>
                            {b.title}
                          </div>
                          <div className="text-[10px] text-brand-textMuted font-mono truncate">
                            {b.subtitle}
                          </div>
                        </div>
                      </div>
                      {b.id === 'erc' && ercErrors.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[9px] font-bold border border-rose-500/30 shrink-0 ml-1">
                          {ercErrors.length}
                        </span>
                      ) : isSelected ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 3. Right Floating Glass Card: Undo/Redo + Export + Share + Settings */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-[#161b22]/80 backdrop-blur-2xl border border-white/15 rounded-2xl px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all hover:border-white/25">
          <button onClick={handleUndo} disabled={historyIndex < 0}
            className="p-1.5 rounded-xl text-brand-textMuted hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors cursor-pointer" title="Undo (Ctrl+Z)">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleRedo} disabled={historyIndex + 1 >= history.length}
            className="p-1.5 rounded-xl text-brand-textMuted hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors cursor-pointer" title="Redo (Ctrl+Y)">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-white/10 mx-0.5" />
          <button onClick={() => setShowAddCompModal(true)}
            className="p-1.5 rounded-xl text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer" title="Add Component">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(JSON.stringify(graph, null, 2)); triggerToast?.('Project JSON copied'); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 text-xs font-medium transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white border border-white/10 transition-colors cursor-pointer" title="Settings">
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* ── Tab Panel Content ── */}
      <div className="flex-1 overflow-hidden relative">

        {/* SCHEMATIC TAB */}
        {(focusedBoard ?? 'schematic') === 'schematic' && (
          <div className="absolute inset-0 flex flex-col">
            <ECADSchematicCanvas
              graph={graph}
              selectedCompId={selectedCompId}
              selectedNetId={selectedNetId}
              onSelectComponent={(id) => { setSelectedCompId(id); setSelectedNetId(null); }}
              onSelectNet={(id) => { setSelectedNetId(id); setSelectedCompId(null); }}
              onUpdateGraph={updateGraph}
            />
          </div>
        )}

        {/* PCB LAYOUT TAB */}
        {focusedBoard === 'layout' && (
          <div className="absolute inset-0 flex flex-col">
            <PCBLayoutCanvas
              graph={graph}
              selectedCompId={selectedCompId}
              selectedNetId={selectedNetId}
              onSelectComponent={(id) => { setSelectedCompId(id); setSelectedNetId(null); }}
              onSelectNet={(id) => { setSelectedNetId(id); setSelectedCompId(null); }}
            />
          </div>
        )}

        {/* 3D PREVIEW TAB */}
        {focusedBoard === '3d' && (
          <div className="absolute inset-0 flex flex-col">
            <PCB3DPreview
              graph={graph}
              selectedCompId={selectedCompId}
              onSelectComponent={(id) => { setSelectedCompId(id); setSelectedNetId(null); }}
            />
          </div>
        )}

        {/* POWER TREE TAB */}
        {focusedBoard === 'power' && (
          <div className="absolute inset-0 flex flex-col overflow-auto pt-16 p-6 gap-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-sm text-white">Power Tree & Rails Budget</span>
              <span className="text-[11px] text-brand-textMuted font-mono ml-1">{graph.powerRails.length} Regulated Rails</span>
            </div>
            {graph.powerRails.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-brand-textMuted text-xs space-y-2">
                  <Zap className="w-8 h-8 mx-auto opacity-20" />
                  <p>No power rails in current design.<br />Synthesize a circuit with a power supply to see the rail budget.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {graph.powerRails.map((rail) => (
                  <div key={rail.id} className="p-4 rounded-xl border border-white/10 bg-[#161b22] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-emerald-400">{rail.id}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono border border-amber-500/20">
                        {rail.voltage}V
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-brand-textMuted">
                      <div className="flex items-center justify-between">
                        <span>Max Budget</span>
                        <span className="font-mono text-brand-textMain font-semibold">{rail.maxCurrent_mA} mA</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Source</span>
                        <span className="font-mono text-amber-300">{rail.sourceComponentId}.{rail.sourcePinNumber}</span>
                      </div>
                    </div>
                    {/* Mini current bar */}
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500"
                        style={{ width: `${Math.min(100, (rail.maxCurrent_mA / 2000) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOM & SMT TAB */}
        {focusedBoard === 'bom' && (
          <div className="absolute inset-0 flex flex-col overflow-hidden pt-16">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between bg-[#161b22]/60 shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm text-white">BOM & SMT Sourcing</span>
                <span className="text-[11px] text-brand-textMuted font-mono ml-1">{graph.components.length} components</span>
              </div>
              <button
                onClick={() => { const csv = exportToBOM(graph); const b = new Blob([csv], {type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${graph.metadata.name}_BOM.csv`; a.click(); }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Download CSV</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {graph.components.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-brand-textMuted text-xs space-y-2">
                    <Database className="w-8 h-8 mx-auto opacity-20" />
                    <p>No components yet.<br />Synthesize a circuit to populate the BOM.</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-brand-textMuted text-[11px] sticky top-0 bg-[#0d1117]">
                      <th className="pb-2.5 pr-4 font-semibold">Ref</th>
                      <th className="pb-2.5 pr-4 font-semibold">Name</th>
                      <th className="pb-2.5 pr-4 font-semibold">MPN</th>
                      <th className="pb-2.5 pr-4 font-semibold">Package</th>
                      <th className="pb-2.5 pr-4 font-semibold">Value</th>
                      <th className="pb-2.5 font-semibold">LCSC #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {graph.components.map((comp) => (
                      <tr key={comp.id}
                        onClick={() => { setSelectedCompId(comp.id); setSelectedNetId(null); }}
                        className={`cursor-pointer transition-colors ${selectedCompId === comp.id ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}`}
                      >
                        <td className="py-2.5 pr-4 font-bold text-emerald-400">{comp.id}</td>
                        <td className="py-2.5 pr-4 font-sans text-brand-textMain">{comp.name}</td>
                        <td className="py-2.5 pr-4 text-brand-textMuted">{comp.mpn}</td>
                        <td className="py-2.5 pr-4 text-amber-300">{comp.package}</td>
                        <td className="py-2.5 pr-4 text-brand-textMuted">{comp.value || '—'}</td>
                        <td className="py-2.5 text-blue-400">{comp.lcscPart || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ERC TAB */}
        {focusedBoard === 'erc' && (
          <div className="absolute inset-0 flex flex-col overflow-hidden pt-16">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between bg-[#161b22]/60 shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${ercErrors.length === 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="font-bold text-sm text-white">ERC Validation & DRC Audit</span>
                <span className={`text-[11px] font-mono ml-1 ${ercErrors.length === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ercErrors.length === 0 ? '✅ Passed (0 Errors)' : `⚠ ${ercErrors.length} Violations`}
                </span>
              </div>
              <button
                onClick={() => runAiCommand('Analyze all Electrical Rules Check violations in this circuit and synthesize missing pullups, decoupling caps, and pin connections to fix them')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Auto-Fix with AI</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-3">
              {graph.ercReport.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="p-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-center text-sm text-emerald-300 space-y-1">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    <p className="font-semibold">All Clear!</p>
                    <p className="text-xs text-emerald-400/70">0 ERC errors · 0 warnings · Passes all electrical and pinmux rules.</p>
                  </div>
                </div>
              ) : (
                graph.ercReport.map((erc) => (
                  <div
                    key={erc.id}
                    className={`p-4 rounded-xl border ${
                      erc.severity === 'error'
                        ? 'border-rose-500/40 bg-rose-500/[0.07]'
                        : 'border-amber-500/40 bg-amber-500/[0.07]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold mb-1.5">
                      {erc.severity === 'error'
                        ? <AlertTriangle className="w-4 h-4 text-rose-400" />
                        : <Info className="w-4 h-4 text-amber-400" />}
                      <span className={erc.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>
                        {erc.title}
                      </span>
                    </div>
                    <p className="text-xs text-brand-textMuted mb-2.5">{erc.message}</p>
                    {erc.suggestedFix && (
                      <div className="text-[11px] font-mono text-emerald-400 bg-black/40 px-3 py-2 rounded-lg">
                        💡 {erc.suggestedFix}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* LOSSLESS ECAD CODE EXPORTER TAB */}
        {focusedBoard === 'exporter' && (
          <div className="absolute inset-0 flex flex-col overflow-hidden pt-16">
            <div className="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between bg-[#161b22]/60 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer shrink-0 ${
                      exportFormat === fmt.id
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <button onClick={handleCopyExport}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-white border border-white/10 transition-colors cursor-pointer">
                  {copiedExport ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedExport ? 'Copied' : 'Copy'}</span>
                </button>
                <button onClick={handleDownloadExport}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white font-semibold transition-colors cursor-pointer">
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-black/60 font-mono text-xs text-brand-textMain/90 leading-relaxed">
              <pre className="whitespace-pre-wrap">{exportPayload}</pre>
            </div>
          </div>
        )}

      </div>




      {/* ── Floating Translucent Glass AI Prompt / Chat Card ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col bg-[#161b22]/80 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-300 hover:border-white/20">

          {/* Expandable / Collapsible Chat History */}
          {isAgentLogOpen && (
            <div className="p-3.5 max-h-72 overflow-y-auto space-y-2.5 text-xs bg-black/40 border-b border-white/10">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2.5 rounded-xl text-xs leading-relaxed transition-all ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-200'
                      : 'bg-white/[0.06] border border-white/10 text-brand-textMain/90'
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
                        className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors"
                      >
                        {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {isAiThinking && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing PCB pinmux &amp; circuit topology diff...</span>
                </div>
              )}
            </div>
          )}

          {/* Prompt Bar Input Deck */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAiCommand(chatInput);
            }}
            className="px-3 py-2.5 flex items-center gap-2"
          >
            {/* Expand / Collapse History Arrow Button */}
            <button
              type="button"
              onClick={() => setIsAgentLogOpen((prev) => !prev)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-all cursor-pointer shrink-0"
              title={isAgentLogOpen ? "Collapse Chat History" : "Expand Chat History"}
            >
              {isAgentLogOpen ? (
                <ChevronDown className="w-4 h-4 text-emerald-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-emerald-400" />
              )}
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
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-[10px] font-mono text-emerald-400 hover:bg-white/5 hover:border-emerald-500/30 cursor-pointer shrink-0 transition-colors"
              title="Change Connected Model"
            >
              <span className="max-w-[80px] truncate">{resolvedModelName}</span>
              <ChevronDown className="w-3 h-3 text-emerald-400" />
            </button>

            {/* Submit Arrow */}
            <button
              type="submit"
              disabled={!chatInput.trim() || isAiThinking}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-all cursor-pointer shrink-0 shadow-md shadow-emerald-900/40"
              title="Submit prompt"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
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
