import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TrajectoryStep } from './components/TrajectoryCanvas';
import { ComposerOptions } from './components/Composer';
import { DiffViewer } from './components/DiffViewer';
import { BYOKModal } from './components/BYOKModal';
import { MCPDashboard, MCPServerInfo } from './components/MCPDashboard';
import { SearchModal } from './components/SearchModal';
import { ScheduledView } from './components/ScheduledView';
import { PluginsView } from './components/PluginsView';
import { SettingsView, ProviderConnection, ModelConfig } from './settings/SettingsView';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ConfigureProjectModal } from './components/ConfigureProjectModal';
import { TitleBar } from './components/TitleBar';
import { AppToast } from './components/AppToast';
import { WorkspaceView } from './components/WorkspaceView';
import { StoredChat, StoredProject } from './types';
import { useThemeMode } from './theme';

export const App: React.FC = () => {
  const { themeMode, setThemeMode } = useThemeMode();
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
  const [composerPrompt, setComposerPrompt] = useState<string>('');

  // Dynamic projects & chats state
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState<boolean>(false);
  const [isConfigureProjectOpen, setIsConfigureProjectOpen] = useState<boolean>(false);
  const [projectToConfigure, setProjectToConfigure] = useState<StoredProject | null>(null);

  // Providers & Models
  const [connectedProviders, setConnectedProviders] = useState<ProviderConnection[]>([]);
  const [modelsCatalog, setModelsCatalog] = useState<ModelConfig[]>([]);

  // Resolve ipcRenderer safely
  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  // Persist helpers — write every change back to the JSON store on disk
  const persistStore = (
    providers: ProviderConnection[],
    models: ModelConfig[],
    currentProjects: StoredProject[] = projects,
    currentChats: StoredChat[] = chats
  ) => {
    ipc?.invoke('store-write', {
      connectedProviders: providers,
      modelsCatalog: models,
      projects: currentProjects,
      chats: currentChats
    });
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
    if (!ipc) {
      // No Electron IPC — start empty for test environments
      return;
    }

    (async () => {
      // 1. Load store from disk
      const stored = await ipc.invoke('store-read') as {
        connectedProviders: ProviderConnection[];
        modelsCatalog: ModelConfig[];
        projects?: StoredProject[];
        chats?: StoredChat[];
      };
      
      const loadedProviders = stored.connectedProviders ?? [];
      const loadedModels = stored.modelsCatalog ?? [];
      const loadedProjects = stored.projects ?? [];
      const loadedChats = stored.chats ?? [];

      // Use exactly what is stored — no hardcoded defaults
      const finalProjects = loadedProjects;
      const finalChats = loadedChats;

      setProjects(finalProjects);
      setChats(finalChats);
      setConnectedProviders(loadedProviders);
      setModelsCatalog(loadedModels);

      // Select active project and chat
      if (finalProjects.length > 0) {
        const defaultProject = finalProjects[0].name;
        setActiveProject(defaultProject);
        
        const matchingChat = finalChats.find(c => c.project === defaultProject);
        if (matchingChat) {
          setActiveChatId(matchingChat.id);
          setTrajectorySteps(matchingChat.steps);
        } else {
          // create a new chat context
          const defaultChatId = `chat-default`;
          const defaultChat: StoredChat = {
            id: defaultChatId,
            title: `New chat in ${defaultProject}`,
            project: defaultProject,
            model: '5.5 Medium',
            timestamp: 'Just now',
            steps: [{ id: `init-${Date.now()}`, type: 'assistant', content: 'SuperAgent Desktop initialized. Ready for autonomous software engineering and multimodal AI media generation.' }]
          };
          setChats(prev => [defaultChat, ...prev]);
          setActiveChatId(defaultChatId);
          setTrajectorySteps(defaultChat.steps);
        }
      }

      persistStore(loadedProviders, loadedModels, finalProjects, finalChats);

      const storedIds = new Set(loadedProviders.map((p: ProviderConnection) => p.id));

      // 2. Auto-detect providers
      try {
        const detected = await ipc.invoke('auto-detect-providers') as Array<{
          id: string; name: string; type: 'env' | 'key' | 'custom';
          apiKey: string; baseUrl: string;
          models: Array<{ id: string; name: string }>;
        }>;

        const newProviders: ProviderConnection[] = [];
        const newModels: ModelConfig[] = [];

        for (const d of detected) {
          if (storedIds.has(d.id)) continue;
          newProviders.push({ id: d.id, name: d.name, type: d.type, apiKey: d.apiKey, baseUrl: d.baseUrl });
          for (const m of d.models) {
            newModels.push({
              id: `${d.id}-${m.id}`,
              name: m.name,
              providerId: d.id,
              enabled: false,
              contextLimit: 'n/a'
            });
          }
        }

        if (newProviders.length) {
          setConnectedProviders(prev => {
            const next = [...prev, ...newProviders];
            setModelsCatalog(prevM => {
              const nextM = [...prevM, ...newModels];
              persistStore(next, nextM, finalProjects, finalChats);
              return nextM;
            });
            return next;
          });
        }
      } catch {
        // Auto-detect failed silently
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

  // Keyboard shortcut listeners
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

  const handleAttachFiles = async () => {
    if (!activeChatId) {
      triggerToast('Please select or create a chat first');
      return;
    }
    const currentChat = chats.find(c => c.id === activeChatId);
    if (!currentChat) return;

    try {
      const filePaths: string[] = await ipc?.invoke('select-files');
      if (filePaths && filePaths.length > 0) {
        for (const filePath of filePaths) {
          const res = await ipc?.invoke('copy-file-to-chat', {
            sourcePath: filePath,
            chatId: activeChatId,
            projectName: currentChat.project
          });
          
          if (res) {
            triggerToast(`Uploaded: ${res.filename}`);
            setChats(prevChats => {
              const updatedChats = prevChats.map(c => {
                if (c.id === activeChatId) {
                  const attachStep: TrajectoryStep = {
                    id: `attach-${Date.now()}-${Math.random()}`,
                    type: 'user',
                    content: `📎 Attached context: ${res.filename}`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    metadata: {
                      mediaType: res.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : res.filename.toLowerCase().endsWith('.ppt') ? 'ppt' : 'image',
                      mediaPath: res.fullPath
                    }
                  };
                  const updatedSteps = [...c.steps, attachStep];
                  // If active chat is the one we modified, sync local state
                  if (activeChatId === c.id) {
                    setTrajectorySteps(updatedSteps);
                  }
                  return { ...c, steps: updatedSteps };
                }
                return c;
              });
              persistStore(connectedProviders, modelsCatalog, projects, updatedChats);
              return updatedChats;
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to attach files', e);
      triggerToast('Error attaching files');
    }
  };

  const handleSendPrompt = (prompt: string, options: ComposerOptions) => {
    setComposerPrompt('');
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

    const updatedSteps = [...trajectorySteps, userStep, thoughtStep];
    setTrajectorySteps(updatedSteps);
    setIsGenerating(true);

    // Save prompt steps to active chat
    if (activeChatId) {
      setChats(prev => {
        const next = prev.map(c => {
          if (c.id === activeChatId) {
            // Update title if it was default
            const isDefaultTitle = c.title.startsWith('New chat');
            const newTitle = isDefaultTitle ? (prompt.length > 25 ? prompt.slice(0, 25) + '...' : prompt) : c.title;
            return { ...c, title: newTitle, steps: updatedSteps };
          }
          return c;
        });
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });
    }

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

      const finalSteps = [...updatedSteps, toolStep, assistantStep];
      setTrajectorySteps(finalSteps);
      setIsGenerating(false);

      if (activeChatId) {
        setChats(prev => {
          const next = prev.map(c => c.id === activeChatId ? { ...c, steps: finalSteps } : c);
          persistStore(connectedProviders, modelsCatalog, projects, next);
          return next;
        });
      }
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

    // Find first chat belonging to this project
    const matchingChat = chats.find(c => c.project === project);
    if (matchingChat) {
      setActiveChatId(matchingChat.id);
      setTrajectorySteps(matchingChat.steps);
    } else {
      // Create a default chat for this project
      const newChatId = `chat-${Date.now()}`;
      const newChat: StoredChat = {
        id: newChatId,
        title: `New chat in ${project}`,
        project: project,
        model: '5.5 Medium',
        timestamp: 'Just now',
        steps: [
          {
            id: `step-new-${Date.now()}`,
            type: 'assistant',
            content: `New conversation initialized. Project context: \`${project}\`. How can I help you today?`
          }
        ]
      };
      setChats(prev => {
        const next = [newChat, ...prev];
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });
      setActiveChatId(newChatId);
      setTrajectorySteps(newChat.steps);
    }
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

  // Dynamic project creation
  const handleCreateProject = (newProj: StoredProject) => {
    setProjects(prev => {
      const next = [...prev, newProj];
      // Create initial chat for this new project
      const newChatId = `chat-${Date.now()}`;
      const newChat: StoredChat = {
        id: newChatId,
        title: `New chat in ${newProj.name}`,
        project: newProj.name,
        model: '5.5 Medium',
        timestamp: 'Just now',
        steps: [
          {
            id: `step-new-${Date.now()}`,
            type: 'assistant',
            content: `New conversation initialized. Project context: \`${newProj.name}\`. How can I help you today?`
          }
        ]
      };

      setChats(prevChats => {
        const nextChats = [newChat, ...prevChats];
        persistStore(connectedProviders, modelsCatalog, next, nextChats);
        return nextChats;
      });

      setActiveProject(newProj.name);
      setActiveChatId(newChatId);
      setTrajectorySteps(newChat.steps);
      return next;
    });

    setActiveTab('trajectory');
  };

  const handleSaveProjectConfig = (updatedProj: StoredProject) => {
    setProjects(prev => {
      const next = prev.map(p => p.name === updatedProj.name ? updatedProj : p);
      persistStore(connectedProviders, modelsCatalog, next, chats);
      return next;
    });
  };

  // Dynamic project deletion
  const handleDeleteProject = (projectName: string) => {
    setProjects(prev => {
      const next = prev.filter(p => p.name !== projectName);
      // Remove all chats of this project
      setChats(prevChats => {
        const nextChats = prevChats.filter(c => c.project !== projectName);
        
        // Pick new active project if deleted was selected
        if (activeProject === projectName) {
          if (next.length > 0) {
            const nextProjName = next[0].name;
            setActiveProject(nextProjName);
            const matchingChat = nextChats.find(c => c.project === nextProjName);
            if (matchingChat) {
              setActiveChatId(matchingChat.id);
              setTrajectorySteps(matchingChat.steps);
            } else {
              setActiveChatId(null);
              setTrajectorySteps([]);
            }
          } else {
            setActiveProject('');
            setActiveChatId(null);
            setTrajectorySteps([]);
          }
        }
        persistStore(connectedProviders, modelsCatalog, next, nextChats);
        return nextChats;
      });
      return next;
    });
  };

  // Dynamic chat selection
  const handleSelectChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChatId(chatId);
      setActiveProject(chat.project);
      setTrajectorySteps(chat.steps);
      setActiveTab('trajectory');
    }
  };

  // Dynamic chat deletion
  const handleDeleteChat = (chatId: string) => {
    setChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      if (activeChatId === chatId) {
        if (next.length > 0) {
          const nextChat = next.find(c => c.project === activeProject) || next[0];
          setActiveChatId(nextChat.id);
          setActiveProject(nextChat.project);
          setTrajectorySteps(nextChat.steps);
        } else {
          setActiveChatId(null);
          setTrajectorySteps([]);
        }
      }
      persistStore(connectedProviders, modelsCatalog, projects, next);
      return next;
    });
  };

  // Create new blank chat — optionally scoped to a specific project
  const handleNewChat = (forProject?: string) => {
    const targetProject = forProject || activeProject;
    if (!targetProject) {
      triggerToast('Please create or select a project first');
      return;
    }
    const newChatId = `chat-${Date.now()}`;
    const newChat: StoredChat = {
      id: newChatId,
      title: `New chat`,
      project: targetProject,
      model: modelsCatalog.find(m => m.enabled)?.name || '',
      timestamp: 'Just now',
      steps: [
        {
          id: `step-new-${Date.now()}`,
          type: 'assistant',
          content: `New conversation initialized. Project context: \`${targetProject}\`. How can I help you today?`
        }
      ]
    };
    setActiveProject(targetProject);
    setChats(prev => {
      const next = [newChat, ...prev];
      persistStore(connectedProviders, modelsCatalog, projects, next);
      return next;
    });
    setActiveChatId(newChatId);
    setTrajectorySteps(newChat.steps);
    setActiveTab('trajectory');
  };

  return (
    <div
      data-testid="app-container"
      data-theme={themeMode}
      className="flex flex-col h-screen w-screen bg-brand-bg text-brand-textMain overflow-hidden font-sans select-none"
    >
      <TitleBar
        hasOpenAiKey={Boolean(byokKeys.openai)}
        onOpenProviders={() => {
          setActiveTab('settings');
          setSettingsCategory('providers');
        }}
        onWindowControl={handleWindowControl}
      />

      {/* Main Body container */}
      <div className="flex-1 flex overflow-hidden relative">
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
            onNewChat={handleNewChat}
            onNewChatInProject={(projectName) => handleNewChat(projectName)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            mcpCount={mcpServers.filter((s) => s.enabled).length}
            onMenuClick={(menuName) => triggerToast(`${menuName} Menu`)}

            // Dynamic project & chat bindings
            projects={projects}
            chats={chats}
            activeChatId={activeChatId}
            onCreateProjectClick={() => setIsCreateProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
            onConfigureProject={(proj) => {
              setProjectToConfigure(proj);
              setIsConfigureProjectOpen(true);
            }}
            onDeleteChat={handleDeleteChat}
            onSelectChat={handleSelectChat}
          />
        )}

        <div className="flex-1 flex flex-col relative overflow-hidden bg-brand-bg">
          {activeTab === 'trajectory' && (
            <WorkspaceView
              activeProject={activeProject}
              trajectorySteps={trajectorySteps}
              isGenerating={isGenerating}
              modelsCatalog={modelsCatalog}
              mcpServers={mcpServers}
              hasCredentials={Boolean(byokKeys.openai || byokKeys.gemini)}
              composerPrompt={composerPrompt}
              onPromptChange={setComposerPrompt}
              onSendPrompt={handleSendPrompt}
              onStop={() => setIsGenerating(false)}
              onViewDiff={handleViewDiff}
              onOpenMcp={() => setActiveTab('mcp')}
              onOpenSettings={() => {
                setActiveTab('settings');
                setSettingsCategory('general');
              }}
              onToast={triggerToast}
              onAttachClick={handleAttachFiles}
            />
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
              themeMode={themeMode}
              onThemeChange={setThemeMode}
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
        onNewChat={handleNewChat}
        onOpenFolder={() => triggerToast('Workspace Folder Selector')}
        onOpenSettings={() => {
          setActiveTab('settings');
          setSettingsCategory('general');
        }}
      />


      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* Configure Project Modal */}
      <ConfigureProjectModal
        isOpen={isConfigureProjectOpen}
        onClose={() => setIsConfigureProjectOpen(false)}
        project={projectToConfigure}
        onSave={handleSaveProjectConfig}
      />

      <AppToast open={toastOpen} message={toastMessage} />
    </div>
  );
};
