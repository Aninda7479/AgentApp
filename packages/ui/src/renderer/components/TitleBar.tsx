import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  FolderOpen,
  Settings,
  Power,
  User,
  LogOut,
  Undo2,
  PanelLeft,
  Moon,
  Sun,
  HelpCircle,
  MoreHorizontal,
  RefreshCw,
  BookOpen,
  Keyboard,
  Stethoscope,
  Box,
  PersonStanding,
  Clock,
  WifiOff,
  ArrowUpCircle,
  Package,
  Cpu,
  Minus,
  Square,
  X,
  Lock,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { ThemeMode } from '../types';
import { LucideIcon } from 'lucide-react';
import { WindowService } from '../logic/window';
import { formatShortcut } from '../lib/platform';
import { getIpc } from '../lib/ipc';


/** Props for the TitleBar component. */
interface TitleBarProps {
  hasOpenAiKey: boolean;
  onOpenProviders: () => void;
  onWindowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  /** Toggles the slide-over navigation drawer on small screens. */
  onToggleMobileNav?: () => void;

  // ── Real application-menu actions (no filler) ──
  onNewChat?: () => void;
  onOpenFolder?: () => void;
  onOpenArtifacts?: () => void;
  onOpenPCBWorkspace?: () => void;
  onOpen3DStudio?: () => void;
  onOpenPartner?: () => void;
  onScheduleTask?: () => void;
  onOpenSettings?: () => void;
  onQuit?: () => void;
  onUndoLastStep?: () => void;
  onToggleSidebar?: () => void;
  onAbout?: () => void;
  onToggleTheme?: () => void;
  themeMode?: ThemeMode;
  onCheckUpdates?: () => void;
  onOpenDocs?: () => void;
  onOpenShortcuts?: () => void;
  onOpenDoctor?: () => void;
  /** True when running in the browser/web build. */
  isWebMode?: boolean;
  /** Opens the account/settings page. */
  onOpenAccount?: () => void;
  /** Locks the session or logs the user out. */
  onLogout?: () => void;
  onLockApp?: () => void;
  /** Warning state: backend core disconnected. */
  isBackendDisconnected?: boolean;
  /** Available update version string. Null/undefined if none. */
  updateAvailableVersion?: string | null;
  /** Action when clicking the update available badge. */
  onOpenUpdates?: () => void;
}

const isDesktop = WindowService.isDesktop();
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent || navigator.platform || '');

interface MenuItem {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}
interface MenuGroup {
  key: string;
  label: string;
  items: (MenuItem | 'sep')[];
}

