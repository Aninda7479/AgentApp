import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TrajectoryCanvas, TrajectoryStep } from './components/TrajectoryCanvas';
import { Composer, ComposerOptions } from './components/Composer';
import { DiffViewer } from './components/DiffViewer';
import { BYOKModal } from './components/BYOKModal';
import { MCPDashboard, MCPServerInfo } from './components/MCPDashboard';
import { SearchModal } from './components/SearchModal';
import { ScheduledView } from './components/ScheduledView';
import { PluginsView } from './components/PluginsView';
import { SettingsView, ProviderConnection, ModelConfig } from './settings/SettingsView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('trajectory');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isBYOKOpen, setIsBYOKOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState<boolean>(false);
  const [settingsCategory, setSettingsCategory] = useState<string>('general');
  const [activeProject, setActiveProject] = useState<string>('GlacierPharma');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastOpen, setToastOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // ─── Providers & Models — start EMPTY, loaded from disk ─────────────────
  const [connectedProviders, setConnectedProviders] = useState<ProviderConnection[]>([]);
  const [modelsCatalog, setModelsCatalog] = useState<ModelConfig[]>([]);

  // Resolve ipcRenderer safely (only exists inside Electron)
  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  // Persist helpers — write every change back to the JSON store on disk
  const persistStore = (providers: ProviderConnection[], models: ModelConfig[]) => {
    ipc?.invoke('store-write', { connectedProviders: providers, modelsCatalog: models });
  };

  const handleConnectProvider = (provider: ProviderConnection, newModels: ModelConfig[]) => {
    setConnectedProviders(prev => {
      const next = [...prev.filter(p => p.id !== provider.id), provider];
      setModelsCatalog(prevM => {
        const nextM = [...prevM.filter(m => m.providerId !== provider.id), ...newModels];
        persistStore(next, nextM);
        return nextM;
      });
      return next;
    });
  };

  const handleDisconnectProvider = (providerId: string) => {
    setConnectedProviders(prev => {
      const next = prev.filter(p => p.id !== providerId);
      setModelsCatalog(prevM => {
        const nextM = prevM.filter(m => m.providerId !== providerId);
        persistStore(next, nextM);
        return nextM;
      });
      return next;
    });
  };

  const handleToggleModel = (modelId: string) => {
    setModelsCatalog(prev => {
      const next = prev.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m);
      setConnectedProviders(p => { persistStore(p, next); return p; });
      return next;
    });
  };

  // ─── Startup: load persisted data, then auto-detect new providers ──────────
  useEffect(() => {
    if (!ipc) return; // not in Electron (e.g. unit tests)

    (async () => {
      // 1. Load what the user already configured from disk
      const stored = await ipc.invoke('store-read') as {
        connectedProviders: ProviderConnection[];
        modelsCatalog: ModelConfig[];
      };
      const storedIds = new Set(stored.connectedProviders.map((p: ProviderConnection) => p.id));

      if (stored.connectedProviders.length) {
        setConnectedProviders(stored.connectedProviders);
        setModelsCatalog(stored.modelsCatalog);
      }

      // 2. Run auto-detection for Ollama + env-var providers
      //    but only add providers NOT already in the stored list
      try {
        const detected = await ipc.invoke('auto-detect-providers') as Array<{
          id: string; name: string; type: 'env' | 'key' | 'custom';
          apiKey: string; baseUrl: string;
          models: Array<{ id: string; name: string }>;
        }>;

        const newProviders: ProviderConnection[] = [];
        const newModels: ModelConfig[] = [];

        for (const d of detected) {
          if (storedIds.has(d.id)) continue; // already stored by user
          newProviders.push({ id: d.id, name: d.name, type: d.type, apiKey: d.apiKey, baseUrl: d.baseUrl });
          for (const m of d.models) {
            newModels.push({
              id: `${d.id}-${m.id}`,
              name: m.name,
              providerId: d.id,
              enabled: false,
              contextLimit: 'n/a'
              // pricing and modalities enriched via MODEL_CAPS when the user connects via SettingsView
            });
          }
        }

        if (newProviders.length) {
          setConnectedProviders(prev => {
            const next = [...prev, ...newProviders];
            setModelsCatalog(prevM => {
              const nextM = [...prevM, ...newModels];
              persistStore(next, nextM);
              return nextM;
            });
            return next;
          });
        }
      } catch {
        // auto-detect failed silently — user can connect manually
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const popoverRef = useRef<HTMLDivElement>(null);

  const [byokKeys, setByokKeys] = useState<Record<string, string>>({
    openai: '',
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

  // Keyboard shortcut listeners (Ctrl+P for search, Ctrl+, for settings)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setActiveTab('settings');
        setSettingsCategory('general');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setToastOpen(true);
  };

  useEffect(() => {
    if (toastOpen) {
      const timer = setTimeout(() => {
        setToastOpen(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [toastOpen]);

  // Handle clicking outside profile popover to close it
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setProfilePopoverOpen(false);
      }
    };
    if (profilePopoverOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [profilePopoverOpen]);

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
      content: `Analyzing prompt for project [${activeProject}] using model ${options.model}. Querying connected MCP servers...`,
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
        content: `Modified src/app.ts in ${activeProject} with updates.`,
        metadata: {
          filename: 'src/app.ts',
          originalCode: 'function run() {\n  console.log("old");\n}',
          modifiedCode: 'function run() {\n  console.log("new optimized in ' + activeProject + '");\n}'
        }
      };

      const assistantStep: TrajectoryStep = {
        id: `step-asst-${Date.now()}`,
        type: 'assistant',
        content: `I have completed the task in project \`${activeProject}\`. You can inspect the updated file diffs.`,
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

  const handleCreateTaskFromChat = (taskType: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Create a scheduled task: ${taskType}`, {
      model: '5.5 Medium',
      mode: 'plan',
      attachments: []
    });
  };

  const handleUseTemplate = (templateName: string, cronExpr: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Initialize template "${templateName}" with cron "${cronExpr}"`, {
      model: '5.5 Medium',
      mode: 'plan',
      attachments: []
    });
  };

  const handleInstallPlugin = (pluginId: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Install plugin "${pluginId}" into this workspace`, {
      model: '5.5 Medium',
      mode: 'plan',
      attachments: []
    });
  };

  const handleTryPlugin = (pluginId: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Test operations using plugin "${pluginId}"`, {
      model: '5.5 Medium',
      mode: 'plan',
      attachments: []
    });
  };

  const handleSelectProject = (project: string) => {
    setActiveProject(project);
    setActiveTab('trajectory');
  };

  const handleSelectSearchChat = (chatTitle: string, projectContext?: string) => {
    if (projectContext) {
      setActiveProject(projectContext);
    }
    setActiveTab('trajectory');
    setTrajectorySteps([
      {
        id: `chat-seed-${Date.now()}`,
        type: 'user',
        content: `Open chat: ${chatTitle}`
      },
      {
        id: `chat-seed-reply-${Date.now()}`,
        type: 'assistant',
        content: `Loaded conversation history for "${chatTitle}". Currently active in project context: \`${projectContext || activeProject}\`.`
      }
    ]);
  };

  return (
    <div
      data-testid="app-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#141110',
        color: '#ececec',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}
    >
      {/* frameless window top bar overlay */}
      <div
        data-testid="title-bar"
        style={{
          height: '40px',
          backgroundColor: '#1e1816',
          borderBottom: '1px solid #2d2321',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          userSelect: 'none',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#8a8a8a', cursor: 'default' }}>
            SuperAgent Desktop
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div
            data-testid="byok-badge-trigger"
            onClick={() => setIsBYOKOpen(true)}
            style={{
              backgroundColor: '#2e2220',
              border: '1px solid #3d302e',
              color: '#ececec',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔑 BYOK: {byokKeys.openai ? 'OpenAI' : 'Configure'}
          </div>

          {/* Window Control Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
            <button
              data-testid="win-minimize"
              onClick={() => handleWindowControl('minimize')}
              style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '14px', width: '20px', height: '20px' }}
            >
              -
            </button>
            <button
              data-testid="win-maximize"
              onClick={() => handleWindowControl('maximize')}
              style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '11px', width: '20px', height: '20px' }}
            >
              ▢
            </button>
            <button
              data-testid="win-close"
              onClick={() => handleWindowControl('close')}
              style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '12px', width: '20px', height: '20px' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8a8a8a')}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Main Body container */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Hide main sidebar when viewing Settings page, matching Image 4 */}
        {activeTab !== 'settings' && (
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              if (tab === 'settings') {
                setActiveTab('settings');
                setSettingsCategory('general');
              } else {
                setActiveTab(tab);
              }
            }}
            activeProject={activeProject}
            onSelectProject={handleSelectProject}
            onOpenSearch={() => setSearchModalOpen(true)}
            onProfileClick={() => setProfilePopoverOpen(!profilePopoverOpen)}
            onNewChat={() => {
              setActiveTab('trajectory');
              setTrajectorySteps([
                {
                  id: `step-new-${Date.now()}`,
                  type: 'assistant',
                  content: `New conversation initialized. Project context: \`${activeProject}\`. How can I help you today?`
                }
              ]);
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            mcpCount={mcpServers.filter((s) => s.enabled).length}
            onMenuClick={(menuName) => triggerToast(`${menuName} Menu`)}
          />
        )}

        {/* Profile Popover Popup Menu matching Image 3 */}
        {profilePopoverOpen && activeTab !== 'settings' && (
          <div
            ref={popoverRef}
            data-testid="profile-popover"
            style={{
              position: 'absolute',
              bottom: '50px',
              left: '8px',
              width: '240px',
              backgroundColor: '#262220', // Warm dark card matching Image 3
              border: '1px solid #3d3432',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              zIndex: 1500,
              padding: '6px 0',
              fontFamily: "'Inter', -apple-system, sans-serif"
            }}
          >
            {/* User Email */}
            <div
              style={{
                fontSize: '0.8rem',
                color: '#8a8a8a',
                padding: '8px 12px 6px',
                borderBottom: '1px solid #3d3432',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              you@proton.me
            </div>

            {/* Personal Account */}
            <div
              data-testid="popover-item-account"
              onClick={() => {
                triggerToast('Personal Account Profile');
                setProfilePopoverOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                color: '#ececec',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ fontSize: '1rem' }}>👤</span>
              <span>Personal account</span>
            </div>

            {/* Settings */}
            <div
              data-testid="popover-item-settings"
              onClick={() => {
                setActiveTab('settings');
                setSettingsCategory('general');
                setProfilePopoverOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                color: '#ececec',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1rem' }}>⚙️</span>
                <span>Settings</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#8a8a8a', fontFamily: 'monospace' }}>Ctrl+,</span>
            </div>

            {/* Usage Remaining */}
            <div
              data-testid="popover-item-usage"
              onClick={() => {
                triggerToast('Usage & Billing');
                setProfilePopoverOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                color: '#ececec',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1rem' }}>⏱️</span>
                <span>Usage remaining</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>›</span>
            </div>

            {/* Log Out */}
            <div
              data-testid="popover-item-logout"
              onClick={() => {
                alert('Logged out!');
                setProfilePopoverOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                color: '#ececec',
                fontSize: '0.9rem',
                cursor: 'pointer',
                borderTop: '1px solid #3d3432',
                marginTop: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ fontSize: '1rem' }}>🚪</span>
              <span>Log out</span>
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', backgroundColor: '#141110' }}>
          {activeTab === 'trajectory' && (
            <>
              {/* Header inside workspace, with Upgrade and Get Plus buttons removed */}
              <div
                style={{
                  height: '48px',
                  borderBottom: '1px solid #231c1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 24px',
                  backgroundColor: '#141110'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#ececec', fontWeight: 500 }}>
                  <span>📁</span> {activeProject} workspace
                </div>

                {/* Panel layout buttons */}
                <div style={{ display: 'flex', gap: '8px', color: '#8a8a8a', cursor: 'pointer' }}>
                  <span onClick={() => setActiveTab('mcp')} title="MCP Dashboard" style={{ fontSize: '1rem' }}>🔌</span>
                  <span onClick={() => { setActiveTab('settings'); setSettingsCategory('general'); }} title="Settings" style={{ fontSize: '1rem' }}>⚙️</span>
                </div>
              </div>

              {/* Central Title Question */}
              {trajectorySteps.length <= 1 && (
                <div
                  data-testid="workspace-title-question"
                  style={{
                    textAlign: 'center',
                    marginTop: '80px',
                    marginBottom: '-40px',
                    fontSize: '2rem',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 500,
                    color: '#ffffff'
                  }}
                >
                  What should we build in {activeProject}?
                </div>
              )}

              <TrajectoryCanvas
                steps={trajectorySteps}
                isStreaming={isGenerating}
                onViewDiff={handleViewDiff}
              />
              <Composer
                onSend={handleSendPrompt}
                isGenerating={isGenerating}
                onStop={() => setIsGenerating(false)}
                activeProject={activeProject}
                onAttachClick={() => triggerToast('File Attachment Manager')}
                onMicClick={() => triggerToast('Voice Dictation Input')}
                onLocallyClick={() => triggerToast('Local Execution Environments')}
                onBranchClick={() => triggerToast('Git Branch Selector')}
                availableModels={modelsCatalog.filter(m => m.enabled).map(m => m.name)}
                defaultModel={modelsCatalog.filter(m => m.enabled)[0]?.name || 'Gemini 3.5 Flash (High)'}
              />
            </>
          )}

          {activeTab === 'scheduled' && (
            <ScheduledView
              onCreateTask={handleCreateTaskFromChat}
              onUseTemplate={handleUseTemplate}
            />
          )}

          {activeTab === 'plugins' && (
            <PluginsView
              onInstallPlugin={handleInstallPlugin}
              onTryPlugin={handleTryPlugin}
              onToggleSkill={(skillId, enabled) => console.log(`Toggled skill ${skillId}: ${enabled}`)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              activeCategory={settingsCategory}
              onSelectCategory={setSettingsCategory}
              onBackToApp={() => setActiveTab('trajectory')}
              mcpDashboard={
                <MCPDashboard
                  servers={mcpServers}
                  onAddServer={handleAddMcpServer}
                  onRemoveServer={handleRemoveMcpServer}
                  onToggleServer={handleToggleMcpServer}
                />
              }
              connectedProviders={connectedProviders}
              modelsCatalog={modelsCatalog}
              onConnectProvider={handleConnectProvider}
              onDisconnectProvider={handleDisconnectProvider}
              onToggleModel={handleToggleModel}
            />
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

      {/* search dialog overlay */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectChat={handleSelectSearchChat}
        onNewChat={() => {
          setActiveTab('trajectory');
          setTrajectorySteps([
            { id: `step-new-${Date.now()}`, type: 'assistant', content: 'New chat initialized.' }
          ]);
        }}
        onOpenFolder={() => triggerToast('Workspace Folder Selector')}
        onOpenSettings={() => {
          setActiveTab('settings');
          setSettingsCategory('general');
        }}
      />

      {/* BYOK Settings Modal */}
      <BYOKModal
        isOpen={isBYOKOpen}
        onClose={() => setIsBYOKOpen(false)}
        onSaveKeys={(keys) => setByokKeys(keys)}
        initialKeys={byokKeys}
      />

      {/* Under Construction Toast Notification */}
      {toastOpen && (
        <div
          data-testid="toast-under-construction"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#262220',
            border: '1px solid #3d3432',
            borderRadius: '8px',
            padding: '12px 18px',
            color: '#ffffff',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem'
          }}
        >
          <span>🚧</span>
          <span>{toastMessage} is currently under construction.</span>
        </div>
      )}
    </div>
  );
};

export default App;
