import React from 'react';
import { ArrowLeft, Bot, Keyboard, LucideIcon, Plug, Settings, SlidersHorizontal } from 'lucide-react';

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
    { id: 'shortcuts', label: 'Shortcuts', Icon: Keyboard },
    { id: 'servers', label: 'Servers', Icon: Plug }
  ],
  "AI Config": [
    { id: 'providers', label: 'Providers', Icon: SlidersHorizontal },
    { id: 'models', label: 'Models', Icon: Bot }
  ]
};

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  searchQuery,
  setSearchQuery
}) => (
  <aside className="flex h-full w-[260px] flex-col border-r border-brand-border bg-brand-sidebar px-4 py-5">
    <button
      type="button"
      onClick={onBackToApp}
      className="mb-5 flex items-center gap-2 text-sm text-brand-textMuted hover:text-brand-textMain"
    >
      <ArrowLeft size={15} />
      <span>Back to app</span>
    </button>

    <div className="mb-6">
      <input
        type="text"
        placeholder="Search settings..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/70 focus:border-sky-500/70"
      />
    </div>

    <div className="flex-1">
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

    <div className="border-t border-brand-border px-2 pt-3 text-left text-xs text-brand-textMuted">
      Agent App Desktop
    </div>
  </aside>
);
