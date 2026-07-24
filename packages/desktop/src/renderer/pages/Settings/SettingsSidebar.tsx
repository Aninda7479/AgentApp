import React from 'react';
import {
  Archive,
  ArrowLeft,
  Box,
  Boxes,
  Brain,
  HardDrive,
  Search,
  Bot,
  FolderArchive,
  Info,
  LucideIcon,
  Mic,
  PawPrint,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  MonitorSmartphone,
  MousePointer2,
  Network,
  RefreshCw,
  Globe
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
    { id: 'companion', label: 'Companion', Icon: PawPrint },
    { id: '3d', label: '3D Model Gen', Icon: Box },
    { id: 'memory', label: 'Memory', Icon: Brain }
  ],
  "AI Config": [
    { id: 'providers', label: 'Providers', Icon: SlidersHorizontal },
    { id: 'models', label: 'Models', Icon: Bot },
    { id: 'local-model', label: 'Local Model', Icon: HardDrive },
    { id: 'model-gov', label: 'Orchestrator', Icon: Network },
    { id: 'voice', label: 'Voice & Mic', Icon: Mic },
    { id: 'circle-search', label: 'Circle Search', Icon: Search },
    { id: 'usage', label: 'AI Usage', Icon: SquareTerminal }
  ],
  Integrations: [
    { id: 'skills', label: 'Skills', Icon: Sparkles },
    { id: 'connectors', label: 'Connectors', Icon: Plug },
    { id: 'plugins', label: 'Plugins', Icon: Boxes },
    { id: 'browser-use', label: 'Browser Use', Icon: MonitorSmartphone },
    { id: 'computer-use', label: 'Computer Use', Icon: MousePointer2 }
  ],
  Archived: [
    { id: 'archived-chats', label: 'Archived Chats', Icon: Archive },
    { id: 'archived-projects', label: 'Archived Projects', Icon: FolderArchive }
  ],
  Storage: [
    { id: 'artifacts', label: 'Storage & Artifacts', Icon: HardDrive }
  ],
  Hosting: [
    { id: 'web-app', label: 'Web App', Icon: Globe }
  ],
  About: [
    { id: 'updates', label: 'Updates', Icon: RefreshCw },
    { id: 'about', label: 'About', Icon: Info }
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
  <aside className="glass-panel flex h-auto lg:h-full w-full lg:w-[264px] flex-shrink-0 lg:min-h-0 flex-col border-b border-brand-border/60 lg:border-b-0 lg:border-r">
    <div className="flex flex-col gap-3 px-3 lg:px-4 pt-4 lg:pt-6 pb-3">
      <button
        type="button"
        onClick={onBackToApp}
        className="flex items-center justify-start gap-2 rounded-lg px-2 py-1.5 text-sm text-brand-textMuted transition-colors hover:bg-brand-hover hover:text-brand-textMain w-full"
        title="Back to app"
      >
        <ArrowLeft size={15} />
        <span>Back to app</span>
      </button>

      <div className="ui-input flex items-center gap-2 border-transparent bg-brand-card">
        <Search size={14} className="flex-shrink-0 text-brand-textMuted" />
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/60"
        />
      </div>
    </div>

    <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto scrollbar-none px-2 lg:px-3 pb-2 lg:pb-5">
      {Object.entries(CATEGORIES).map(([group, items]) => {
        const visibleItems = items.filter(
          (item) => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={group} className="flex lg:flex-col gap-1 lg:mb-5 flex-shrink-0">
            <div className="settings-group-label hidden lg:block">{group}</div>
            {visibleItems.map(({ id, label, Icon }) => {
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`settings-category-${id}`}
                  onClick={() => onSelectCategory(id)}
                  title={label}
                  className={`settings-nav-item flex-shrink-0 justify-center lg:justify-start whitespace-nowrap ${
                    isActive ? 'active' : ''
                  }`}
                >
                  <Icon size={16} className="settings-nav-icon flex-shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>

    <div className="hidden lg:block flex-shrink-0 border-t border-brand-border px-6 py-4 text-left text-xs font-medium tracking-wide text-brand-textMuted">
      SuperAgent
    </div>
  </aside>
);
