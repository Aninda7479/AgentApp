import React, { useState } from 'react';
import { X, Key, Server, Sliders, Check } from 'lucide-react';
import { ModelConfig, ServerConfig } from '../types.js';
import { DEFAULT_HOMELAB_PORT } from '../config.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverConfig: ServerConfig;
  onSaveServerConfig: (config: ServerConfig) => void;
  modelConfig: ModelConfig;
  onSaveModelConfig: (config: ModelConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  serverConfig,
  onSaveServerConfig,
  modelConfig,
  onSaveModelConfig
}) => {
  const [port, setPort] = useState<number>(serverConfig.port || DEFAULT_HOMELAB_PORT);
  const [host, setHost] = useState<string>(serverConfig.host || 'localhost');
  const [apiKey, setApiKey] = useState<string>(modelConfig.apiKey || '');
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveServerConfig({ ...serverConfig, port, host });
    onSaveModelConfig({ ...modelConfig, apiKey });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">App & Server Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* HomeLab Server Port Configuration */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-slate-300 font-semibold">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>HomeLab / Docker Server Address</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <span className="text-[10px] text-slate-400 block mb-1">Host IP / Name</span>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Port</span>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  placeholder="1469"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Default HomeLab server port is configured to <strong className="text-emerald-400 font-mono">1469</strong>.
            </p>
          </div>

          {/* API Key Manager */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="flex items-center space-x-2 text-slate-300 font-semibold">
              <Key className="w-4 h-4 text-indigo-400" />
              <span>LLM Provider API Key</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-400">
              Optional API Key override for OpenAI, Anthropic, or DeepSeek providers.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
          >
            {saved ? <Check className="w-4 h-4 text-emerald-300" /> : null}
            <span>{saved ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
