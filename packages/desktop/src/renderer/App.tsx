import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TrajectoryCanvas, TrajectoryStep } from './components/TrajectoryCanvas';
import { Composer, ComposerOptions } from './components/Composer';
import { DiffViewer } from './components/DiffViewer';
import { BYOKModal } from './components/BYOKModal';
import { MCPDashboard, MCPServerInfo } from './components/MCPDashboard';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('trajectory');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isBYOKOpen, setIsBYOKOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [byokKeys, setByokKeys] = useState<Record<string, string>>({
    openai: 'sk-proj-demo-key-12345',
    anthropic: '',
    gemini: ''
  });

  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([
    {
      id: 'mcp-1',
      name: 'FileSystem Server',
      transport: 'stdio',
      commandOrUrl: 'npx -y @modelcontextprotocol/server-filesystem ./',
      status: 'connected',
      enabled: true,
      toolsCount: 12,
      latencyMs: 14
    },
    {
      id: 'mcp-2',
      name: 'Memory Knowledge Graph',
      transport: 'sse',
      commandOrUrl: 'http://localhost:19191/sse',
      status: 'connected',
      enabled: true,
      toolsCount: 5,
      latencyMs: 8
    }
  ]);

  const [trajectorySteps, setTrajectorySteps] = useState<TrajectoryStep[]>([
    {
      id: 'step-1',
      type: 'assistant',
      content: 'SuperAgent Desktop initialized. Ready for autonomous software engineering and multimodal AI media generation.',
      timestamp: 'Just now'
    }
  ]);

  const [activeDiff, setActiveDiff] = useState<{
    filename: string;
    originalCode: string;
    modifiedCode: string;
  } | null>(null);

  const handleSendPrompt = (prompt: string, options: ComposerOptions) => {
    const userStep: TrajectoryStep = {
      id: `step-user-${Date.now()}`,
      type: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const thoughtStep: TrajectoryStep = {
      id: `step-thought-${Date.now()}`,
      type: 'thought',
      content: `Analyzing prompt using model ${options.model} in ${options.mode} mode. Querying connected MCP servers...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setTrajectorySteps((prev) => [...prev, userStep, thoughtStep]);
    setIsGenerating(true);

    setTimeout(() => {
      const toolStep: TrajectoryStep = {
        id: `step-tool-${Date.now()}`,
        type: 'tool_call',
        toolName: 'file_editor',
        status: 'success',
        content: `Modified src/app.ts with performance optimization.`,
        metadata: {
          filename: 'src/app.ts',
          originalCode: 'function run() {\n  console.log("old");\n}',
          modifiedCode: 'function run() {\n  console.log("new optimized");\n}'
        }
      };

      const assistantStep: TrajectoryStep = {
        id: `step-asst-${Date.now()}`,
        type: 'assistant',
        content: `I have updated \`src/app.ts\` and completed execution. You can inspect the file diff using the button above.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setTrajectorySteps((prev) => [...prev, toolStep, assistantStep]);
      setIsGenerating(false);
    }, 1000);
  };

  const handleViewDiff = (filename: string, originalCode: string, modifiedCode: string) => {
    setActiveDiff({ filename, originalCode, modifiedCode });
    setActiveTab('diff');
  };

  const handleAddMcpServer = (newServer: Partial<MCPServerInfo>) => {
    const created: MCPServerInfo = {
      id: `mcp-${Date.now()}`,
      name: newServer.name || 'Custom Server',
      transport: newServer.transport || 'stdio',
      commandOrUrl: newServer.commandOrUrl || '',
      status: 'connected',
      enabled: true,
      toolsCount: 3,
      latencyMs: 15
    };
    setMcpServers((prev) => [...prev, created]);
  };

  const handleRemoveMcpServer = (id: string) => {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleMcpServer = (id: string, enabled: boolean) => {
    setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send(`window-${action}`);
      } catch (e) {
        console.warn(`Window control ${action} failed outside Electron`, e);
      }
    }
  };

  return (
    <div
      data-testid="app-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#09090b',
        color: '#f4f4f5',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}
    >
      {/* Frameless Custom Title Bar */}
      <div
        data-testid="title-bar"
        style={{
          height: '40px',
          backgroundColor: '#121215',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          userSelect: 'none',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#a1a1aa' }}>
            SuperAgent Desktop — Codex Clone
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div
            data-testid="byok-badge-trigger"
            onClick={() => setIsBYOKOpen(true)}
            style={{
              backgroundColor: '#1e1b4b',
              border: '1px solid #4338ca',
              color: '#c7d2fe',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔑 BYOK: {byokKeys.openai ? 'OpenAI (Active)' : 'Configure Keys'}
          </div>

          {/* Window Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              data-testid="win-minimize"
              onClick={() => handleWindowControl('minimize')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '12px' }}
            >
              🗕
            </button>
            <button
              data-testid="win-maximize"
              onClick={() => handleWindowControl('maximize')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '12px' }}
            >
              🗖
            </button>
            <button
              data-testid="win-close"
              onClick={() => handleWindowControl('close')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Main App Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === 'settings') {
              setIsBYOKOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          mcpCount={mcpServers.filter((s) => s.enabled).length}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          {activeTab === 'trajectory' && (
            <>
              <TrajectoryCanvas
                steps={trajectorySteps}
                isStreaming={isGenerating}
                onViewDiff={handleViewDiff}
              />
              <Composer
                onSend={handleSendPrompt}
                isGenerating={isGenerating}
                onStop={() => setIsGenerating(false)}
              />
            </>
          )}

          {activeTab === 'diff' && (
            <DiffViewer
              originalCode={activeDiff?.originalCode || '// Select a file diff from trajectory canvas'}
              modifiedCode={activeDiff?.modifiedCode || '// Select a file diff from trajectory canvas'}
              filename={activeDiff?.filename || 'No File Selected'}
              onAccept={() => {
                alert('Accepted changes!');
                setActiveTab('trajectory');
              }}
              onReject={() => {
                alert('Rejected changes!');
                setActiveTab('trajectory');
              }}
              onClose={() => setActiveTab('trajectory')}
            />
          )}

          {activeTab === 'mcp' && (
            <MCPDashboard
              servers={mcpServers}
              onAddServer={handleAddMcpServer}
              onRemoveServer={handleRemoveMcpServer}
              onToggleServer={handleToggleMcpServer}
            />
          )}
        </div>
      </div>

      {/* BYOK Settings Modal */}
      <BYOKModal
        isOpen={isBYOKOpen}
        onClose={() => setIsBYOKOpen(false)}
        onSaveKeys={(keys) => setByokKeys(keys)}
        initialKeys={byokKeys}
      />
    </div>
  );
};

export default App;
