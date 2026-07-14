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
  MousePointer2,
  Scale,
  RefreshCw
} from 'lucide-react';

/** A single navigation entry in the settings sidebar. */
interface SidebarItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

/** Props for the settings sidebar. */
interface SettingsSidebarProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onBackToApp: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

/** Grouped sidebar navigation items organized by category. */
const CATEGORIES: Record<string, SidebarItem[]> = {
  Personal: [
    { id: 'general', label: 'General', Icon: Settings },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', Icon: Keyboard },
    { id: 'pets', label: 'Pets', Icon: PawPrint }
  ],
  "AI Config": [
    { id: 'providers', label: 'Providers', Icon: SlidersHorizontal },
    { id: 'models', label: 'Models', Icon: Bot },
    { id: 'model-gov', label: 'Model Gov', Icon: Scale },
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
  ],
  About: [
    { id: 'updates', label: 'Updates', Icon: RefreshCw }
  ]
};

/** Renders the settings navigation. On large screens it is a vertical rail; on
 *  smaller screens it collapses into a horizontally scrollable, labeled tab bar. */
export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  searchQuery,
  setSearchQuery
}) => (
  <aside className="flex h-auto lg:h-full w-full lg:w-[260px] flex-shrink-0 lg:min-h-0 flex-col lg:flex-col border-b lg:border-b-0 lg:border-r border-brand-border bg-brand-sidebar">
    <div className="flex flex-col gap-3 px-3 lg:px-4 pt-3 lg:pt-5 pb-3">
      <button
        type="button"
        onClick={onBackToApp}
        className="flex items-center justify-start gap-2 text-sm text-brand-textMuted hover:text-brand-textMain w-full"
        title="Back to app"
      >
        <ArrowLeft size={15} />
        <span>Back to app</span>
      </button>

      <input
        type="text"
        placeholder="Search settings..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/70 focus:border-sky-500/70"
      />
    </div>

    <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto scrollbar-none px-2 lg:px-4 pb-2 lg:pb-4">
      {Object.entries(CATEGORIES).map(([group, items]) => {
        const visibleItems = items.filter(
          (item) => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={group} className="flex lg:flex-col gap-1 lg:mb-5 flex-shrink-0">
            <div className="hidden lg:block mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted/70">
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
                  title={label}
                  className={`mb-0.5 flex w-full items-center justify-center lg:justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors flex-shrink-0 whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-popover text-brand-textMain ring-1 ring-brand-border'
                      : 'text-brand-textMuted hover:bg-brand-card hover:text-brand-textMain'
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>

    <div className="hidden lg:block flex-shrink-0 border-t border-brand-border px-6 py-3 text-left text-xs text-brand-textMuted">
      SuperAgent
    </div>
  </aside>
);
