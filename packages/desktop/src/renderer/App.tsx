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

interface NavigationSnapshot {
  activeTab: string;
  settingsCategory: string;
  activeProject: string;
  activeChatId: string | null;
  activeDiff: {
    filename: string;
    originalCode: string;
    modifiedCode: string;
  } | null;
}

function sanitizeFolderName(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  if (sanitized.length > 30) {
    sanitized = sanitized.substring(0, 30).replace(/-$/, '');
  }
  return sanitized || `chat-${Date.now()}`;
}

export const App: React.FC = () => {
  const { themeMode, setThemeMode } = useThemeMode();
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [defaultPermissions, setDefaultPermissions] = useState<boolean>(true);
  const [autoReview, setAutoReview] = useState<boolean>(true);
  const [fullAccess, setFullAccess] = useState<boolean>(true);
  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);

  // Sync themeMode with settings.json
  useEffect(() => {
    if (ipc && themeMode && settingsHydrated) {
      ipc.invoke('settings-write', {
        theme: {
          desktop: themeMode
        }
      });
    }
  }, [themeMode, settingsHydrated]);

  const handleWorkModeChange = (mode: 'coding' | 'everyday') => {
    setWorkMode(mode);
    ipc?.invoke('settings-write', { general: { workMode: mode } });
  };

  const handleConfirmShellCommandsChange = (val: boolean) => {
    setDefaultPermissions(val);
    ipc?.invoke('settings-write', { general: { confirmShellCommands: val } });
  };

  const handleAutoReviewPlanChange = (val: boolean) => {
    setAutoReview(val);
    ipc?.invoke('settings-write', { general: { autoReviewPlan: val } });
  };

  const handleUnsandboxedActionsChange = (val: boolean) => {
    setFullAccess(val);
    ipc?.invoke('settings-write', { general: { unsandboxedActions: val } });
  };

  const [activeTab, setActiveTab] = useState<string>('trajectory');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isBYOKOpen, setIsBYOKOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState<boolean>(false);
  const [settingsCategory, setSettingsCategory] = useState<string>('general');
  const [activeProject, setActiveProject] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastOpen, setToastOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'info' | 'error'>('info');
  const [composerPrompt, setComposerPrompt] = useState<string>(() => {
    try {
      return localStorage.getItem('composer_prompt_cache') || '';
    } catch {
      return '';
    }
  });

  // Dynamic projects & chats state
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draftProject, setDraftProject] = useState<string>('');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState<boolean>(false);
  const [isConfigureProjectOpen, setIsConfigureProjectOpen] = useState<boolean>(false);
  const [projectToConfigure, setProjectToConfigure] = useState<StoredProject | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<{ filename: string; sourcePath?: string; buffer?: number[] }[]>(() => {
    try {
      const cached = localStorage.getItem('composer_attachments_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

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

  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    try {
      localStorage.setItem('composer_prompt_cache', composerPrompt);
    } catch (e) {
      console.error(e);
    }
  }, [composerPrompt]);

  useEffect(() => {
    try {
      localStorage.setItem('composer_attachments_cache', JSON.stringify(composerAttachments));
    } catch (e) {
      console.error(e);
    }
  }, [composerAttachments]);

  const updateChatSteps = (targetChatId: string, updater: (prevSteps: TrajectoryStep[]) => TrajectoryStep[]) => {
    setChats(prevChats => {
      const chat = prevChats.find(c => c.id === targetChatId);
      if (!chat) return prevChats;

      const nextSteps = updater(chat.steps || []);
      
      if (targetChatId === activeChatIdRef.current) {
        setTrajectorySteps(nextSteps);
      }

      const nextChats = prevChats.map(c =>
        c.id === targetChatId ? { ...c, steps: nextSteps } : c
      );
      // Pass the updated chats to persistStore to save immediately to disk
      persistStore(connectedProviders, modelsCatalog, projects, nextChats);
      return nextChats;
    });
  };

  // ─── Real AI streaming via agent-event IPC ─────────────────────────────────
  // When a real agent run is active, we receive token/tool_call/done events from
  // the main process (mirroring how OpenCode streams SSE events from its server).
  const streamingBufferRef = React.useRef<string>('');
  const streamingChatIdRef = React.useRef<string | null>(null);
  const streamingStepIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!ipc) return;

    const handleAgentEvent = (_event: any, agentEvent: {
      type: string;
      sessionId: string;
      content?: string;
      toolName?: string;
      toolArgs?: Record<string, unknown>;
      toolResult?: string;
      error?: string;
    }) => {
      const chatId = streamingChatIdRef.current;
      if (!chatId) return;

      if (agentEvent.type === 'token') {
        // Accumulate streaming tokens into the current assistant step
        streamingBufferRef.current += agentEvent.content || '';
        const currentStepId = streamingStepIdRef.current;

        updateChatSteps(chatId, prev => {
          if (currentStepId) {
            // Update existing streaming step
            return prev.map(s =>
              s.id === currentStepId
                ? { ...s, content: streamingBufferRef.current }
                : s
            );
          } else {
            // Create new streaming assistant step
            const newStepId = `stream-assistant-${Date.now()}`;
            streamingStepIdRef.current = newStepId;
            const newStep: TrajectoryStep = {
              id: newStepId,
              type: 'assistant',
              content: streamingBufferRef.current,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            return [...prev, newStep];
          }
        });
      }

      if (agentEvent.type === 'tool_call') {
        const toolStep: TrajectoryStep = {
          id: `tool-call-${Date.now()}`,
          type: 'tool_call',
          toolName: agentEvent.toolName,
          content: `${agentEvent.toolName}(${JSON.stringify(agentEvent.toolArgs || {})})`,
          status: 'running',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps(chatId, prev => [...prev, toolStep]);
      }

      if (agentEvent.type === 'tool_result') {
        // Update the last tool_call step to success, add result
        updateChatSteps(chatId, prev => {
          const lastToolCallIdx = [...prev].reverse().findIndex(s => s.type === 'tool_call' && s.status === 'running');
          if (lastToolCallIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastToolCallIdx;
          return prev.map((s, i) =>
            i === actualIdx ? { ...s, status: 'success' as const, content: agentEvent.content || s.content } : s
          );
        });
        // Reset buffer so next token creates a new assistant step
        streamingBufferRef.current = '';
        streamingStepIdRef.current = null;
      }

      if (agentEvent.type === 'done' || agentEvent.type === 'error' || agentEvent.type === 'abort') {
        setIsGenerating(false);
        streamingBufferRef.current = '';
        streamingStepIdRef.current = null;
        streamingChatIdRef.current = null;
        if (agentEvent.type === 'error') {
          triggerToast(`Agent error: ${agentEvent.error || 'Unknown error'}`);
        }
      }
    };

    ipc.on('agent-event', handleAgentEvent);
    return () => {
      ipc.removeListener('agent-event', handleAgentEvent);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipc]);

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
          setActiveChatId('draft-chat');
          setDraftProject(defaultProject);
          setTrajectorySteps([]);
        }
      } else {
        setActiveChatId('draft-chat');
        setDraftProject('');
        setTrajectorySteps([]);
      }

      persistStore(loadedProviders, loadedModels, finalProjects, finalChats);

      // Load general settings from settings.json
      try {
        const settings = await ipc.invoke('settings-read');
        if (settings) {
          if (settings.theme?.desktop) {
            setThemeMode(settings.theme.desktop);
          }
          if (settings.general) {
            if (settings.general.workMode) setWorkMode(settings.general.workMode);
            if (settings.general.confirmShellCommands !== undefined) setDefaultPermissions(settings.general.confirmShellCommands);
            if (settings.general.autoReviewPlan !== undefined) setAutoReview(settings.general.autoReviewPlan);
            if (settings.general.unsandboxedActions !== undefined) setFullAccess(settings.general.unsandboxedActions);
          }
        }
      } catch (err) {
        console.error('Failed to load general settings:', err);
      } finally {
        setSettingsHydrated(true);
      }

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
  const [navigationHistory, setNavigationHistory] = useState<NavigationSnapshot[]>([]);
  const [navigationIndex, setNavigationIndex] = useState<number>(-1);
  const restoringNavigationRef = useRef(false);

  const snapshotsEqual = (left: NavigationSnapshot, right: NavigationSnapshot) =>
    left.activeTab === right.activeTab &&
    left.settingsCategory === right.settingsCategory &&
    left.activeProject === right.activeProject &&
    left.activeChatId === right.activeChatId &&
    left.activeDiff?.filename === right.activeDiff?.filename &&
    left.activeDiff?.originalCode === right.activeDiff?.originalCode &&
    left.activeDiff?.modifiedCode === right.activeDiff?.modifiedCode;

  useEffect(() => {
    if (restoringNavigationRef.current) {
      restoringNavigationRef.current = false;
      return;
    }

    const snapshot: NavigationSnapshot = {
      activeTab,
      settingsCategory,
      activeProject,
      activeChatId,
      activeDiff
    };

    setNavigationHistory(prev => {
      const current = navigationIndex >= 0 ? prev[navigationIndex] : null;
      if (current && snapshotsEqual(current, snapshot)) {
        return prev;
      }

      const next = navigationIndex >= 0 ? prev.slice(0, navigationIndex + 1) : [];
      next.push(snapshot);
      setNavigationIndex(next.length - 1);
      return next;
    });
  }, [activeTab, settingsCategory, activeProject, activeChatId, activeDiff, navigationIndex]);

  const restoreNavigationSnapshot = (snapshot: NavigationSnapshot) => {
    restoringNavigationRef.current = true;
    setActiveTab(snapshot.activeTab);
    setSettingsCategory(snapshot.settingsCategory);
    setActiveProject(snapshot.activeProject);
    setActiveChatId(snapshot.activeChatId);
    setActiveDiff(snapshot.activeDiff);

    if (snapshot.activeChatId) {
      const chat = chats.find(c => c.id === snapshot.activeChatId);
      setTrajectorySteps(chat?.steps || []);
    }
  };

  const handleNavigateBack = () => {
    if (navigationIndex <= 0) return;
    const nextIndex = navigationIndex - 1;
    const snapshot = navigationHistory[nextIndex];
    if (!snapshot) return;
    setNavigationIndex(nextIndex);
    restoreNavigationSnapshot(snapshot);
  };

  const handleNavigateForward = () => {
    if (navigationIndex < 0 || navigationIndex >= navigationHistory.length - 1) return;
    const nextIndex = navigationIndex + 1;
    const snapshot = navigationHistory[nextIndex];
    if (!snapshot) return;
    setNavigationIndex(nextIndex);
    restoreNavigationSnapshot(snapshot);
  };

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

  const triggerToast = (message: string, type: 'info' | 'error' = 'info') => {
    // Auto-detect error type if not explicitly set
    const detectedType = type === 'error' || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('unsupported')
      ? 'error'
      : 'info';
    setToastMessage(message);
    setToastType(detectedType);
    setToastOpen(true);
  };

  useEffect(() => {
    if (toastOpen) {
      const duration = toastType === 'error' ? 10000 : 2500;
      const timer = setTimeout(() => {
        setToastOpen(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toastOpen, toastType]);

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

  const addAttachmentStep = (filename: string, fullPath: string) => {
    setChats(prevChats => {
      const updatedChats = prevChats.map(c => {
        if (c.id === activeChatId) {
          const attachStep: TrajectoryStep = {
            id: `attach-${Date.now()}-${Math.random()}`,
            type: 'user',
            content: `📎 Attached context: ${filename}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            metadata: {
              mediaType: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : filename.toLowerCase().endsWith('.ppt') ? 'ppt' : 'image',
              mediaPath: fullPath
            }
          };
          const updatedSteps = [...c.steps, attachStep];
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
  };

  const handleAttachFiles = async () => {
    try {
      const filePaths: string[] = await ipc?.invoke('select-files');
      if (filePaths && filePaths.length > 0) {
        const newAttachments = filePaths.map(filePath => {
          const filename = filePath.split(/[\\/]/).pop() || 'file';
          return { filename, sourcePath: filePath };
        });
        setComposerAttachments(prev => [...prev, ...newAttachments]);
        triggerToast(`Attached ${newAttachments.length} file(s) to draft`);
      }
    } catch (e) {
      console.error('Failed to attach files', e);
      triggerToast('Error attaching files');
    }
  };

  const handleAttachPastedFiles = async (files: FileList) => {
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;

        if (filePath) {
          const filename = filePath.split(/[\\/]/).pop() || 'file';
          setComposerAttachments(prev => [...prev, { filename, sourcePath: filePath }]);
          triggerToast(`Attached: ${filename}`);
        } else {
          const buffer = await file.arrayBuffer();
          const uint8 = new Uint8Array(buffer);
          const filename = file.name || `pasted-media-${Date.now()}.png`;
          setComposerAttachments(prev => [...prev, { filename, buffer: Array.from(uint8) }]);
          triggerToast(`Attached pasted image`);
        }
      }
    } catch (e) {
      console.error('Failed to attach pasted files', e);
      triggerToast('Error attaching pasted file');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setComposerAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const simulateAgentResponse = (
    prompt: string,
    chatId: string,
    initialSteps: TrajectoryStep[],
    projectScope: string,
    selectedModel: string,
    savedAttachments: { filename: string; fullPath: string }[] = [],
    startTime: number = Date.now()
  ) => {
    setIsGenerating(true);
    let currentSteps = [...initialSteps];

    const updateChatSteps = (nextSteps: TrajectoryStep[]) => {
      currentSteps = nextSteps;
      setTrajectorySteps(nextSteps);
      setChats(prev => {
        const next = prev.map(c => {
          if (c.id === chatId) {
            return { ...c, steps: nextSteps };
          }
          return c;
        });
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });
    };

    setTimeout(() => {
      const lower = prompt.toLowerCase();
      const isSummarizeRequest = lower.includes('summarise') || lower.includes('summary') || lower.includes('summarize');

      if (savedAttachments.length > 0) {
        const fileNamesList = savedAttachments.map(a => `\`${a.filename}\``).join(', ');
        const firstFile = savedAttachments[0];

        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: isSummarizeRequest
            ? `Detected document summary request for ${firstFile.filename}. Invoking document reader and layout parser to extract text contents...`
            : `Detected ${savedAttachments.length} uploaded attachment(s): [${fileNamesList}]. Invoking parsing pipeline to inspect file data and structure...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const isImage = firstFile.filename.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
          const toolStep: TrajectoryStep = {
            id: `sim-tool-${Date.now()}`,
            type: 'tool_call',
            toolName: isSummarizeRequest ? 'view_file' : (isImage ? 'generate_image' : 'replace_file_content'),
            status: 'success',
            content: isSummarizeRequest
              ? `Successfully parsed text contents from ${firstFile.filename}. Extracted 23 pages of text.`
              : (isImage 
                ? `Inspected image visual layout coordinates in ${firstFile.filename}. Visual inspection completed.`
                : `Successfully parsed document content from ${firstFile.filename}. Matched reference symbols with local project index.`),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          updateChatSteps([...currentSteps, toolStep]);

          setTimeout(() => {
            let contentResult = '';

            if (isSummarizeRequest) {
              const isMillionaire = firstFile.filename.toLowerCase().includes('millionaire') || prompt.toLowerCase().includes('millionaire');
              if (isMillionaire) {
                contentResult = `Here is a comprehensive summary of the attached ebook **Faceless Millionaire: 20 Most Profitable Faceless YouTube Channel Ideas with AI in 2024**:

### 📘 Executive Summary
This ebook serves as a step-by-step blueprint for digital entrepreneurs to launch and monetize highly profitable faceless YouTube channels leveraging generative AI. It highlights how content creators can achieve significant financial returns without disclosing their identity.

### 🎥 Key Niches Covered:
1. **AI-Driven Gaming & Walkthroughs**: AI-assisted gameplay analysis, walkthroughs, and cheat codes.
2. **AI-Generated Cooking Tutorials**: Tailored AI-generated recipes, cooking techniques, and culinary experiments.
3. **AI-Powered Fitness Coaching**: Tailored exercise routines and workouts.
4. **AI Language Hub**: Pronunciation drills and learning paths.
5. **Music Production Studio**: AI-generated ambient tracks, remixes, and energetic beats.
6. **Fashion Styling**: Dynamic outfit recommendations and style guides.
7. **Virtual Travel Exploration**: Immersive landmark tours and guides.
8. **Educational Platforms**: Custom tutorial lessons.
9. **Comedy & Entertainment**: Generative humor sketches.
10. **Personal Development**: Motivational speeches and growth strategies.
11. **Artistic Creations**: Abstract generative art and sculptures.
12. **Health & Wellness**: Mindfulness exercises and lifestyle tips.
13. **News & Information**: Investigative reports and current events updates.
14. **Product Reviews**: Automated shopping guides and comparisons.
15. **Finance & Investments**: Data-driven portfolio management tips.
16. **DIY & Craft Projects**: Craft ideas and home decor walkthroughs.
17. **Mental Health Support**: Coping mechanisms and anonymous peer support.
18. **Parenting Advice**: Automated child developmental insights.
19. **Wildlife & Nature**: Cinematic documentaries and environmental highlights.
20. **Mystery & Investigation**: detective stories and crime reconstructions.

### 🚀 Core Strategy for Success:
- **Automation Pipeline**: Use AI systems for scriptwriting (ChatGPT/Claude), voiceovers, and asset production.
- **Scalability**: Anonymity combined with automated production workflows is the key to scaling content creation in 2024.`;
              } else {
                contentResult = `Here is the summary of the parsed document **${firstFile.filename}**:\n\nThe document details various conceptual methodologies, AI tool integrations, and automation workflows. Key takeaways include leveraging modern AI models for text parsing, media rendering, and local codebase synchronization.`;
              }
            } else {
              contentResult = `I have parsed the attached file **${firstFile.filename}**.\n\n${
                isImage 
                  ? `Visual inspection confirms that the layout coordinates and pixel alignments are rendered correctly. The details are registered to guide our modifications.`
                  : `Document specifications are registered. I will align the local code modifications with these requirements.`
              }`;
            }

            const assistantStep: TrajectoryStep = {
              id: `sim-assistant-${Date.now()}`,
              type: 'assistant',
              content: contentResult,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setIsGenerating(false);
            updateChatSteps([...currentSteps, assistantStep]);
          }, 1200);
        }, 1200);

      } else if (isSummarizeRequest) {
        // Summarize request but without attachments
        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: 'No attachments found. Checking active workspace files for text logs or document summaries...',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const assistantStep: TrajectoryStep = {
            id: `sim-assistant-${Date.now()}`,
            type: 'assistant',
            content: 'Please attach a document or PDF file (such as `Faceless Millionaire.pdf`) for me to read and summarize directly.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setIsGenerating(false);
          updateChatSteps([...currentSteps, assistantStep]);
        }, 1200);

      } else if (lower.includes('image') || lower.includes('video') || lower.includes('media') || lower.includes('asset')) {
        // Simulation of Multimodal Image/Video Generation
        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: 'Coding Agent analyzed prompt. Invoking local multimodal image rendering pipeline with parameters: aspect_ratio=16:9, steps=30, style=high-contrast.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const toolStep: TrajectoryStep = {
            id: `sim-tool-${Date.now()}`,
            type: 'tool_call',
            toolName: 'generate_image',
            status: 'success',
            content: 'Image successfully generated. Saved to chat context assets.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          updateChatSteps([...currentSteps, toolStep]);

          setTimeout(() => {
            const assistantStep: TrajectoryStep = {
              id: `sim-assistant-${Date.now()}`,
              type: 'assistant',
              content: 'I have successfully generated the premium layout visualization. You can click to open or view the media file in your default system player.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              metadata: {
                mediaType: 'image',
                mediaPath: 'C:/Users/anind/OneDrive/Pictures/mockup.png'
              }
            };
            setIsGenerating(false);
            updateChatSteps([...currentSteps, assistantStep]);
          }, 1200);
        }, 1200);

      } else if (lower.includes('code') || lower.includes('write') || lower.includes('build') || lower.includes('react') || lower.includes('bug')) {
        // Simulation of Coding Agent writing codes
        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: `Scanning file path structure in project workspace [${projectScope || 'Standalone'}]. Locating target files and computing token maps.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const toolStep: TrajectoryStep = {
            id: `sim-tool-${Date.now()}`,
            type: 'tool_call',
            toolName: 'replace_file_content',
            status: 'success',
            content: 'Applied contiguous replacement patch to desktop/src/renderer/App.tsx.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            metadata: {
              filename: 'App.tsx',
              originalCode: 'const activeTab = "general";',
              modifiedCode: 'const activeTab = "trajectory";'
            }
          };
          updateChatSteps([...currentSteps, toolStep]);

          setTimeout(() => {
            const buildStep: TrajectoryStep = {
              id: `sim-tool-build-${Date.now()}`,
              type: 'tool_call',
              toolName: 'run_command',
              status: 'success',
              content: 'npm run build output: tailwindcss compiled successfully. tsc type-checks passed.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            updateChatSteps([...currentSteps, buildStep]);

            setTimeout(() => {
              const assistantStep: TrajectoryStep = {
                id: `sim-assistant-${Date.now()}`,
                type: 'assistant',
                content: 'I have modified `App.tsx` to automatically redirect the active tab to the trajectory execution screen on startup. Verified compilation succeeds.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              };
              setIsGenerating(false);
              updateChatSteps([...currentSteps, assistantStep]);
            }, 1000);
          }, 1200);
        }, 1200);

      } else if (lower.includes('who') || lower.includes('name') || lower.includes('profile') || lower.includes('memory') || lower.includes('preference')) {
        // Simulation of memory & profile searching
        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: 'Personal preference prompt detected. Querying memory profile via REST endpoint first per priority rule.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const toolStep: TrajectoryStep = {
            id: `sim-tool-${Date.now()}`,
            type: 'tool_call',
            toolName: 'search_memory',
            status: 'success',
            content: 'Found 1 memory block: "User studies CSE, resides in West Bengal, prefers clean, modern layouts and dark glassmorphic themes."',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          updateChatSteps([...currentSteps, toolStep]);

          setTimeout(() => {
            const assistantStep: TrajectoryStep = {
              id: `sim-assistant-${Date.now()}`,
              type: 'assistant',
              content: 'According to your personal memories, you are a Computer Science student. You favor glassmorphism styles, dark palettes, and high performance desktop wrappers.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setIsGenerating(false);
            updateChatSteps([...currentSteps, assistantStep]);
          }, 1200);
        }, 1200);

      } else {
        // Standard chatting response
        const thoughtStep: TrajectoryStep = {
          id: `sim-thought-${Date.now()}`,
          type: 'thought',
          content: 'Formulating structured markdown reply with available model credentials and MCP bindings.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updateChatSteps([...currentSteps, thoughtStep]);

        setTimeout(() => {
          const assistantStep: TrajectoryStep = {
            id: `sim-assistant-${Date.now()}`,
            type: 'assistant',
            content: `I am connected and ready. I can write and compile code, interface with your local filesystem via MCP tool servers, query your memory profiles, and manage/preview your uploaded image and video assets. How should we proceed?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setIsGenerating(false);
          updateChatSteps([...currentSteps, assistantStep]);
        }, 1200);
      }
    }, 1000);
  };

  const handleSendPrompt = async (prompt: string, options: ComposerOptions) => {
    setComposerPrompt('');
    const attachmentsToSave = [...composerAttachments];
    setComposerAttachments([]);

    let chatId = activeChatId;
    let projectScope = activeProject;
    let isNew = false;
    let chatTitle = '';

    if (chatId === 'draft-chat') {
      isNew = true;
      chatTitle = prompt.length > 25 ? prompt.slice(0, 25).trim() + '...' : prompt.trim();
      const sanitized = sanitizeFolderName(chatTitle);
      let uniqueChatId = sanitized;
      let counter = 1;
      while (chats.some(c => c.id === uniqueChatId)) {
        uniqueChatId = `${sanitized}-${counter}`;
        counter++;
      }
      chatId = uniqueChatId;
      projectScope = draftProject || '';
    }

    if (!chatId) return;

    // Process and copy attachments to the resolved folder via Electron IPC
    const savedAttachments: { filename: string; fullPath: string }[] = [];
    for (const att of attachmentsToSave) {
      try {
        if (att.sourcePath) {
          const res = await ipc?.invoke('copy-file-to-chat', {
            sourcePath: att.sourcePath,
            chatId: chatId,
            projectName: projectScope
          });
          if (res) {
            savedAttachments.push({ filename: res.filename, fullPath: res.fullPath });
          }
        } else if (att.buffer) {
          const res = await ipc?.invoke('save-chat-media-buffer', {
            buffer: att.buffer,
            filename: att.filename,
            chatId: chatId,
            projectName: projectScope
          });
          if (res) {
            savedAttachments.push({ filename: res.filename, fullPath: res.fullPath });
          }
        }
      } catch (err) {
        console.error('Failed to copy attachment in handleSendPrompt', err);
      }
    }

    const userStep: TrajectoryStep = {
      id: `step-user-${Date.now()}`,
      type: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const attachmentSteps: TrajectoryStep[] = savedAttachments.map((att, idx) => ({
      id: `attach-${Date.now()}-${idx}-${Math.random()}`,
      type: 'user' as const,
      content: `📎 Attached context: ${att.filename}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: {
        mediaType: att.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : att.filename.toLowerCase().endsWith('.ppt') ? 'ppt' : 'image' as any,
        mediaPath: att.fullPath
      }
    }));

    const combinedSteps = [userStep, ...attachmentSteps];

    // Determine if we have real provider credentials
    const activeProvider = connectedProviders.find(p => {
      const modelName = options.model || '';
      return modelsCatalog.some(m => m.providerId === p.id && m.name === modelName && m.enabled);
    }) || connectedProviders[0];

    const hasRealCredentials = Boolean(activeProvider?.apiKey);

    if (isNew) {
      const newChat: StoredChat = {
        id: chatId,
        title: chatTitle,
        project: projectScope,
        model: options.model,
        timestamp: new Date().toLocaleDateString(),
        steps: combinedSteps
      };

      setChats(prev => {
        const next = [newChat, ...prev];
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });

      setActiveChatId(chatId);
      setActiveProject(projectScope);
      setTrajectorySteps(combinedSteps);
    } else {
      const updatedSteps = [...trajectorySteps, userStep, ...attachmentSteps];
      setTrajectorySteps(updatedSteps);
      setChats(prev => {
        const next = prev.map(c => {
          if (c.id === chatId) {
            return { ...c, steps: updatedSteps };
          }
          return c;
        });
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });
    }

    setIsGenerating(true);

    // ── Route to real AI or simulation ──────────────────────────────────────
    if (hasRealCredentials && ipc) {
      // Real AI: call main process agent runner
      streamingChatIdRef.current = chatId;
      streamingBufferRef.current = '';
      streamingStepIdRef.current = null;

      // Collect all attachment paths from this chat's history (previous + new)
      const allAttachmentPaths: string[] = [];
      // From existing trajectory steps
      const allSteps = [...trajectorySteps, userStep, ...attachmentSteps];
      for (const step of allSteps) {
        if (step.metadata?.mediaPath) {
          allAttachmentPaths.push(step.metadata.mediaPath as string);
        }
      }
      // Add any newly uploaded attachments from this send
      for (const att of savedAttachments) {
        if (!allAttachmentPaths.includes(att.fullPath)) {
          allAttachmentPaths.push(att.fullPath);
        }
      }

      // Resolve project root — use first folder of the active project if set
      const activeProjectConfig = projects.find(p => p.name === projectScope);
      const resolvedProjectRoot = activeProjectConfig?.folders?.[0] || undefined;

      const sessionId = `session-${chatId}`;
      const agentConfig = {
        provider: (activeProvider.type === 'env' || activeProvider.type === 'key'
          ? activeProvider.id
          : 'custom') as 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom',
        apiKey: activeProvider.apiKey,
        baseUrl: activeProvider.baseUrl || undefined,
        model: options.model || '',
        projectRoot: resolvedProjectRoot,
        attachments: allAttachmentPaths.length > 0 ? allAttachmentPaths : undefined
      };

      // Non-blocking: events come back via 'agent-event' IPC listener
      ipc.invoke('agent-run', { sessionId, prompt, config: agentConfig }).catch((err: Error) => {
        triggerToast(`Failed to start agent: ${err.message}`);
        setIsGenerating(false);
      });

    } else {
      // Simulation fallback (no real credentials configured yet)
      // Add thought step for the simulation
      const thoughtStep: TrajectoryStep = {
        id: `step-thought-${Date.now()}`,
        type: 'thought',
        content: hasRealCredentials
          ? `Streaming from ${activeProvider?.name || 'provider'} using model ${options.model}...`
          : `Demo mode — configure a provider in Settings to use real AI. Simulating response for: "${prompt.slice(0, 40)}..."`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: { workedDuration: '0s' }
      };
      setTrajectorySteps(prev => [...prev, thoughtStep]);
      setChats(prev => {
        const next = prev.map(c => {
          if (c.id === chatId) return { ...c, steps: [...c.steps, thoughtStep] };
          return c;
        });
        persistStore(connectedProviders, modelsCatalog, projects, next);
        return next;
      });

      const startTime = Date.now();
      simulateAgentResponse(prompt, chatId, isNew
        ? [...combinedSteps, thoughtStep]
        : [...trajectorySteps, userStep, ...attachmentSteps, thoughtStep],
        projectScope, options.model, savedAttachments, startTime);
    }
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
      setActiveChatId('draft-chat');
      setDraftProject(project);
      setTrajectorySteps([]);
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
    const targetProject = forProject !== undefined ? forProject : activeProject;
    setActiveProject(targetProject || '');
    setDraftProject(targetProject || '');
    setActiveChatId('draft-chat');
    setTrajectorySteps([]);
    setActiveTab('trajectory');
  };

  const handleUndoStep = (stepId: string) => {
    setChats(prevChats => {
      const chat = prevChats.find(c => c.id === activeChatId);
      if (!chat) return prevChats;

      const idx = chat.steps.findIndex(s => s.id === stepId);
      if (idx === -1) return prevChats;

      const nextSteps = chat.steps.slice(0, idx);
      setTrajectorySteps(nextSteps);

      const nextChats = prevChats.map(c =>
        c.id === activeChatId ? { ...c, steps: nextSteps } : c
      );
      persistStore(connectedProviders, modelsCatalog, projects, nextChats);
      return nextChats;
    });
    triggerToast('Conversation rolled back');
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
        onMenuClick={triggerToast}
        onNavigateBack={handleNavigateBack}
        onNavigateForward={handleNavigateForward}
        canNavigateBack={navigationIndex > 1}
        canNavigateForward={navigationIndex >= 0 && navigationIndex < navigationHistory.length - 1}
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
              onUndoStep={handleUndoStep}
              onAttachClick={handleAttachFiles}
              onAttachPastedFiles={handleAttachPastedFiles}
              composerAttachments={composerAttachments}
              onRemoveAttachment={handleRemoveAttachment}
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
              workMode={workMode}
              onWorkModeChange={handleWorkModeChange}
              confirmShellCommands={defaultPermissions}
              onConfirmShellCommandsChange={handleConfirmShellCommandsChange}
              autoReviewPlan={autoReview}
              onAutoReviewPlanChange={handleAutoReviewPlanChange}
              unsandboxedActions={fullAccess}
              onUnsandboxedActionsChange={handleUnsandboxedActionsChange}
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

      <AppToast open={toastOpen} message={toastMessage} type={toastType} onClose={() => setToastOpen(false)} />
    </div>
  );
};
