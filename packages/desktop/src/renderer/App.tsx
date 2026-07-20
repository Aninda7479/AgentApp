import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Sidebar } from './pages/Workspace/Sidebar';
import { TrajectoryStep } from './pages/Workspace/TrajectoryCanvas';
import { ComposerOptions } from './logic/types';
import { DiffViewer } from './pages/Workspace/DiffViewer';
import { BYOKModal } from './pages/Settings/BYOKModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { DoctorModal } from './components/DoctorModal';
import { PermissionDialog } from './pages/Workspace/PermissionDialog';
import { MCPDashboard, MCPServerInfo } from './pages/Settings/MCPDashboard';
import { SearchModal } from './components/SearchModal';
import { ScheduledView } from './pages/Workspace/ScheduledView';
import { TasksPage } from './pages/Tasks/TasksPage';
import { SettingsView, ProviderConnection, ModelConfig } from './pages/Settings/SettingsView';
import type { InternetAccessLevel } from './pages/Settings/types';
import { CreateProjectModal } from './pages/Workspace/CreateProjectModal';
import { ConfigureProjectModal } from './pages/Workspace/ConfigureProjectModal';
import { ChatSettingsModal } from './pages/Workspace/ChatSettingsModal';
import { TitleBar } from './components/TitleBar';
import { AppToast } from './components/AppToast';
import { VoiceIndicator } from './components/VoiceIndicator';
import { WorkspaceView } from './pages/Workspace/WorkspaceView';
import { ProjectSettingsPage } from './pages/Workspace/ProjectSettingsPage';
import { StandaloneChatPage } from './pages/Workspace/StandaloneChatPage';
import { builtinSuggestions, SkillInfo } from './components/slashCommands';
import { BottomNav } from './components/BottomNav';
import { usePartners } from './pages/Settings/companion/library';
import { PartnerOverlay } from './partner-popup/PartnerOverlay';
import { ThreeDStudio } from './pages/Studio/ThreeDStudio';
import { StoredChat, StoredProject } from './types';
import { resolveScopeSettings } from './logic/scopeSettings';
import { SessionLoopManager, LoopTask } from './logic/loop';
import { useThemeMode } from './theme';
import { getRouteFromLocation, pushRoute, subscribeRouteChange, buildPath } from './urlSync';
import { getIpc } from './lib/electron';

// ── Logic layer (separated from design; see renderer/logic/*) ────────────────
import { FormatService } from './logic/format';
import { NavigationService } from './logic/navigation';
import { ErrorService } from './logic/errors';
import { StoreService } from './logic/store';
import { SettingsService } from './logic/settings';
import { ProvidersService } from './logic/providers';
import { McpService } from './logic/mcp';
import { AttachmentService } from './logic/attachments';
import { ConversationService } from './logic/conversation';
import { AgentService, StreamingRefs } from './logic/agent';
import { AgentStreamService } from './logic/agentStream';
import { WindowService } from './logic/window';
import { AccountService } from './logic/account';
import { PluginService } from './logic/plugin';
import { SlashRouter, SlashDeps } from './logic/slash';
import { PartnerSyncService } from './logic/partner';
import { UpdateService } from './logic/updates';
import type { PartnerController } from './logic/agentStream';
import type { AppContext, NavigationSnapshot } from './logic/types';
import type { ContextUsage } from './logic/context';

/**
 * Root application component — the DESIGN SHELL.
 *
 * It owns React state, the JSX layout, and the glue that wires DOM/IPC events
 * to the logic layer. All real work (store persistence, agent streaming, demo
 * simulation, slash routing, project/chat CRUD, settings, MCP, partner sync)
 * lives in documented classes under `renderer/logic/`. This component builds a
 * single `AppContext` (the bridge those classes call) and delegates every unit
 * of behavior to them, so the design code stays free of logic.
 */
