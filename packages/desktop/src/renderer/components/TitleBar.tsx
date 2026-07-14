import React, { useState, useRef, useEffect } from 'react';
import {
  Key,
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  FolderOpen,
  Settings,
  Power,
  Undo2,
  PanelLeft,
  Moon,
  Sun,
  HelpCircle,
  MoreHorizontal,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { ThemeMode } from '../types';
import { LucideIcon } from 'lucide-react';

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
  onOpenSettings?: () => void;
  onQuit?: () => void;
  onUndoLastStep?: () => void;
  onToggleSidebar?: () => void;
  onAbout?: () => void;
  onToggleTheme?: () => void;
  themeMode?: ThemeMode;
  onCheckUpdates?: () => void;
  onOpenDocs?: () => void;
  /** True when running in the browser/web build (no Electron). */
  isWebMode?: boolean;
  /** Opens the account/settings page (web build only). */
  onOpenAccount?: () => void;
  /** Logs the user out and returns to the login page (web build only). */
  onLogout?: () => void;
}

// The web build injects a mock window.require, so that is NOT a reliable signal.
// Electron's user agent uniquely contains "Electron".
const isElectron =
  typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');

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
  onOpenSettings,
  onQuit,
  onUndoLastStep,
  onToggleSidebar,
  onAbout,
  onToggleTheme,
  themeMode = 'dark',
  onCheckUpdates,
  onOpenDocs,
  isWebMode = false,
  onOpenAccount,
  onLogout,
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
        { label: 'Settings', icon: Settings, onClick: () => onOpenSettings?.() },
        { label: 'Quit SuperAgent', icon: Power, danger: true, onClick: () => onQuit?.() },
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
        { label: 'Documentation', icon: BookOpen, onClick: () => onOpenDocs?.() },
        ...(isWebMode
          ? [
              'sep' as const,
              { label: 'Account', icon: Settings, onClick: () => onOpenAccount?.() },
              { label: 'Log out', icon: Power, danger: true, onClick: () => onLogout?.() }
            ]
          : []),
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

  const openGroup = groups.find((g) => g.key === openMenu);

  return (
    <div
      data-testid="title-bar"
      className="h-10 bg-brand-sidebar border-b border-brand-border/40 flex items-center justify-between px-3 select-none drag-window z-30"
      style={isElectron ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
    >
      {/* Left side: Logo, Nav History, and Application Menu */}
      <div
        className="flex items-center gap-2 sm:gap-3 no-drag-window min-w-0"
        style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
        ref={menuRef}
      >
        {/* Mobile nav toggle (hamburger) */}
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="lg:hidden w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
            title="Menu"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* App Logo */}
        <div className="flex items-center text-violet-500 hover:text-violet-400 transition-colors flex-shrink-0">
          <BrandLogo size={22} />
        </div>

        {/* Back / Forward History Navigation */}
        <div className="flex gap-1 text-brand-textMuted select-none border-l border-brand-border/30 pl-3">
          <button
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className={`w-6 h-6 flex items-center justify-center rounded transition-all ${
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
            className={`w-6 h-6 flex items-center justify-center rounded transition-all ${
              canNavigateForward
                ? 'hover:bg-white/5 hover:text-brand-textMain cursor-pointer'
                : 'opacity-35 cursor-not-allowed'
            }`}
            title="Go forward"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Desktop application menu bar (File / Edit / View / Help) */}
        <div className="hidden lg:flex items-center gap-0.5 text-brand-textMuted text-[11px] font-medium tracking-wide border-l border-brand-border/30 pl-3">
          {groups.map((group) => (
            <div key={group.key} className="relative">
              <button
                onClick={() => toggleMenu(group.key)}
                className={`cursor-pointer px-2 py-1 rounded hover:bg-white/5 hover:text-brand-textMain transition-all duration-150 active:scale-95 ${
                  openMenu === group.key ? 'text-brand-textMain bg-white/5' : ''
                }`}
              >
                {group.label}
              </button>
            </div>
          ))}
          {openGroup && (
            <div className="absolute left-0 top-full mt-1 z-50">
              <div className="ui-menu">{renderGroup(openGroup)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Middle side: Window Title label */}
      <div className="hidden sm:block text-[11px] text-brand-textMuted/60 font-semibold absolute left-1/2 -translate-x-1/2 pointer-events-none select-none tracking-wider">
        SuperAgent
      </div>

      {/* Right side: theme, BYOK status, menu (mobile), and custom Window controls */}
      <div
        className="flex items-center gap-2 sm:gap-3 no-drag-window flex-shrink-0"
        style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
      >
        {/* Theme toggle (all sizes) */}
        <button
          onClick={onToggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer"
          title={themeMode === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label="Toggle theme"
        >
          {themeMode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        <button
          data-testid="byok-badge-trigger"
          onClick={onOpenProviders}
          className="bg-brand-card hover:bg-brand-popover border border-brand-border/80 text-brand-textMain px-3 py-1 rounded-full text-[10px] cursor-pointer flex items-center gap-1 transition-all duration-150 font-semibold shadow-sm active:scale-[0.98]"
        >
          <Key size={10} className="text-brand-textMuted" />
          <span>BYOK: {hasOpenAiKey ? 'OpenAI' : 'Configure'}</span>
        </button>

        {/* Mobile "More" menu (File/Edit/View/Help consolidated) */}
        <div className="lg:hidden relative">
          <button
            onClick={() => toggleMenu('more')}
            className={`w-7 h-7 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-colors cursor-pointer ${
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

        {/* Custom Window Controls — Electron desktop only, hidden on small screens */}
        {isElectron && (
          <div className="hidden lg:flex items-center pl-1">
            <button
              data-testid="win-minimize"
              onClick={() => onWindowControl('minimize')}
              className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 rounded transition-colors cursor-pointer"
              title="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="10" height="1" rx="0.5" fill="currentColor" />
              </svg>
            </button>
            <button
              data-testid="win-maximize"
              onClick={() => onWindowControl('maximize')}
              className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 rounded transition-colors cursor-pointer"
              title="Maximize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button
              data-testid="win-close"
              onClick={() => onWindowControl('close')}
              className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-white hover:bg-red-500 rounded transition-colors cursor-pointer"
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
