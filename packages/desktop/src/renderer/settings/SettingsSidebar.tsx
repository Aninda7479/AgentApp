import React from 'react';
import {
  Archive,
  ArrowLeft,
  Bot,
  FolderArchive,
  Keyboard,
  LucideIcon,
  PawPrint,
  Plug,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
  MonitorSmartphone,
  MousePointer2
} from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

interface SettingsSidebarProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onBackToApp: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const CATEGORIES: Record<string, SidebarItem[]> = {
  Personal: [
    { id: 'general', label: 'General', Icon: Settings },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', Icon: Keyboard },
    { id: 'pets', label: 'Pets', Icon: PawPrint }
  ],
  "AI Config": [
    { id: 'providers', label: 'Providers', Icon: SlidersHorizontal },
    { id: 'models', label: 'Models', Icon: Bot },
    { id: 'usage', label: 'AI Usage', Icon: SquareTerminal }
  ],
  Integrations: [
    { id: 'mcp', label: 'MCP', Icon: Plug },
    { id: 'browser-use', label: 'Browser Use', Icon: MonitorSmartphone },
    { id: 'computer-use', label: 'Computer Use', Icon: MousePointer2 }
  ],
  Archived: [
    { id: 'archived-chats', label: 'Archived Chats', Icon: Archive },
    { id: 'archived-projects', label: 'Archived Projects', Icon: FolderArchive }
  ]
};

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  searchQuery,
  setSearchQuery
}) => (
  <aside className="flex h-full w-[260px] min-h-0 flex-col border-r border-brand-border bg-brand-sidebar">
    <div className="flex-shrink-0 px-4 pt-5 pb-4">
      <button
        type="button"
        onClick={onBackToApp}
        className="mb-5 flex items-center gap-2 text-sm text-brand-textMuted hover:text-brand-textMain"
      >
        <ArrowLeft size={15} />
        <span>Back to app</span>
      </button>

      <div>
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/70 focus:border-sky-500/70"
        />
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {Object.entries(CATEGORIES).map(([group, items]) => {
        const visibleItems = items.filter(
          (item) => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={group} className="mb-5">
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted/70">
              {group}
            </div>
            {visibleItems.map(({ id, label, Icon }) => {
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`settings-category-${id}`}
                  onClick={() => onSelectCategory(id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-popover text-brand-textMain ring-1 ring-brand-border'
                      : 'text-brand-textMuted hover:bg-brand-card hover:text-brand-textMain'
                  }`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>

    <div className="flex-shrink-0 border-t border-brand-border px-6 py-3 text-left text-xs text-brand-textMuted">
      Agent App Desktop
    </div>
  </aside>
);