export const App: React.FC = () => {
  // ── All React state is declared first (hooks order is stable) ──────────────
  const { themeMode, setThemeMode } = useThemeMode();
  const partners = usePartners();
  // Live mirror of `partners`, typed as the `PartnerController` slice the
  // streaming handler touches, so `AgentStreamService.createHandler` can read
  // the active Partner + import API without re-subscribing on every render.
  const partnersRef = useRef<PartnerController>(partners as PartnerController);
  partnersRef.current = partners;
  const [partnerVisible, setPartnerVisible] = useState<boolean>(true);
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [defaultPermissions, setDefaultPermissions] = useState<boolean>(true);
  const [autoReview, setAutoReview] = useState<boolean>(true);
  // Sandboxed by default: a fresh install must start confined to the project
  // folder, not with full system access. The user opts INTO full access.
  const [fullAccess, setFullAccess] = useState<boolean>(false);
  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);
  const [internetAccessLevel, setInternetAccessLevel] = useState<InternetAccessLevel>('all');
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<{
    status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error';
    version?: string;
    message?: string;
  } | null>(null);

  // URL-driven initial route (web: history path, desktop: file:// hash).
  const [initialRoute] = useState(() => getRouteFromLocation());
  const [activeTab, setActiveTab] = useState<string>(initialRoute.activeTab);
  // Whether the dedicated 3D Studio nav entry is shown: only when 3D Model Gen
  // is enabled AND its mode is "studio" (per the user's chat-vs-page decision).
  const [showStudio, setShowStudio] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [isBYOKOpen, setIsBYOKOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isDoctorOpen, setIsDoctorOpen] = useState<boolean>(false);
  const [pendingPermission, setPendingPermission] = useState<{
    id: string;
    sessionId: string;
    request: { action: string; command?: string; filePath?: string; details?: Record<string, unknown> };
  } | null>(null);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState<boolean>(false);
  const [settingsCategory, setSettingsCategory] = useState<string>(initialRoute.settingsCategory);
  const [activeProject, setActiveProject] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastOpen, setToastOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'info' | 'error'>('info');
  // Live context-window usage reported by the engine (null until a real agent
  // run streams a `context` event; the workspace falls back to a local estimate
  // in demo/simulation mode).
  const [liveContextUsage, setLiveContextUsage] = useState<ContextUsage | null>(null);
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
  const [activeChatId, setActiveChatId] = useState<string | null>(initialRoute.activeChatId);
  const [draftProject, setDraftProject] = useState<string>('');
  const [lastUsedModel, setLastUsedModel] = useState<string>('');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState<boolean>(false);
  const [isConfigureProjectOpen, setIsConfigureProjectOpen] = useState<boolean>(false);
  const [projectToConfigure, setProjectToConfigure] = useState<StoredProject | null>(null);
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState<boolean>(false);
  const [chatToConfigure, setChatToConfigure] = useState<StoredChat | null>(null);
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
  // True until the persisted store has been read at startup. While bootstrapping,
  // the catalog/providers are merely not-yet-loaded (not genuinely empty), so
  // panels must show a loading state rather than a false "nothing connected".
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);

  // Trajectory steps (the canvas)
  const [trajectorySteps, setTrajectorySteps] = useState<TrajectoryStep[]>([
    {
      id: 'step-1',
      type: 'assistant',
      content: 'SuperAgent initialized. Ready for autonomous software engineering and multimodal AI media generation.',
      timestamp: 'Just now'
    }
  ]);

  // Navigation history
  const [navigationHistory, setNavigationHistory] = useState<NavigationSnapshot[]>([]);
  const [navigationIndex, setNavigationIndex] = useState<number>(-1);
  const restoringNavigationRef = useRef(false);
  const [activeDiff, setActiveDiff] = useState<{ filename: string; originalCode: string; modifiedCode: string } | null>(null);

  // MCP + Plugin catalog state
  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([
    { id: 'mcp-1', name: 'FileSystem Server', transport: 'stdio', commandOrUrl: 'npx -y @modelcontextprotocol/server-filesystem ./', status: 'connected', enabled: true, toolsCount: 12, latencyMs: 14 },
    { id: 'mcp-2', name: 'Memory Knowledge Graph', transport: 'sse', commandOrUrl: 'http://localhost:19191/sse', status: 'connected', enabled: true, toolsCount: 5, latencyMs: 8 }
  ]);
  const [mcpCatalog, setMcpCatalog] = useState<any[]>([]);
  const [pluginCatalog, setPluginCatalog] = useState<any[]>([]);
  const [pluginEnabled, setPluginEnabled] = useState<Record<string, boolean>>({});

  // BYOK + discovered skills
  const [byokKeys] = useState<Record<string, string>>({ openai: '', anthropic: '', gemini: '' });
  const [skills, setSkills] = useState<(SkillInfo & { instructions?: string })[]>([]);
  // Curated "under development" skills (Settings → Skills only; never the slash surface).
  const [skillCatalog, setSkillCatalog] = useState<any[]>([]);

  // Resolve ipcRenderer safely
  const ipc = getIpc();
  const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');

  // ── Live-state mirror so logic classes can read fresh values ───────────────
  const stateRef = useRef({
    projects, chats, connectedProviders, modelsCatalog, mcpServers,
    activeChatId, activeProject, draftProject, internetAccessLevel, themeMode,
    composerAttachments, trajectorySteps, lastUsedModel,
    fullAccess, defaultPermissions
  });
  useEffect(() => {
    stateRef.current = {
      projects, chats, connectedProviders, modelsCatalog, mcpServers,
      activeChatId, activeProject, draftProject, internetAccessLevel, themeMode,
      composerAttachments, trajectorySteps, lastUsedModel,
      fullAccess, defaultPermissions
    };
  });

  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  const streamingChatIdRef = useRef<string | null>(null);
  const streamingBufferRef = useRef<string>('');
  const streamingStepIdRef = useRef<string | null>(null);
  const streaming: StreamingRefs = { chatIdRef: streamingChatIdRef, bufferRef: streamingBufferRef, stepIdRef: streamingStepIdRef };
  const popoverRef = useRef<HTMLDivElement>(null);
  const sendPromptRef = useRef<(raw: string, options: ComposerOptions) => Promise<void>>(async () => { });

  // ── Composite helpers owned by the shell ───────────────────────────────────
  const persistStore = useCallback(
    (providers: ProviderConnection[], models: ModelConfig[], currentProjects?: StoredProject[], currentChats?: StoredChat[]) => {
      ipc?.invoke('store-write', {
        connectedProviders: providers,
        modelsCatalog: models,
        projects: currentProjects ?? stateRef.current.projects,
        chats: currentChats ?? stateRef.current.chats
      });
    },
    [ipc]
  );

  const triggerToast = useCallback((message: string, type?: 'info' | 'error') => {
    const detected = type ?? FormatService.detectToastType(message);
    setToastMessage(message);
    setToastType(detected);
    setToastOpen(true);
  }, []);

  // The bridge all logic classes receive.
  const ctx: AppContext = useMemo(
    () => ({
      ipc,
      getProjects: () => stateRef.current.projects,
      getChats: () => stateRef.current.chats,
      getConnectedProviders: () => stateRef.current.connectedProviders,
      getModelsCatalog: () => stateRef.current.modelsCatalog,
      getMcpServers: () => stateRef.current.mcpServers,
      getActiveChatId: () => stateRef.current.activeChatId,
      getActiveProject: () => stateRef.current.activeProject,
      getDraftProject: () => stateRef.current.draftProject,
      getInternetAccessLevel: () => stateRef.current.internetAccessLevel,
      getFullAccess: () => stateRef.current.fullAccess,
      getDefaultPermissions: () => stateRef.current.defaultPermissions,
      getThemeMode: () => stateRef.current.themeMode,
      getComposerAttachments: () => stateRef.current.composerAttachments,
      getTrajectorySteps: () => stateRef.current.trajectorySteps,
      getLastUsedModel: () => stateRef.current.lastUsedModel,
      setProjects, setChats, setConnectedProviders, setModelsCatalog, setTrajectorySteps,
      setActiveChatId, setActiveProject, setDraftProject, setActiveTab, setSettingsCategory, setActiveDiff,
      setToastMessage, setToastType, setToastOpen, setNavigationHistory, setNavigationIndex, setMcpServers,
      setPluginEnabled, setIsGenerating, setThemeMode, setWorkMode, setDefaultPermissions, setAutoReview,
      setFullAccess, setInternetAccessLevel, setLastUsedModel, setUpdateStatus, setComposerPrompt, setComposerAttachments,
      persistStore,
      triggerToast
    }),
    // Setters are stable; getters read stateRef. Only ipc / composites matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ipc, persistStore, triggerToast]
  );

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const defaultComposerModel = lastUsedModel || modelsCatalog.find((m) => m.enabled)?.name || '';

  // Resolve the effective sandbox + internet default for the active chat/project
  // so the composer's controls can be seeded from it (settings = default,
  // composer = per-send override per the approved plan).
  const resolvedScope = useMemo(() => {
    const project = projects.find((p) => p.name === activeProject) || null;
    return resolveScopeSettings({
      chat: activeChat,
      project,
      globalUnsandboxed: fullAccess,
      globalInternet: internetAccessLevel
    });
    // recompute when the active scope or the global fallbacks change.
  }, [activeChat, activeProject, projects, fullAccess, internetAccessLevel]);

  // Seed the composer's sandbox badge from the resolved default whenever the
  // active chat/project changes. The user can still toggle it per send.
  useEffect(() => {
    setFullAccess(resolvedScope.unsandboxed);
  }, [resolvedScope.unsandboxed]);
  const resolvedDefaultApproval = resolvedScope.approval;
  const isWebMode = !isElectron;
  const slashCommands = useMemo(() => builtinSuggestions(), []);

  // Skill catalog offered to the Project Settings + Standalone Chat pages as
  // project-only / chat-only skills (deduped by id).
  const availableSkills = useMemo(() => {
    const all = [...skills, ...skillCatalog].map((s: any) => ({ id: s.id, name: s.name }));
    const seen = new Set<string>();
    return all.filter((s) => {
      if (!s.id) return false;
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [skills, skillCatalog]);

  const loopManagerRef = useRef<SessionLoopManager | null>(null);
  const [, setActiveLoopsList] = useState<LoopTask[]>([]);

  const getWorkspacePath = (): string | undefined => {
    const activeName = stateRef.current.activeProject;
    const project = stateRef.current.projects.find(p => p.name === activeName);
    return project?.folders?.[0];
  };

  const startLoop = useCallback((prompt?: string, interval?: string): string => {
    if (!loopManagerRef.current) {
      loopManagerRef.current = new SessionLoopManager((task) => {
        const activeModel = stateRef.current.lastUsedModel || 'default';
        void sendPromptRef.current(task.prompt, { model: activeModel, mode: 'chat', attachments: [] });
      }, getWorkspacePath);
    }
    void loopManagerRef.current.start(interval, prompt).then((task) => {
      setActiveLoopsList(loopManagerRef.current!.getTasks());
      return task.id;
    });
    return ''; // task id is assigned asynchronously; callers that need it await start()
  }, []);

  const stopLoop = useCallback((id: string): boolean => {
    if (!loopManagerRef.current) return false;
    const ok = loopManagerRef.current.stop(id);
    setActiveLoopsList(loopManagerRef.current.getTasks());
    return ok;
  }, []);

  const listLoops = useCallback(() => {
    if (!loopManagerRef.current) return [];
    return loopManagerRef.current.getTasks();
  }, []);

  const clearLoops = useCallback(() => {
    if (loopManagerRef.current) {
      loopManagerRef.current.clear();
    }
    setActiveLoopsList([]);
  }, []);

  const slashDepsRef = useRef<SlashDeps | null>(null);

  const runLoopX = useCallback(async (prompt: string, count: number): Promise<void> => {
    const activeModel = stateRef.current.lastUsedModel || 'default';
    for (let i = 0; i < count; i++) {
      triggerToast(`[Loop-X] Starting iteration ${i + 1} of ${count}`);
      await sendPromptRef.current(prompt, { model: activeModel, mode: 'chat', attachments: [] });
      if (slashDepsRef.current) {
        await SlashRouter.dispatch(ctx, SlashRouter.parse('/compact'), { model: activeModel, mode: 'chat', attachments: [] }, slashDepsRef.current);
      }
    }
  }, [ctx, triggerToast]);

  useEffect(() => {
    return () => {
      if (loopManagerRef.current) {
        loopManagerRef.current.clear();
      }
    };
  }, []);

  // ── Slash-command dispatch wiring ──────────────────────────────────────────
  const slashDeps = useMemo<SlashDeps>(
    () => {
      const deps: SlashDeps = {
        skills,
        sendPrompt: (raw, opts) => sendPromptRef.current(raw, opts),
        openConfigureProject: () => setIsConfigureProjectOpen(true),
        openDoctor: () => setIsDoctorOpen(true),
        openSearch: () => setSearchModalOpen(true),
        openShortcuts: () => setIsShortcutsOpen(true),
        openCreateProject: () => setIsCreateProjectOpen(true),
        startLoop,
        stopLoop,
        listLoops,
        clearLoops,
        runLoopX,
        seedComposer: (text: string) => setComposerPrompt(text),
        is3dEnabled: showStudio
      };
      slashDepsRef.current = deps;
      return deps;
    },
    [skills, startLoop, stopLoop, listLoops, clearLoops, runLoopX, showStudio]
  );
  const slashDispatch = useCallback(
    (raw: string, options: ComposerOptions) => SlashRouter.dispatch(ctx, SlashRouter.parse(raw), options, slashDeps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, slashDeps]
  );
  const handleSendPrompt = useCallback(
    async (prompt: string, options: ComposerOptions) => {
      await AgentService.sendPrompt(ctx, prompt, options, streaming, slashDispatch);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, streaming, slashDispatch]
  );
  sendPromptRef.current = handleSendPrompt;

  // Triggered by clicking the context-usage ring in the workspace header.
  const handleCompactRequest = useCallback(() => {
    slashDispatch('/compact', { model: defaultComposerModel, mode: 'chat', attachments: [] });
  }, [slashDispatch, defaultComposerModel]);

  // Re-send the last user message of the active chat (Retry on a failed run).
  const handleRetryLast = useCallback(async () => {
    const chat = ctx.getChats().find((c) => c.id === ctx.getActiveChatId());
    const lastUserStep = [...(chat?.steps ?? [])].reverse().find((s) => s.type === 'user');
    if (!lastUserStep) return;
    const prompt = lastUserStep.content;
    const model = chat?.model || lastUsedModel;
    await handleSendPrompt(prompt, { model: model || undefined, attachments: [] });
  }, [ctx, handleSendPrompt, lastUsedModel]);

  // ── Settings toggles (mirror state + persist) ──────────────────────────────
  const handleWorkModeChange = (mode: 'coding' | 'everyday') => {
    setWorkMode(mode);
    SettingsService.writeWorkMode(ctx, mode);
  };
  const handleConfirmShellCommandsChange = (val: boolean) => {
    setDefaultPermissions(val);
    SettingsService.writeConfirmShell(ctx, val);
  };
  const handleAutoReviewPlanChange = (val: boolean) => {
    setAutoReview(val);
    SettingsService.writeAutoReview(ctx, val);
  };
  const handleUnsandboxedActionsChange = (val: boolean) => {
    setFullAccess(val);
    SettingsService.writeUnsandboxed(ctx, val);
  };
  const handleInternetAccessLevelChange = (level: InternetAccessLevel) => {
    setInternetAccessLevel(level);
    SettingsService.writeInternet(ctx, level);
  };

  // ── Provider / model management ────────────────────────────────────────────
  const handleConnectProvider = (provider: ProviderConnection, newModels: ModelConfig[]) =>
    ProvidersService.connect(ctx, provider, newModels);
  const handleDisconnectProvider = (providerId: string) => ProvidersService.disconnect(ctx, providerId);
  const handleToggleModel = (modelId: string) => ProvidersService.toggleModel(ctx, modelId);

  // ── MCP servers ────────────────────────────────────────────────────────────
  const handleAddMcpServer = (newServer: Partial<MCPServerInfo>) => McpService.add(ctx, newServer);
  const handleRemoveMcpServer = (id: string) => McpService.remove(ctx, id);
  const handleToggleMcpServer = (id: string, enabled: boolean) => McpService.toggle(ctx, id, enabled);
  const handleInstallCatalogServer = (entry: any, keys: Record<string, string>) =>
    McpService.installCatalog(ctx, entry, keys);

  // ── Plugins ────────────────────────────────────────────────────────────────
  const handleTogglePlugin = (id: string, enabled: boolean) => PluginService.toggle(ctx, id, enabled);

  // ── Window controls / stop / quit (delegate to logic classes) ──────────────
  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => WindowService.control(action);
  const handleStopActiveRun = () => AgentService.stopRun(ctx, ctx.getActiveChatId());
  const handleQuit = () => WindowService.control('close');
  const handleAbout = () => {
    setActiveTab('settings');
    setSettingsCategory('about');
  };

  // ── Project / chat CRUD (delegates to ConversationService) ─────────────────
  const handleCreateProject = (newProj: StoredProject) => ConversationService.createProject(ctx, newProj);
  const handleSaveProjectConfig = (updatedProj: StoredProject) => ConversationService.saveProjectConfig(ctx, updatedProj);
  const handleDeleteProject = (projectName: string) => ConversationService.deleteProject(ctx, projectName);
  const handleSelectProject = (project: string) => ConversationService.selectProject(ctx, project);
  const handleSelectChat = (chatId: string) => ConversationService.selectChat(ctx, chatId);
  const handleDeleteChat = (chatId: string) => ConversationService.deleteChat(ctx, chatId);
  const handleNewChat = (forProject?: string) => ConversationService.newChat(ctx, forProject);
  const handleUndoStep = (stepId: string) => ConversationService.undoStep(ctx, stepId);
  const handleReviewDiff = (filename: string) => ConversationService.reviewDiff(ctx, filename);
  const handleSelectSearchChat = (chatTitle: string, projectContext?: string) =>
    ConversationService.selectSearchChat(ctx, chatTitle, projectContext);

  // ── Compose-and-send helpers (bridge to sendPrompt) ────────────────────────
  const handleCreateTaskFromChat = (taskType: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Create a scheduled task: ${taskType}`, { model: defaultComposerModel, mode: 'plan', attachments: [] });
  };
  const handleUseTemplate = (templateName: string, cronExpr: string) => {
    setActiveTab('trajectory');
    handleSendPrompt(`Initialize template "${templateName}" with cron "${cronExpr}"`, { model: defaultComposerModel, mode: 'plan', attachments: [] });
  };

  // ── Start an autonomous agent session on a Kanban task ─────────────────────
  const handleStartWorkOnTask = useCallback(
    async (card: { id: string; title: string; description?: string; labels?: { text: string; color: string }[]; priority?: string; projectScope?: string }) => {
      // Scope the agent run to the task's project (if any) and open a fresh
      // draft chat, then jump to the workspace so the run is visible.
      ConversationService.newChat(ctx, card.projectScope);
      setActiveTab('trajectory');

      // Build a self-contained task brief for the agent.
      const labelText = card.labels?.length ? `\nLabels: ${card.labels.map((l) => l.text).join(', ')}` : '';
      const priorityText = card.priority ? `\nPriority: ${card.priority}` : '';
      const brief = `Work on this task:\n\nTitle: ${card.title}${card.description ? `\n\nDescription: ${card.description}` : ''}${priorityText}${labelText}\n\nApproach it end-to-end: investigate, implement, verify, and report what you changed.`;

      // Run in autonomous 'auto' mode (always-approve) so the agent works unattended.
      await handleSendPrompt(brief, { model: defaultComposerModel, mode: 'auto', attachments: [] });

      // Reflect progress on the board: move the card to "In Progress".
      if (ipc) {
        try {
          const result = await ipc.invoke('kanban-load', {
            scope: card.projectScope ? 'project' : 'global',
            projectName: card.projectScope
          });
          const currentCards: any[] = Array.isArray(result) ? result : [];
          const updated = currentCards.map((c) =>
            c.id === card.id ? { ...c, column: 'in-progress' } : c
          );
          await ipc.invoke('kanban-save', {
            scope: card.projectScope ? 'project' : 'global',
            projectName: card.projectScope,
            cards: updated
          });
        } catch {
          // Board update is best-effort; the agent session is the primary outcome.
        }
      }
      triggerToast(`Agent started working on "${card.title}"`, 'info');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, ipc, defaultComposerModel, handleSendPrompt, triggerToast]
  );

  // ── Attachments ────────────────────────────────────────────────────────────
  const handleAttachFiles = async () => {
    if (ipc) {
      const filePaths: string[] = (await ipc.invoke('select-files')) as string[];
      AttachmentService.fromFiles(ctx, filePaths);
      return;
    }
    // Web/VPS build has no native file dialog (Electron's select-files IPC is
    // absent). Fall back to a hidden <input type="file"> and route the chosen
    // File objects through fromPaste, which reads them into buffers — the same
    // path clipboard paste uses in the web build. Without this, the Attach
    // button is a silent no-op in the browser (ux-critic HIGH finding).
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        void AttachmentService.fromPaste(ctx, input.files);
      }
    };
    input.click();
  };
  const handleAttachPastedFiles = (files: FileList) => AttachmentService.fromPaste(ctx, files);
  const handleRemoveAttachment = (index: number) => AttachmentService.remove(ctx, index);

  // ── Diff viewer ────────────────────────────────────────────────────────────
  const handleViewDiff = (filename: string, originalCode: string, modifiedCode: string) => {
    setActiveDiff({ filename, originalCode, modifiedCode });
    setActiveTab('diff');
  };

  // ── Folder import ──────────────────────────────────────────────────────────
  const handleOpenFolder = async () => {
    if (!ipc) {
      triggerToast('Folder picker is only available in the desktop app');
      return;
    }
    try {
      const paths = (await ipc.invoke('select-project-folders')) as string[] | undefined;
      if (Array.isArray(paths) && paths.length > 0) {
        paths.forEach((p, i) => {
          const name = p.split(/[\\/]/).pop() || `Project ${i + 1}`;
          ConversationService.createProject(ctx, { name, folders: [p] });
        });
        triggerToast(`Added ${paths.length} project folder${paths.length > 1 ? 's' : ''}`);
      }
    } catch {
      triggerToast('Could not open folder');
    }
  };

  // ── Updates ────────────────────────────────────────────────────────────────
  const handleCheckForUpdates = () => UpdateService.check(ctx);

  // ── Web-mode account actions (delegate to AccountService) ───────────────────
  const handleOpenAccount = () => AccountService.open(ctx, isWebMode);
  const handleLogout = () => { void AccountService.logout(ctx, isWebMode); };

  const handleUndoLastStep = () => {
    const chat = activeChat;
    if (!chat || chat.steps.length === 0) {
      triggerToast('Nothing to undo');
      return;
    }
    const lastStep = chat.steps[chat.steps.length - 1];
    handleUndoStep(lastStep.id);
  };

  // ─── Effects ───────────────────────────────────────────────────────────────

  // Sync themeMode with settings.json
  useEffect(() => {
    if (ipc && themeMode && settingsHydrated) {
      SettingsService.writeTheme(ctx, themeMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode, settingsHydrated]);

  // Startup: load persisted data, then auto-detect new providers.
  useEffect(() => {
    if (!ipc) {
      // No Electron IPC (web/test) — nothing to hydrate; settle immediately.
      setBootstrapping(false);
      return;
    }
    (async () => {
      const loaded = await StoreService.bootstrap(ctx);
      await SettingsService.readInto(ctx);
      setSettingsHydrated(true);
      await ProvidersService.autoDetect(ctx, loaded.loadedProviders, loaded.loadedModels, loaded.finalProjects, loaded.finalChats);
      setBootstrapping(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the running app version for the Updates panel.
  useEffect(() => {
    if (!ipc) return;
    ipc.invoke('app-version').then((v: string) => setAppVersion(v)).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close the mobile navigation drawer whenever the user navigates.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab, activeChatId, activeProject]);

  // Persist composer prompt + attachments to localStorage.
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

  // ── Curated MCP + Plugin catalogs (sourced from Core) ──────────────────────
  useEffect(() => {
    if (!ipc) return;
    ipc.invoke('mcp-catalog').then((list: any) => setMcpCatalog(Array.isArray(list) ? list : [])).catch(() => setMcpCatalog([]));
    ipc
      .invoke('plugins-catalog')
      .then((list: any) => {
        const catalog = Array.isArray(list) ? list : [];
        setPluginCatalog(catalog);
        ipc
          .invoke('settings-read')
          .then((current: any) => {
            const saved = (current?.plugins as Record<string, boolean>) || {};
            const state: Record<string, boolean> = {};
            for (const p of catalog) state[p.id] = saved[p.id] ?? p.defaultEnabled;
            setPluginEnabled(state);
          })
          .catch(() => { });
      })
      .catch(() => setPluginCatalog([]));
  }, [ipc]);

  // ── 3D Studio visibility (depends on the user's 3D settings: enabled + mode) ──
  useEffect(() => {
    if (!ipc) return;
    ipc
      .invoke('settings-read')
      .then((current: any) => {
        const cfg = current?.threeD || {};
        setShowStudio(cfg.enabled === true && cfg.mode === 'studio');
      })
      .catch(() => {});
  }, [ipc, activeTab]);

  // ── Discovered skills ──────────────────────────────────────────────────────
  const [importableSkills, setImportableSkills] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!ipc) return;
    const proj = projects.find((p) => p.name === activeProject);
    const root = proj?.folders?.[0];
    const dirs = root ? [
      `${root}/.superagent/skills`,
      `${root}/.cloud/skills`,
      `${root}/.agents/skills`,
      `${root}/.claude/skills`
    ] : undefined;
    ipc
      .invoke('skills-list', { dir: dirs })
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.skills ?? []);
        setSkills(Array.isArray(list) ? list : []);
      })
      .catch(() => setSkills([]));
  }, [ipc, projects, activeProject]);

  // Manual "Scan for skills" — scans global ~/.claude/skills + ~/.agents/skills
  // (and the active project's dot-folders) and only surfaces the import prompt
  // when something is actually importable.
  const handleScanSkills = useCallback(() => {
    if (!ipc) return;
    const proj = projects.find((p) => p.name === activeProject);
    const root = proj?.folders?.[0];
    ipc
      .invoke('skills-import-check', { projectRoot: root })
      .then((res: any) => {
        if (res && res.canImport && Array.isArray(res.skills) && res.skills.length > 0) {
          setImportableSkills(res.skills);
        } else {
          setImportableSkills([]);
          triggerToast('No new skills to import.', 'info');
        }
      })
      .catch(() => setImportableSkills([]));
  }, [ipc, projects, activeProject, triggerToast]);

  const handleImportSkills = useCallback(() => {
    const proj = projects.find((p) => p.name === activeProject);
    const root = proj?.folders?.[0];
    if (!root || !ipc) return;
    ipc
      .invoke('skills-import-perform', { projectRoot: root })
      .then((res: any) => {
        if (res && res.success) {
          triggerToast(`Successfully imported ${res.importedCount} skill(s) into .superagent/skills!`);
          setImportableSkills([]);
          // Force refresh discovered skills
          ipc
            .invoke('skills-list', { dir: [
              `${root}/.superagent/skills`,
              `${root}/.cloud/skills`,
              `${root}/.agents/skills`,
              `${root}/.claude/skills`
            ]})
            .then((listRes: any) => {
              const list = Array.isArray(listRes) ? listRes : (listRes?.skills ?? []);
              setSkills(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
        } else {
          triggerToast(res?.error || 'Failed to import skills.', 'error');
        }
      })
      .catch((err: any) => {
        triggerToast(`Failed to import skills: ${err.message}`, 'error');
      });
  }, [ipc, projects, activeProject, triggerToast]);

  // ── Curated skill catalog (Settings → Skills; separate from the slash surface) ──
  useEffect(() => {
    if (!ipc) return;
    ipc
      .invoke('skills-catalog')
      .then((list: any) => setSkillCatalog(Array.isArray(list) ? list : []))
      .catch(() => setSkillCatalog([]));
  }, [ipc]);

  // Merge discovered + catalog skills for Settings → Skills. Discovered skills are
  // validated: a missing name/description marks them "Incomplete"; otherwise "Active".
  const settingsSkills = useMemo(() => {
    const discovered = skills.map((s: any) => {
      const complete =
        s.name && s.name !== 'Unnamed Skill' &&
        s.description && s.description !== 'No description provided' &&
        !!s.instructions?.trim();
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: true,
        status: (complete ? 'active' : 'incomplete') as 'active' | 'incomplete',
        source: 'discovered' as const
      };
    });
    const catalog = skillCatalog.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      enabled: false,
      status: (s.status ?? 'under-development') as 'active' | 'under-development' | 'incomplete',
      source: 'catalog' as const
    }));
    return [...discovered, ...catalog];
  }, [skills, skillCatalog]);

  // Navigation history bookkeeping.
  useEffect(() => {
    if (restoringNavigationRef.current) {
      restoringNavigationRef.current = false;
      return;
    }
    const snapshot = NavigationService.buildSnapshot({ activeTab, settingsCategory, activeProject, activeChatId, activeDiff });
    setNavigationHistory((prev) => {
      const current = navigationIndex >= 0 ? prev[navigationIndex] : null;
      if (current && NavigationService.snapshotsEqual(current, snapshot)) {
        return prev;
      }
      const next = navigationIndex >= 0 ? prev.slice(0, navigationIndex + 1) : [];
      next.push(snapshot);
      setNavigationIndex(next.length - 1);
      return next;
    });
  }, [activeTab, settingsCategory, activeProject, activeChatId, activeDiff, navigationIndex]);

  const restoreNavigation = (snapshot: NavigationSnapshot) => {
    restoringNavigationRef.current = true;
    NavigationService.applySnapshot(snapshot, ctx);
  };
  const handleNavigateBack = () => {
    if (navigationIndex <= 0) return;
    const nextIndex = navigationIndex - 1;
    const snapshot = navigationHistory[nextIndex];
    if (!snapshot) return;
    setNavigationIndex(nextIndex);
    restoreNavigation(snapshot);
  };
  const handleNavigateForward = () => {
    if (navigationIndex < 0 || navigationIndex >= navigationHistory.length - 1) return;
    const nextIndex = navigationIndex + 1;
    const snapshot = navigationHistory[nextIndex];
    if (!snapshot) return;
    setNavigationIndex(nextIndex);
    restoreNavigation(snapshot);
  };

  // ── URL synchronization (web: history API, desktop: location hash) ───────
  useEffect(() => {
    pushRoute({ activeTab, activeChatId, settingsCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeChatId, settingsCategory]);

  useEffect(() => {
    return subscribeRouteChange((route) => {
      const currentPath = buildPath({ activeTab, activeChatId, settingsCategory });
      const newPath = buildPath(route);
      if (currentPath !== newPath) {
        setActiveTab(route.activeTab);
        setActiveChatId(route.activeChatId);
        setSettingsCategory(route.settingsCategory);
      }
    });
  }, [activeTab, activeChatId, settingsCategory, setActiveTab, setActiveChatId, setSettingsCategory]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setActiveTab('settings');
        setSettingsCategory('general');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Keep the desktop 3D Partner in sync with the active Partner selection.
  useEffect(() => {
    if (!ipc) return;
    const active = partners.pets.find((p) => p.id === partners.activeId) || null;
    PartnerSyncService.syncActive(ipc, active);
  }, [ipc, partners.pets, partners.activeId]);

  // Relay demo-mode agent state (no real agent-events) to the 3D Partner.
  useEffect(() => {
    if (!ipc) return;
    const mood = PartnerSyncService.moodFor(isGenerating, activeChat?.lastError);
    ipc.send('pet-mood', mood);
  }, [ipc, isGenerating, activeChat?.lastError]);

  // Relay partner:say DOM events to the pet.
  useEffect(() => {
    if (!ipc) return;
    const onSay = (e: Event) => PartnerSyncService.say(ipc, (e as CustomEvent).detail);
    window.addEventListener('partner:say', onSay as EventListener);
    return () => window.removeEventListener('partner:say', onSay as EventListener);
  }, [ipc]);

  // Surface renderer + main-process errors as red toasts.
  useEffect(() => {
    ErrorService.install();
    const unsubscribe = ErrorService.subscribe((_context, message) => triggerToast(message, 'error'));
    const cleanupAppError = ErrorService.bindAppError(ipc, (message) => triggerToast(message, 'error'));
    return () => {
      unsubscribe();
      cleanupAppError();
    };
  }, [ipc]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (toastOpen) {
      const duration = toastType === 'error' ? 10000 : 2500;
      const timer = setTimeout(() => setToastOpen(false), duration);
      return () => clearTimeout(timer);
    }
  }, [toastOpen, toastType]);

  // Handle clicking outside profile popover to close it.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setProfilePopoverOpen(false);
      }
    };
    if (profilePopoverOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [profilePopoverOpen]);

  // ── Real AI streaming via agent-event IPC (logic lives in AgentStreamService) ─
  useEffect(() => {
    if (!ipc) return;
    const handleAgentEvent = AgentStreamService.createHandler(ctx, streaming, partnersRef, setLiveContextUsage);
    ipc.on('agent-event', handleAgentEvent);
    return () => ipc.removeListener('agent-event', handleAgentEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipc, ctx, streaming, partnersRef]);

  // Reset the live context gauge when switching chats (a new run repopulates it).
  useEffect(() => {
    setLiveContextUsage(null);
  }, [activeChatId]);

  // Sync trajectory steps when activeChatId changes (e.g. via routing / back button)
  useEffect(() => {
    if (!activeChatId || activeChatId === 'draft-chat') {
      setTrajectorySteps([]);
      return;
    }
    const chat = chats.find((c) => c.id === activeChatId);
    if (chat) {
      setTrajectorySteps(chat.steps);
    }
  }, [activeChatId]);

  // ── Sandbox permission prompts (user-in-the-loop) ───────────────────────
  useEffect(() => {
    if (!ipc) return;
    const handlePermissionRequest = (_e: unknown, payload: {
      id: string;
      sessionId: string;
      request: { action: string; command?: string; filePath?: string; details?: Record<string, unknown> };
    }) => {
      setPendingPermission({ id: payload.id, sessionId: payload.sessionId, request: payload.request });
    };
    ipc.on('agent-permission-request', handlePermissionRequest);
    return () => ipc.removeListener('agent-permission-request', handlePermissionRequest);
  }, [ipc]);

  const resolvePermission = (approved: boolean, remember: boolean) => {
    if (!pendingPermission) return;
    ipc?.invoke('agent-permission-response', {
      id: pendingPermission.id,
      approved,
      remember
    }).catch(() => {});
    setPendingPermission(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="app-container"
      data-theme={themeMode}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      className="flex flex-col h-dvh w-full max-w-full bg-brand-bg text-brand-textMain overflow-hidden overflow-x-hidden font-sans select-none"
    >
      {/* Skip link: first focusable element so keyboard/SR users can bypass the
          title bar + sidebar and jump straight to the primary content. Hidden
          until focused (standard sr-only pattern), then shown as a floating chip. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10000 focus:rounded-lg focus:bg-brand-popover focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-textMain focus:ring-2 focus:ring-brand-border-strong focus:outline-none"
      >
        Skip to main content
      </a>
      <TitleBar
        hasOpenAiKey={Boolean(byokKeys.openai)}
        onOpenProviders={() => {
          setActiveTab('settings');
          setSettingsCategory('providers');
        }}
        onWindowControl={handleWindowControl}
        onNavigateBack={handleNavigateBack}
        onNavigateForward={handleNavigateForward}
        canNavigateBack={navigationIndex > 1}
        canNavigateForward={navigationIndex >= 0 && navigationIndex < navigationHistory.length - 1}
        onToggleMobileNav={activeTab !== 'settings' ? () => setMobileNavOpen((prev) => !prev) : undefined}
        themeMode={themeMode}
        onNewChat={() => handleNewChat()}
        onOpenFolder={handleOpenFolder}
        onOpenSettings={() => {
          setActiveTab('settings');
          setSettingsCategory('general');
        }}
        onQuit={handleQuit}
        onUndoLastStep={handleUndoLastStep}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onAbout={handleAbout}
        onToggleTheme={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
        onCheckUpdates={handleCheckForUpdates}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenDoctor={() => setIsDoctorOpen(true)}
        onOpenDocs={() => {
          if (ipc) {
            ipc.invoke('open-external', 'https://github.com/Aninda7479/AgentApp#readme');
          } else {
            window.open('https://github.com/Aninda7479/AgentApp#readme', '_blank', 'noopener');
          }
        }}
        isWebMode={isWebMode}
        onOpenAccount={handleOpenAccount}
        onLogout={handleLogout}
      />

      {/* Main Body container */}
      <div className="flex-1 flex overflow-hidden overflow-x-hidden relative min-w-0">
        {/* Mobile drawer backdrop */}
        {mobileNavOpen && activeTab !== 'settings' && activeTab !== 'studio' && activeTab !== 'project-settings' && activeTab !== 'standalone-chat' && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}
        {/* Hide main sidebar when viewing Settings page, matching Image 4 */}
        {activeTab !== 'settings' && activeTab !== 'studio' && activeTab !== 'project-settings' && activeTab !== 'standalone-chat' && (
          <Sidebar
            activeTab={activeTab}
            showStudio={showStudio}
            onSelectTab={(tab) => {
              if (tab === 'settings') {
                setActiveTab('settings');
                setSettingsCategory('general');
              } else if (tab === 'studio-settings') {
                // Ghost "3D Studio" entry when 3D is disabled: open its settings
                // so the user can enable the capability rather than hiding it.
                setActiveTab('settings');
                setSettingsCategory('3d');
              } else if (tab === 'companion') {
                // "Companion" sidebar entry routes into Settings → Companion
                // (the merged Partner/Pet page), matching the Pets ghost pattern.
                setActiveTab('settings');
                setSettingsCategory('companion');
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
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
            projects={projects}
            chats={chats}
            activeChatId={activeChatId}
            onCreateProjectClick={() => setIsCreateProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
            onConfigureProject={(proj) => {
              setProjectToConfigure(proj);
              setIsConfigureProjectOpen(true);
            }}
            onProjectSettings={(proj) => {
              setProjectToConfigure(proj);
              handleSelectProject(proj.name);
              setActiveTab('project-settings');
            }}
            onDeleteChat={handleDeleteChat}
            onSelectChat={handleSelectChat}
            onChatSettings={(chat) => {
              setChatToConfigure(chat);
              setIsChatSettingsOpen(true);
            }}
            onStandaloneChatSettings={(chat) => {
              setChatToConfigure(chat);
              setActiveTab('standalone-chat');
            }}
          />
        )}

        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col relative isolate overflow-hidden bg-brand-bg pb-18 md:pb-0 focus:outline-none">
          {/* Ambient "layered atmosphere" backdrop — a soft accent glow and three
              calm depth bands, painted behind all content (Atmosphere mode, low
              opacity). Decorative only; never sits behind text contrast. */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(120% 85% at 86% -8%, var(--brand-atmo-glow), transparent 52%)' }}
            />
            <svg className="absolute inset-x-0 bottom-0 h-[38%] w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" fill="none">
              <path d="M0 206 C240 168 480 232 720 198 C960 164 1200 222 1440 188 L1440 320 L0 320 Z" fill="var(--brand-atmo-1)" />
              <path d="M0 244 C220 210 440 272 720 238 C1000 206 1240 262 1440 234 L1440 320 L0 320 Z" fill="var(--brand-atmo-2)" />
              <path d="M0 280 C260 254 520 300 760 280 C1020 258 1240 298 1440 278 L1440 320 L0 320 Z" fill="var(--brand-atmo-3)" />
            </svg>
          </div>
          {activeTab === 'trajectory' && (
            <WorkspaceView
              activeProject={activeProject}
              trajectorySteps={trajectorySteps}
              isGenerating={isGenerating}
              startedAt={activeChat?.startedAt}
              modelsCatalog={modelsCatalog}
              mcpServers={mcpServers}
              hasCredentials={Boolean(connectedProviders.find((p) => p.apiKey) || byokKeys.openai || byokKeys.gemini)}
              composerPrompt={composerPrompt}
              onPromptChange={setComposerPrompt}
              onSendPrompt={handleSendPrompt}
              onStop={handleStopActiveRun}
              onViewDiff={handleViewDiff}
              onOpenMcp={() => { setActiveTab('settings'); setSettingsCategory('connectors'); }}
              onOpenSettings={() => {
                setActiveTab('settings');
                setSettingsCategory('general');
              }}
              onToast={triggerToast}
              onUndoStep={handleUndoStep}
              activeChatModel={activeChat?.model || lastUsedModel}
              defaultApprovalMode={resolvedDefaultApproval}
              onModelChange={(model) => SettingsService.persistLastUsedModel(ctx, model)}
              onAttachClick={handleAttachFiles}
              onAttachPastedFiles={handleAttachPastedFiles}
              composerAttachments={composerAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              projects={projects}
              onSelectProject={handleSelectProject}
              unsandboxedActions={fullAccess}
              onUnsandboxedActionsChange={handleUnsandboxedActionsChange}
              onMicUnavailable={() => triggerToast('Voice input is not supported in this browser')}
              onMicNotice={(msg) => triggerToast(msg)}
              slashCommands={slashCommands}
              skills={skills}
              lastError={activeChat?.lastError}
              onRetryLast={handleRetryLast}
              contextUsage={liveContextUsage}
              activeModelContextLimit={
                modelsCatalog.find((m) => m.name === (activeChat?.model || lastUsedModel))?.contextLimit
              }
              onCompact={handleCompactRequest}
              importableSkills={importableSkills}
              onImportSkills={handleImportSkills}
              onScanSkills={handleScanSkills}
            />
          )}

          {activeTab === 'scheduled' && (
            <ScheduledView onCreateTask={handleCreateTaskFromChat} onUseTemplate={handleUseTemplate} />
          )}

          {activeTab === 'tasks' && (
            <TasksPage activeProject={activeProject} ipc={ipc} triggerToast={triggerToast} onStartWork={handleStartWorkOnTask} />
          )}

          {activeTab === 'project-settings' && (
            <ProjectSettingsPage
              project={projectToConfigure || projects.find((p) => p.name === activeProject) || null}
              projects={projects}
              availableSkills={availableSkills}
              onSave={(updated) => {
                handleSaveProjectConfig(updated);
                setProjectToConfigure(updated);
                triggerToast('Project settings saved');
              }}
              onBack={() => setActiveTab('trajectory')}
              onSelectProject={(name) => {
                const proj = projects.find((p) => p.name === name) || null;
                setProjectToConfigure(proj);
                handleSelectProject(name);
              }}
            />
          )}

          {activeTab === 'standalone-chat' && (
            <StandaloneChatPage
              chat={chatToConfigure}
              availableSkills={availableSkills}
              onSave={(config, settings) => {
                if (chatToConfigure) {
                  ConversationService.saveStandaloneChatConfig(ctx, chatToConfigure.id, config, settings);
                }
              }}
              onBack={() => setActiveTab('trajectory')}
            />
          )}


          {activeTab === 'studio' && showStudio && (
            <ThreeDStudio
              partners={partnersRef.current}
              triggerToast={triggerToast}
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
                  catalog={mcpCatalog}
                  onInstallCatalog={handleInstallCatalogServer}
                />
              }
              connectedProviders={connectedProviders}
              modelsCatalog={modelsCatalog}
              onConnectProvider={handleConnectProvider}
              onDisconnectProvider={handleDisconnectProvider}
              onToggleModel={handleToggleModel}
              skills={settingsSkills}
              onToggleSkill={(skillId, enabled) => console.log(`Toggled skill ${skillId}: ${enabled}`)}
              onScanSkills={handleScanSkills}
              pluginCatalog={pluginCatalog}
              pluginEnabled={pluginEnabled}
              onTogglePlugin={handleTogglePlugin}
              workMode={workMode}
              onWorkModeChange={handleWorkModeChange}
              confirmShellCommands={defaultPermissions}
              onConfirmShellCommandsChange={handleConfirmShellCommandsChange}
              autoReviewPlan={autoReview}
              onAutoReviewPlanChange={handleAutoReviewPlanChange}
              unsandboxedActions={fullAccess}
              onUnsandboxedActionsChange={handleUnsandboxedActionsChange}
              internetAccessLevel={internetAccessLevel}
              onInternetAccessLevelChange={handleInternetAccessLevelChange}
              onToast={triggerToast}
              bootstrapping={bootstrapping}
              appVersion={appVersion}
              onCheckForUpdates={handleCheckForUpdates}
              updateStatus={updateStatus}
            />
          )}

          {activeTab === 'diff' && (
            <DiffViewer
              originalCode={activeDiff?.originalCode || '// Select a file diff from trajectory canvas'}
              modifiedCode={activeDiff?.modifiedCode || '// Select a file diff from trajectory canvas'}
              filename={activeDiff?.filename || 'No File Selected'}
              onAccept={() => {
                if (activeDiff) handleReviewDiff(activeDiff.filename);
                setActiveTab('trajectory');
              }}
              onReject={() => setActiveTab('trajectory')}
              onClose={() => setActiveTab('trajectory')}
              onReview={handleReviewDiff}
            />
          )}
        </main>
      </div>

      {/* Mobile bottom navigation (phones only) */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setMobileNavOpen(false);
        }}
      />

      {/* search dialog overlay */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        chats={chats.map((c) => ({ id: c.id, title: c.title, project: c.project }))}
        projects={projects}
        onSelectChat={handleSelectSearchChat}
        onSelectProject={(name) => handleSelectProject(name)}
        onNewChat={handleNewChat}
        onOpenFolder={handleOpenFolder}
        onOpenSettings={() => {
          setActiveTab('settings');
          setSettingsCategory('general');
        }}
      />

      {/* Create Project Modal */}
      <CreateProjectModal isOpen={isCreateProjectOpen} onClose={() => setIsCreateProjectOpen(false)} onCreate={handleCreateProject} />

      {/* Configure Project Modal */}
      <ConfigureProjectModal isOpen={isConfigureProjectOpen} onClose={() => setIsConfigureProjectOpen(false)} project={projectToConfigure} onSave={handleSaveProjectConfig} />
      <ChatSettingsModal
        isOpen={isChatSettingsOpen}
        onClose={() => setIsChatSettingsOpen(false)}
        chat={chatToConfigure}
        onSave={(settings) => {
          if (chatToConfigure) ConversationService.saveChatSettings(ctx, chatToConfigure.id, settings);
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* Doctor Diagnostics Modal */}
      <DoctorModal isOpen={isDoctorOpen} onClose={() => setIsDoctorOpen(false)} byokKeys={byokKeys} modelsCatalog={modelsCatalog} unsandboxedActions={fullAccess} />

      {/* Sandbox permission prompt — user-in-the-loop approval */}
      <PermissionDialog
        isOpen={pendingPermission !== null}
        request={pendingPermission?.request ?? null}
        onResolve={resolvePermission}
      />

      <AppToast open={toastOpen} message={toastMessage} type={toastType} onClose={() => setToastOpen(false)} />
      <VoiceIndicator />

      {/* Floating Partner / Pet companion. On the desktop the 3D overlay window
          is the pet; in the web build there is no separate window, so we fall
          back to this in-app 2D companion. */}
      {isWebMode && (
        <PartnerOverlay
          manifest={partners.pets.find((p) => p.id === partners.activeId) || null}
          visible={partnerVisible}
          isGenerating={isGenerating}
          lastError={activeChat?.lastError}
          onToggle={() => setPartnerVisible((v) => !v)}
        />
      )}
    </div>
  );
};
