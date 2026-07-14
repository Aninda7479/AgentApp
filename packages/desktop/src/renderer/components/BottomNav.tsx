import React from 'react';
import { MessageSquare, Clock, Plug, Server, Settings, PawPrint, LucideIcon } from 'lucide-react';

/** Destination tabs shown in the mobile bottom navigation bar. */
export type BottomNavTab = 'trajectory' | 'scheduled' | 'plugins' | 'mcp' | 'settings' | 'partner';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: BottomNavTab) => void;
  /** When viewing Settings the sidebar is hidden, so the bar stays visible. */
  mcpCount?: number;
  unsyncedBadge?: boolean;
}

const TABS: { id: BottomNavTab; label: string; Icon: LucideIcon }[] = [
  { id: 'trajectory', label: 'Agent', Icon: MessageSquare },
  { id: 'scheduled', label: 'Tasks', Icon: Clock },
  { id: 'plugins', label: 'Plugins', Icon: Plug },
  { id: 'partner', label: 'Partner', Icon: PawPrint },
  { id: 'mcp', label: 'MCP', Icon: Server },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

/**
 * Mobile-only bottom tab bar. Visible beneath the `md` breakpoint, it gives
 * thumb-reach navigation to the five primary surfaces and mirrors the sidebar.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, mcpCount = 0 }) => {
  return (
    <nav
      className="ui-bottom-nav md:hidden safe-bottom"
      aria-label="Primary"
      data-testid="bottom-nav"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            data-testid={`bottom-nav-${id}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectTab(id)}
            className={`ui-bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="relative">
              <Icon size={20} />
              {id === 'mcp' && mcpCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-brand-textMain text-brand-bg text-[8px] font-bold flex items-center justify-center">
                  {mcpCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};