/** Desktop title bar with logo, history, a real application menu, and window controls. */
export const TitleBar: React.FC<TitleBarProps> = ({
  hasOpenAiKey,
  onOpenProviders,
  onWindowControl,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  onToggleMobileNav,
  onNewChat,
  onOpenFolder,
  onOpenArtifacts,
  onOpenPCBWorkspace,
  onOpen3DStudio,
  onOpenPartner,
  onScheduleTask,
  onOpenSettings,
  onQuit,
  onUndoLastStep,
  onToggleSidebar,
  onAbout,
  onToggleTheme,
  themeMode = 'dark',
  onCheckUpdates,
  onOpenDocs,
  onOpenShortcuts,
  onOpenDoctor,
  isWebMode = false,
  onOpenAccount,
  onLogout,
  onLockApp,
  isBackendDisconnected = false,
  updateAvailableVersion = null,
  onOpenUpdates,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMenu = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu((prev) => (prev === key ? null : key));
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const groups: MenuGroup[] = [
    {
      key: 'file',
      label: 'File',
      items: [
        { label: 'New chat', icon: Plus, shortcut: 'Ctrl+N', onClick: () => onNewChat?.() },
        { label: 'Open folder…', icon: FolderOpen, onClick: () => onOpenFolder?.() },
        'sep',
        { label: 'Artifacts', icon: Package, onClick: () => onOpenArtifacts?.() },
        { label: 'PCB Workspace', icon: Cpu, onClick: () => onOpenPCBWorkspace?.() },
        { label: 'Open 3D Studio', icon: Box, onClick: () => onOpen3DStudio?.() },
        { label: 'Partner', icon: PersonStanding, onClick: () => onOpenPartner?.() },
        { label: 'Schedule Task', icon: Clock, onClick: () => onScheduleTask?.() },
        'sep',
        { label: 'Settings', icon: Settings, onClick: () => onOpenSettings?.() },
        { label: 'Lock Session', icon: Lock, onClick: () => onLockApp?.() || onLogout?.() },
        ...(!isWebMode
          ? [
              'sep' as const,
              { label: 'Quit SuperAgent', icon: Power, danger: true, onClick: () => onQuit?.() },
            ]
          : []),
      ],
    },
    {
      key: 'edit',
      label: 'Edit',
      items: [
        { label: 'Undo last step', icon: Undo2, onClick: () => onUndoLastStep?.() },
      ],
    },
    {
      key: 'view',
      label: 'View',
      items: [
        { label: 'Toggle sidebar', icon: PanelLeft, onClick: () => onToggleSidebar?.() },
        {
          label: themeMode === 'light' ? 'Switch to dark' : 'Switch to light',
          icon: themeMode === 'light' ? Moon : Sun,
          onClick: () => onToggleTheme?.(),
        },
      ],
    },
    {
      key: 'help',
      label: 'Help',
      items: [
        { label: 'Check for Updates', icon: RefreshCw, onClick: () => onCheckUpdates?.() },
        { label: 'Keyboard Shortcuts', icon: Keyboard, onClick: () => onOpenShortcuts?.() },
        { label: 'Doctor Diagnostics', icon: Stethoscope, onClick: () => onOpenDoctor?.() },
        { label: 'Documentation', icon: BookOpen, onClick: () => onOpenDocs?.() },
        'sep',
        { label: 'Account / Host Settings', icon: User, onClick: () => onOpenAccount?.() },
        { label: 'Lock & Log out', icon: LogOut, danger: true, onClick: () => onLockApp?.() || onLogout?.() },
        'sep',
        { label: 'About SuperAgent', icon: HelpCircle, onClick: () => onAbout?.() },
      ],
    },
  ];

  const renderGroup = (group: MenuGroup) => (
    <div key={group.key} className={group.key === 'more' ? '' : ''}>
      <div className="ui-menu-label">{group.label}</div>
      {group.items.map((item, i) =>
        item === 'sep' ? (
          <div key={`sep-${i}`} className="ui-menu-sep" />
        ) : (
          <button
            key={item.label}
            className={`ui-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              item.onClick();
              setOpenMenu(null);
            }}
          >
            <item.icon size={15} />
            <span>{item.label}</span>
            {item.shortcut && <span className="kbd">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );

  const isDesktop = isWebMode === false || (!isWebMode && (WindowService.isDesktop() || (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window))));

  return (
    <div
      data-testid="title-bar"
      data-tauri-drag-region
      className="title-bar h-10 flex items-center justify-between px-3 select-none drag-window z-100"
      style={isDesktop ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget && isDesktop) {
          onWindowControl('maximize');
        }
      }}
    >
      {/* Left side: macOS Traffic Lights (if macOS desktop), Logo, Nav History, and Application Menu */}
      <div
        className="flex items-center gap-2 sm:gap-3 no-drag-window min-w-0"
        style={isDesktop ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
        ref={menuRef}
      >
        {/* macOS native-styled Traffic Lights */}
        {isMac && isDesktop && (
          <div className="flex items-center gap-2 mr-1.5 group/traffic shrink-0">
            <button
              data-testid="window-close-button"
              onClick={() => onWindowControl('close')}
              className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:brightness-90 transition-all flex items-center justify-center cursor-pointer group-hover/traffic:text-black/70 text-transparent"
              title="Close"
              aria-label="Close window"
            >
              <span className="text-[8px] font-bold leading-none select-none">✕</span>
            </button>
            <button
              data-testid="window-minimize-button"
              onClick={() => onWindowControl('minimize')}
              className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] hover:brightness-90 transition-all flex items-center justify-center cursor-pointer group-hover/traffic:text-black/70 text-transparent"
              title="Minimize"
              aria-label="Minimize window"
            >
              <span className="text-[8px] font-bold leading-none select-none">−</span>
            </button>
            <button
              data-testid="window-maximize-button"
              onClick={() => onWindowControl('maximize')}
              className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] hover:brightness-90 transition-all flex items-center justify-center cursor-pointer group-hover/traffic:text-black/70 text-transparent"
              title="Zoom / Maximize"
              aria-label="Maximize window"
            >
              <span className="text-[8px] font-bold leading-none select-none">+</span>
            </button>
          </div>
        )}

        {/* Mobile nav toggle (hamburger) */}
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="atmo-btn lg:hidden w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Menu"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* App Logo */}
        <div className="flex items-center text-brand-textMain transition-colors shrink-0">
          <BrandLogo size={22} />
        </div>

        {/* Back / Forward History Navigation */}
        <div className="flex gap-1 text-brand-textMuted select-none border-l border-brand-border/30 pl-3">
          <button
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className={`atmo-btn w-6 h-6 flex items-center justify-center rounded transition-all ${
              canNavigateBack
                ? 'hover:bg-white/5 hover:text-brand-textMain cursor-pointer'
                : 'opacity-35 cursor-not-allowed'
            }`}
            title="Go back"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className={`atmo-btn w-6 h-6 flex items-center justify-center rounded transition-all ${
              canNavigateForward
                ? 'hover:bg-white/5 hover:text-brand-textMain cursor-pointer'
                : 'opacity-35 cursor-not-allowed'
            }`}
            title="Go forward"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-0.5 text-brand-textMuted text-[11px] font-medium tracking-wide border-l border-brand-border/30 pl-3">
          {groups.map((group) => (
            <div key={group.key} className="relative">
              <button
                onClick={() => toggleMenu(group.key)}
                className={`atmo-btn cursor-pointer px-2 py-1 rounded hover:bg-white/5 hover:text-brand-textMain transition-all duration-150 active:scale-95 ${
                  openMenu === group.key ? 'text-brand-textMain bg-white/5' : ''
                }`}
              >
                {group.label}
              </button>
              {openMenu === group.key && (
                <div className="absolute left-0 top-full mt-1 z-50">
                  <div className="ui-menu">{renderGroup(group)}</div>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>


      {/* Middle side: Window Title label */}
      <div className="hidden sm:block text-[9px] font-mono text-brand-textMuted/40 absolute left-1/2 -translate-x-1/2 pointer-events-none select-none tracking-widest uppercase">
        superagent
      </div>

      {/* Right side: theme, BYOK status, menu (mobile), and Windows/Linux window controls */}
      <div
        className="flex items-center gap-2 sm:gap-3 no-drag-window shrink-0"
        style={isDesktop ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
      >
        {/* Backend Disconnected Warning — only shown when backend core / daemon / server is unreachable */}
        {isBackendDisconnected && (
          <div
            data-testid="backend-disconnected-warning"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-rose-500/15 border border-rose-500/40 text-rose-400 shadow-sm animate-pulse"
            title="Backend core disconnected. Please ensure the backend server or daemon process is running."
          >
            <WifiOff size={11} className="text-rose-400 shrink-0" />
            <span>Backend Disconnected</span>
          </div>
        )}

        {/* Update Available Badge — only shown when a new update is available */}
        {updateAvailableVersion && (
          <button
            data-testid="update-available-badge"
            onClick={onOpenUpdates || onCheckUpdates}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 shadow-sm transition-all cursor-pointer active:scale-[0.98]"
            title={`Update available (${updateAvailableVersion}). Click to view updates.`}
          >
            <ArrowUpCircle size={11} className="text-emerald-400 shrink-0 animate-bounce" />
            <span>Update {updateAvailableVersion !== 'available' ? `v${updateAvailableVersion}` : 'Available'}</span>
          </button>
        )}

        {/* Theme toggle (all sizes) */}
        <button
          onClick={onToggleTheme}
          className="atmo-btn w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer"
          title={themeMode === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label="Toggle theme"
        >
          {themeMode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {/* Lock App / Session toggle */}
        <button
          onClick={onLockApp || onLogout}
          className="atmo-btn w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer"
          title="Lock session"
          aria-label="Lock session"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>

        {/* Mobile "More" menu (File/Edit/View/Help consolidated) */}
        <div className="lg:hidden relative">
          <button
            onClick={() => toggleMenu('more')}
            className={`atmo-btn w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer ${
              openMenu === 'more' ? 'text-brand-textMain bg-white/5' : ''
            }`}
            title="Menu"
            aria-label="Open menu"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {openMenu === 'more' && (
            <div className="absolute right-0 top-full mt-1 z-50">
              <div className="ui-menu max-h-[70vh] overflow-y-auto">
                {groups.map((g) => (
                  <div key={g.key}>
                    {renderGroup(g)}
                    {g.key !== 'help' && <div className="ui-menu-sep" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Windows & Linux Window Controls (Minimize, Maximize/Restore, Close) */}
        {!isMac && isDesktop && (
          <div className="flex items-center h-full ml-1 border-l border-brand-border/30 pl-1">
            <button
              data-testid="window-minimize-button"
              onClick={() => onWindowControl('minimize')}
              className="w-8 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/10 transition-colors cursor-pointer"
              title="Minimize"
              aria-label="Minimize window"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              data-testid="window-maximize-button"
              onClick={() => onWindowControl('maximize')}
              className="w-8 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/10 transition-colors cursor-pointer"
              title="Maximize / Restore"
              aria-label="Maximize window"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              data-testid="window-close-button"
              onClick={() => onWindowControl('close')}
              className="w-8 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
              title="Close"
              aria-label="Close window"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
