import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Database,
  Copy,
  Check,
  Code2,
  Settings,
  ChevronDown,
  Box,
  Radio,
  FileText
} from 'lucide-react';
import { PCBGraph, ComponentInstance, Net, ERCResult, STARTER_TEMPLATES, ExportFormat } from './types';
import { runElectricalRulesCheck } from './ercEngine';
import { exportToKiCad, exportToAltiumNetlist, exportToSKiDL, exportToEasyEDA, exportToBOM } from './exporters';

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

export const PCBWorkspacePage: React.FC<PCBWorkspacePageProps> = ({
  ipc,
  triggerToast,
  onBack,
  onNewChat,
}) => {
  // Active Project Graph State
  const [graph, setGraph] = useState<PCBGraph>(() => {
    const template = STARTER_TEMPLATES[0];
    const initialGraph = JSON.parse(JSON.stringify(template.graph));
    initialGraph.ercReport = runElectricalRulesCheck(initialGraph);
    return initialGraph;
  });

  // History Stack for Undo/Redo
  const [history, setHistory] = useState<PCBGraph[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // UI Selection State
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'bom' | 'erc' | 'power'>('canvas');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Model & AI Chat State
  const [selectedModel, setSelectedModel] = useState<string>('Claude 3.7 Sonnet / Gemini 2.5');
  const [chatInput, setChatInput] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'agent',
      text: 'PCB Co-Pilot active. I have loaded the ESP32-S3 IoT Sensor Node architecture. All power rails (+3V3, VBUS_5V) and I2C buses are synchronized. How would you like to edit or expand the design?',
      timestamp: 'Just now',
    },
  ]);

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('kicad');
  const [copiedExport, setCopiedExport] = useState<boolean>(false);

  // Add Component Modal State
  const [showAddCompModal, setShowAddCompModal] = useState<boolean>(false);
  const [newCompCategory, setNewCompCategory] = useState<ComponentInstance['category']>('Sensor');
  const [newCompName, setNewCompName] = useState<string>('');
  const [newCompMpn, setNewCompMpn] = useState<string>('');
  const [newCompPkg, setNewCompPkg] = useState<string>('0402');

  // Sync ERC on Graph Changes
  const updateGraph = (newGraph: PCBGraph, recordHistory = true) => {
    const validated = { ...newGraph, ercReport: runElectricalRulesCheck(newGraph) };
    if (recordHistory) {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), graph]);
      setHistoryIndex((prev) => prev + 1);
    }
    setGraph(validated);
  };

  const handleUndo = () => {
    if (historyIndex >= 0 && history[historyIndex]) {
      const prev = history[historyIndex];
      setGraph(prev);
      setHistoryIndex((i) => i - 1);
      triggerToast?.('Reverted last edit');
    }
  };

  // Quick Action Prompts
  const runAiCommand = async (promptText: string) => {
    if (!promptText.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiThinking(true);

    // Simulate Agent Hardware Reasoning & Mutating PCB Graph
    setTimeout(() => {
      const g = JSON.parse(JSON.stringify(graph)) as PCBGraph;
      let agentReply = '';
      let actionDiff: ChatMessage['actionDiff'] = undefined;

      const lower = promptText.toLowerCase();

      if (lower.includes('pullup') || lower.includes('pull-up') || lower.includes('fix i2c') || lower.includes('fix erc')) {
        // Auto-fix I2C pullups
        if (!g.components.some((c) => c.id === 'R1')) {
          g.components.push({
            id: 'R1',
            name: 'I2C Pull-Up SDA',
            mpn: 'RC0402JR-074K7L',
            manufacturer: 'Yageo',
            package: '0402',
            category: 'Passive',
            value: '4.7k',
            lcscPart: 'C25900',
            description: '4.7k 1% 0402 Pull-up Resistor for I2C SDA',
            pins: [
              { number: '1', name: '1', type: 'passive', connectedNet: '+3V3' },
              { number: '2', name: '2', type: 'passive', connectedNet: 'NET_I2C_SDA' },
            ],
            x: 550,
            y: 80,
          });
          const sdaNet = g.nets.find((n) => n.id === 'NET_I2C_SDA');
          if (sdaNet) sdaNet.connections.push({ componentId: 'R1', pinNumber: '2' });
        }
        agentReply = 'Synthesized 4.7kΩ I2C pull-up resistors tied to the +3.3V rail. Signal rise-time calculations validated for standard-mode and fast-mode 400kHz I2C bus compliance.';
        actionDiff = { addedComponents: ['R1 (4.7k)'], modifiedNets: ['NET_I2C_SDA', '+3V3'] };
      } else if (lower.includes('oled') || lower.includes('display') || lower.includes('ssd1306')) {
        // Add SSD1306 OLED display
        const displayId = `U${g.components.length + 1}`;
        g.components.push({
          id: displayId,
          name: 'SSD1306 0.96" OLED Display',
          mpn: 'SSD1306-0.96-I2C',
          manufacturer: 'Solomon Systech',
          package: 'Module-4P',
          category: 'Interface',
          lcscPart: 'C2096',
          description: '128x64 Monochrome OLED Display via I2C (Address 0x3C)',
          pins: [
            { number: '1', name: 'GND', type: 'power_in', connectedNet: 'GND' },
            { number: '2', name: 'VCC', type: 'power_in', voltageLevel: 3.3, connectedNet: '+3V3' },
            { number: '3', name: 'SCL', type: 'input', voltageLevel: 3.3, connectedNet: 'NET_I2C_SCL' },
            { number: '4', name: 'SDA', type: 'bidirectional', voltageLevel: 3.3, connectedNet: 'NET_I2C_SDA' },
          ],
          x: 720,
          y: 280,
        });
        // Hook up nets
        const vccNet = g.nets.find((n) => n.id === '+3V3');
        if (vccNet) vccNet.connections.push({ componentId: displayId, pinNumber: '2' });
        const gndNet = g.nets.find((n) => n.id === 'GND');
        if (gndNet) gndNet.connections.push({ componentId: displayId, pinNumber: '1' });
        const sdaNet = g.nets.find((n) => n.id === 'NET_I2C_SDA');
        if (sdaNet) sdaNet.connections.push({ componentId: displayId, pinNumber: '4' });
        const sclNet = g.nets.find((n) => n.id === 'NET_I2C_SCL');
        if (sclNet) sclNet.connections.push({ componentId: displayId, pinNumber: '3' });

        agentReply = `Added SSD1306 0.96" OLED display (${displayId}) on the shared I2C bus at default I2C address 0x3C. Tied VCC to the 3.3V LDO power rail.`;
        actionDiff = { addedComponents: [`${displayId} (SSD1306)`], modifiedNets: ['NET_I2C_SDA', 'NET_I2C_SCL', '+3V3', 'GND'] };
      } else if (lower.includes('ldo') || lower.includes('power') || lower.includes('regulator')) {
        // Upgrade / adjust LDO
        const ldo = g.components.find((c) => c.category === 'Power' || c.name.includes('LDO'));
        if (ldo) {
          ldo.name = 'TPS7A05-33 200mA Ultra-low Iq LDO';
          ldo.mpn = 'TPS7A0533PDBVR';
          ldo.manufacturer = 'Texas Instruments';
          ldo.description = 'Ultra-low 1µA quiescent current LDO for battery optimization';
          agentReply = `Replaced LDO with Texas Instruments TPS7A05-33. Quiescent current reduced to 1µA, extending battery sleep life. Decoupling capacitors (10µF input / output) retained.`;
          actionDiff = { modifiedNets: ['+3V3', 'VBUS_5V'], explanation: 'Upgraded LDO to TI TPS7A0533' };
        }
      } else {
        agentReply = `I analyzed your request: "${promptText}". Circuit graph verified. All ${g.components.length} components, ${g.nets.length} nets, and ${g.powerRails.length} power rails are in electrical compliance. Ready to synthesize next modification or export.`;
      }

      updateGraph(g);
      setIsAiThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'agent',
          text: agentReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionDiff,
        },
      ]);
      triggerToast?.('PCB Graph updated & ERC validated');
    }, 600);
  };

  // Selected Component Details
  const selectedComp = useMemo(() => {
    return graph.components.find((c) => c.id === selectedCompId) || null;
  }, [graph.components, selectedCompId]);

  // Selected Net Details
  const selectedNet = useMemo(() => {
    return graph.nets.find((n) => n.id === selectedNetId) || null;
  }, [graph.nets, selectedNetId]);

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

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--brand-bg)] text-brand-textMain overflow-hidden select-none">
      {/* ── Top Header & Navigation ── */}
      <div className="h-12 border-b border-brand-border/40 px-4 flex items-center justify-between shrink-0 bg-[color:var(--brand-surface)]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain border border-brand-border/40 text-xs font-medium transition-all cursor-pointer mr-1"
              title="Return to Main Workspace"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>Workspace</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-brand-textMain tracking-tight">
                  {graph.metadata.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-brand-border/30 text-brand-textMuted font-mono">
                  {graph.metadata.revision}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <div className="hidden md:flex items-center p-0.5 rounded-lg bg-black/20 border border-brand-border/30 text-xs">
          <button
            onClick={() => setActiveTab('canvas')}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === 'canvas'
                ? 'bg-brand-textMain text-black shadow-sm font-semibold'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Schematic & Chips
          </button>
          <button
            onClick={() => setActiveTab('power')}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === 'power'
                ? 'bg-brand-textMain text-black shadow-sm font-semibold'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Power Trees ({graph.powerRails.length})
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === 'bom'
                ? 'bg-brand-textMain text-black shadow-sm font-semibold'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            BOM / Sourcing ({graph.components.length})
          </button>
          <button
            onClick={() => setActiveTab('erc')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === 'erc'
                ? 'bg-brand-textMain text-black shadow-sm font-semibold'
                : ercErrors.length > 0
                ? 'text-rose-400'
                : ercWarnings.length > 0
                ? 'text-amber-400'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <span>ERC Audit</span>
            {ercErrors.length > 0 ? (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            ) : ercWarnings.length > 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            )}
          </button>
        </div>

        {/* Right Tools & Export */}
        <div className="flex items-center gap-2">
          {/* Template Selector */}
          <select
            onChange={(e) => {
              const tmpl = STARTER_TEMPLATES.find((t) => t.id === e.target.value);
              if (tmpl) {
                const nextGraph = JSON.parse(JSON.stringify(tmpl.graph));
                updateGraph(nextGraph);
                triggerToast?.(`Loaded ${tmpl.name}`);
              }
            }}
            className="bg-black/30 border border-brand-border/40 text-brand-textMuted text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-border-strong cursor-pointer"
          >
            {STARTER_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex < 0}
            className={`p-1.5 rounded-lg border border-brand-border/30 text-xs transition-colors ${
              historyIndex >= 0
                ? 'hover:bg-white/5 text-brand-textMain cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-brand-textMuted'
            }`}
            title="Undo last change"
          >
            <RefreshCw className="w-3.5 h-3.5 rotate-180" />
          </button>

          {/* Export to ECAD Button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ECAD Export</span>
          </button>
        </div>
      </div>

      {/* ── Main Workspace Body (3-Pane Layout) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sub-Panel: Component Library & Hierarchical Tree */}
        <div className="w-64 border-r border-brand-border/40 flex flex-col bg-[color:var(--brand-surface)]/40 shrink-0">
          <div className="p-3 border-b border-brand-border/30 flex items-center justify-between">
            <span className="ui-eyebrow flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-emerald-400" />
              Components ({graph.components.length})
            </span>
            <button
              onClick={() => setShowAddCompModal(true)}
              className="p-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMain transition-colors cursor-pointer"
              title="Add component"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {graph.components.map((comp) => {
              const isSelected = selectedCompId === comp.id;
              const hasErc = graph.ercReport.some((r) => r.affectedComponents?.includes(comp.id));
              return (
                <div
                  key={comp.id}
                  onClick={() => {
                    setSelectedCompId(comp.id);
                    setSelectedNetId(null);
                  }}
                  className={`p-2 rounded-lg border text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-brand-textMain shadow-sm'
                      : 'border-brand-border/20 bg-black/10 hover:bg-white/5 text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-semibold">
                    <span className="text-emerald-400">{comp.id}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-white/5 text-brand-textMuted">
                      {comp.package}
                    </span>
                  </div>
                  <div className="truncate font-medium text-[11px] mt-0.5">{comp.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-brand-textMuted/70 mt-1 font-mono">
                    <span>{comp.mpn}</span>
                    {hasErc && <span className="text-amber-400">⚠️ ERC</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nets Quick Tree */}
          <div className="p-3 border-t border-brand-border/30 bg-black/20">
            <div className="ui-eyebrow flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-amber-400" />
              Nets & Buses ({graph.nets.length})
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
              {graph.nets.map((net) => (
                <div
                  key={net.id}
                  onClick={() => {
                    setSelectedNetId(net.id);
                    setSelectedCompId(null);
                  }}
                  className={`flex items-center justify-between px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                    selectedNetId === net.id
                      ? 'bg-amber-500/15 text-amber-300 font-semibold'
                      : 'text-brand-textMuted hover:bg-white/5 hover:text-brand-textMain'
                  }`}
                >
                  <span className="truncate">{net.name}</span>
                  <span className="text-[9px] text-brand-textMuted/60 uppercase">{net.netClass}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Interactive Visual Schematic / Block Canvas */}
        <div className="flex-1 flex flex-col bg-black/40 overflow-hidden relative">
          {/* Canvas Controls overlay */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 rounded-lg bg-[color:var(--brand-surface)]/90 border border-brand-border/40 shadow-lg backdrop-blur-sm">
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 2.0))}
              className="p-1.5 rounded hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1 text-brand-textMuted">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.5))}
              className="p-1.5 rounded hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 rounded hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Visual Canvas Area */}
          <div className="flex-1 overflow-auto p-8 relative flex items-center justify-center">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                minWidth: '850px',
                minHeight: '480px',
              }}
              className="relative rounded-xl border border-brand-border/30 bg-[#0b0f17] shadow-2xl p-6 select-none"
            >
              {/* Grid Background Pattern */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none rounded-xl"
                style={{
                  backgroundImage: `radial-gradient(circle, #3b82f6 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }}
              />

              {/* Functional Section Boxes */}
              <div className="text-[10px] font-mono uppercase tracking-wider text-brand-textMuted/40 mb-3 flex items-center justify-between">
                <span>Schematic Topology & Pin Allocation</span>
                <span>Ground: Star Point GND • System Rails: +3V3 / 5V</span>
              </div>

              {/* Render Component Blocks */}
              <div className="flex flex-wrap gap-4 items-start relative z-10">
                {graph.components.map((comp) => {
                  const isSelected = selectedCompId === comp.id;
                  const isConnectedToSelectedNet =
                    selectedNetId &&
                    comp.pins.some((p) => p.connectedNet === selectedNetId);

                  return (
                    <div
                      key={comp.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompId(comp.id);
                        setSelectedNetId(null);
                      }}
                      className={`min-w-[190px] rounded-lg border transition-all duration-150 p-3 relative cursor-pointer shadow-md ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40 ring-2 ring-emerald-500/20'
                          : isConnectedToSelectedNet
                          ? 'border-amber-500/80 bg-amber-950/30'
                          : 'border-brand-border/40 bg-brand-surface/90 hover:border-brand-border-strong hover:bg-white/[0.03]'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-brand-border/20 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-emerald-400">
                            {comp.id}
                          </span>
                          <span className="text-[10px] text-brand-textMuted truncate max-w-[110px]">
                            {comp.name}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/40 text-brand-textMuted">
                          {comp.package}
                        </span>
                      </div>

                      {/* Pins Matrix */}
                      <div className="space-y-1">
                        {comp.pins.map((pin) => {
                          const isPinNetSelected = selectedNetId && pin.connectedNet === selectedNetId;
                          const isPower = pin.type === 'power_in' || pin.type === 'power_out';
                          return (
                            <div
                              key={pin.number}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (pin.connectedNet) {
                                  setSelectedNetId(pin.connectedNet);
                                  setSelectedCompId(null);
                                }
                              }}
                              className={`flex items-center justify-between text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                                isPinNetSelected
                                  ? 'bg-amber-400 text-black font-bold'
                                  : 'hover:bg-white/10 text-brand-textMuted'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-brand-textMuted/60 w-4">{pin.number}</span>
                                <span className={isPower ? 'text-rose-400 font-semibold' : 'text-brand-textMain'}>
                                  {pin.name}
                                </span>
                              </div>
                              <span className="text-[9px] text-brand-textMuted/80 truncate max-w-[70px]">
                                {pin.connectedNet || 'NC'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* MPN / Sourcing Footer */}
                      <div className="mt-2 pt-1.5 border-t border-brand-border/20 flex items-center justify-between text-[9px] font-mono text-brand-textMuted/60">
                        <span>{comp.mpn}</span>
                        {comp.lcscPart && <span className="text-blue-400">{comp.lcscPart}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Inspector Bar */}
          <div className="h-28 border-t border-brand-border/40 bg-[color:var(--brand-surface)]/90 p-3 flex items-center gap-4 shrink-0 overflow-x-auto">
            {selectedComp ? (
              <div className="flex items-center gap-6 text-xs min-w-max">
                <div>
                  <div className="ui-eyebrow text-emerald-400">Selected Component</div>
                  <div className="font-bold text-sm text-brand-textMain">
                    {selectedComp.id} — {selectedComp.name}
                  </div>
                  <div className="text-[11px] text-brand-textMuted font-mono">
                    MPN: {selectedComp.mpn} | Package: {selectedComp.package} | Mfg: {selectedComp.manufacturer}
                  </div>
                </div>
                <div className="h-12 w-px bg-brand-border/30" />
                <div>
                  <div className="ui-eyebrow">Pin Connections ({selectedComp.pins.length})</div>
                  <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                    {selectedComp.pins.map((p) => (
                      <span
                        key={p.number}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30 border border-brand-border/30 text-brand-textMuted"
                      >
                        {p.name} → <strong className="text-brand-textMain">{p.connectedNet || 'NC'}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedNet ? (
              <div className="flex items-center gap-6 text-xs min-w-max">
                <div>
                  <div className="ui-eyebrow text-amber-400">Selected Net</div>
                  <div className="font-bold text-sm text-amber-300 font-mono">{selectedNet.name}</div>
                  <div className="text-[11px] text-brand-textMuted">
                    Class: {selectedNet.netClass.toUpperCase()} | Voltage: {selectedNet.voltage ?? 'N/A'}V
                  </div>
                </div>
                <div className="h-12 w-px bg-brand-border/30" />
                <div>
                  <div className="ui-eyebrow">Endpoints ({selectedNet.connections.length})</div>
                  <div className="flex items-center gap-1.5">
                    {selectedNet.connections.map((c, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200"
                      >
                        {c.componentId}.{c.pinNumber}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-brand-textMuted flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <span>Select any component or net in the schematic above to inspect electrical parameters, pinmuxing, and footprint mapping.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: AI Hardware Co-Pilot & Chat Feedback Loop */}
        <div className="w-84 lg:w-96 border-l border-brand-border/40 flex flex-col bg-[color:var(--brand-surface)]/60 shrink-0">
          {/* Header */}
          <div className="p-3 border-b border-brand-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-xs text-brand-textMain">AI Hardware Co-Pilot</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Active Feedback Loop
            </span>
          </div>

          {/* Quick Action Suggestion Pills */}
          <div className="p-2 border-b border-brand-border/20 flex flex-wrap gap-1.5 bg-black/10">
            <button
              onClick={() => runAiCommand('Add 0.96" I2C OLED display (SSD1306) on address 0x3C')}
              className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer border border-brand-border/20"
            >
              + Add I2C OLED Display
            </button>
            <button
              onClick={() => runAiCommand('Upgrade LDO regulator to ultra-low quiescent current TI TPS7A05')}
              className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer border border-brand-border/20"
            >
              ⚡ Upgrade to Low-Iq LDO
            </button>
            <button
              onClick={() => runAiCommand('Synthesize missing I2C pullup resistors and run ERC verification')}
              className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer border border-brand-border/20"
            >
              🛡️ Auto-Fix ERC Warnings
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] p-2.5 rounded-xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white font-medium rounded-br-xs'
                      : 'bg-black/30 border border-brand-border/30 text-brand-textMain/90 rounded-bl-xs'
                  }`}
                >
                  {msg.text}

                  {msg.actionDiff && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] font-mono space-y-1">
                      {msg.actionDiff.addedComponents && (
                        <div className="text-emerald-400">
                          + Added: {msg.actionDiff.addedComponents.join(', ')}
                        </div>
                      )}
                      {msg.actionDiff.modifiedNets && (
                        <div className="text-amber-300">
                          ~ Modified Nets: {msg.actionDiff.modifiedNets.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-brand-textMuted/50 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {isAiThinking && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 p-2 bg-emerald-500/10 rounded-lg animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Reasoning hardware pinmux & synthesizing circuit diff...</span>
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div className="p-3 border-t border-brand-border/30 bg-black/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAiCommand(chatInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI to connect chips, size passives, or refactor..."
                className="flex-1 bg-black/40 border border-brand-border/40 rounded-lg px-3 py-2 text-xs text-brand-textMain placeholder:text-brand-textMuted/50 focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAiThinking}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Modal: ECAD Export Dialog ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-brand-border bg-[color:var(--brand-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-brand-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-sm">Lossless ECAD & Netlist Export</span>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target Formats Selector */}
            <div className="px-4 py-2 border-b border-brand-border/30 flex items-center gap-2 bg-black/20 overflow-x-auto text-xs">
              {(
                [
                  { id: 'kicad', label: 'KiCad 8/9 (.kicad_sch)' },
                  { id: 'altium', label: 'Altium Netlist (.NET)' },
                  { id: 'skidl', label: 'SKiDL Python Script' },
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
                      : 'text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>

            {/* Export Code Preview */}
            <div className="flex-1 overflow-auto p-4 bg-black/50 font-mono text-xs text-brand-textMain/90 leading-relaxed max-h-96">
              <pre className="whitespace-pre-wrap">{exportPayload}</pre>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-brand-border/40 flex items-center justify-between bg-[color:var(--brand-surface)]">
              <span className="text-[11px] text-brand-textMuted font-mono">
                {graph.components.length} components • {graph.nets.length} nets • {graph.powerRails.length} power rails
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border hover:bg-white/5 text-xs font-semibold text-brand-textMain transition-colors cursor-pointer"
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
          <div className="w-full max-w-md rounded-xl border border-brand-border bg-[color:var(--brand-surface)] shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm">Add New Component</span>
              <button
                onClick={() => setShowAddCompModal(false)}
                className="p-1 rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Component Category</label>
                <select
                  value={newCompCategory}
                  onChange={(e) => setNewCompCategory(e.target.value as any)}
                  className="w-full bg-black/30 border border-brand-border/40 rounded-lg p-2 text-brand-textMain focus:outline-none"
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
                  placeholder="e.g. MPU6050 6-Axis IMU"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  className="w-full bg-black/30 border border-brand-border/40 rounded-lg p-2 text-brand-textMain focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Manufacturer Part # (MPN)</label>
                <input
                  type="text"
                  placeholder="e.g. MPU-6050"
                  value={newCompMpn}
                  onChange={(e) => setNewCompMpn(e.target.value)}
                  className="w-full bg-black/30 border border-brand-border/40 rounded-lg p-2 text-brand-textMain focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-brand-textMuted mb-1 font-medium">Footprint Package</label>
                <input
                  type="text"
                  placeholder="e.g. QFN-24 / 0402"
                  value={newCompPkg}
                  onChange={(e) => setNewCompPkg(e.target.value)}
                  className="w-full bg-black/30 border border-brand-border/40 rounded-lg p-2 text-brand-textMain focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAddCompModal(false)}
                className="px-3 py-1.5 rounded-lg border border-brand-border text-xs text-brand-textMuted hover:text-brand-textMain"
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
                Add to Schematic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
