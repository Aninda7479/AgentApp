import React from 'react';
import { MessageSquare, Clock, Settings, PawPrint, KanbanSquare, LucideIcon } from 'lucide-react';

/** Destination tabs shown in the mobile bottom navigation bar. */
export type BottomNavTab = 'trajectory' | 'scheduled' | 'tasks' | 'settings' | 'partner';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: BottomNavTab) => void;
  /** When viewing Settings the sidebar is hidden, so the bar stays visible. */
  unsyncedBadge?: boolean;
}

const TABS: { id: BottomNavTab; label: string; Icon: LucideIcon }[] = [
  { id: 'trajectory', label: 'Agent', Icon: MessageSquare },
  { id: 'tasks', label: 'Tasks', Icon: KanbanSquare },
  { id: 'scheduled', label: 'Scheduled', Icon: Clock },
  { id: 'partner', label: 'Partner', Icon: PawPrint },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

/**
 * Mobile-only bottom tab bar. Visible beneath the `md` breakpoint, it gives
 * thumb-reach navigation to the primary surfaces and mirrors the sidebar.
 * (MCP and the 3D Studio are intentionally absent here — they remain reachable
 * from the desktop sidebar / Settings, but are not part of the phone nav.)
 */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
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
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};
