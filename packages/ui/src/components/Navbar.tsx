import React from 'react';
import { Menu, Bot, Settings, Server, Terminal, Smartphone } from 'lucide-react';
import { ModelOption, ServerConfig } from '../types.js';

interface NavbarProps {
  serverConfig: ServerConfig;
  activeModel: ModelOption;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  activeTab: 'chat' | 'studio';
  onSelectTab: (tab: 'chat' | 'studio') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  serverConfig,
  activeModel,
  onToggleSidebar,
  onOpenSettings,
  activeTab,
  onSelectTab
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950 px-4 flex items-center justify-between select-none">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 leading-none">SuperAgent</h1>
            <span className="text-[10px] text-slate-400 font-mono">v0.1.0 • Pure Rust Core</span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Navigation Tabs */}
        <div className="hidden sm:flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            onClick={() => onSelectTab('chat')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chat & Tools
          </button>
          <button
            onClick={() => onSelectTab('studio')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === 'studio' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Studio & Prompts
          </button>
        </div>

        {/* Server / Desktop Status Badge */}
        <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
          {serverConfig.isTauri ? (
            <>
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Desktop App</span>
            </>
          ) : (
            <>
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>HomeLab :{serverConfig.port}</span>
            </>
          )}
        </div>

        {/* Active Model Indicator */}
        <div className="hidden lg:flex items-center space-x-1 px-2.5 py-1 bg-indigo-950/60 border border-indigo-900/60 rounded-lg text-xs font-medium text-indigo-300">
          <span>{activeModel.name}</span>
        </div>

        {/* Settings Action Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          title="Open App Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
