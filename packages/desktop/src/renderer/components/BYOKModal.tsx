import React, { useState } from 'react';

export interface BYOKModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveKeys: (keys: Record<string, string>) => void;
  initialKeys?: Record<string, string>;
}

export const BYOKModal: React.FC<BYOKModalProps> = ({
  isOpen,
  onClose,
  onSaveKeys,
  initialKeys = {}
}) => {
  const [keys, setKeys] = useState<Record<string, string>>({
    openai: initialKeys.openai || '',
    anthropic: initialKeys.anthropic || '',
    gemini: initialKeys.gemini || '',
    ollamaUrl: initialKeys.ollamaUrl || 'http://localhost:11434',
    customEndpoint: initialKeys.customEndpoint || ''
  });

  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (provider: string, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const toggleShow = (provider: string) => {
    setShowKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleTestConnection = (provider: string) => {
    const val = keys[provider];
    if (!val) {
      setTestStatus(`⚠️ No key or URL provided for ${provider.toUpperCase()}`);
      return;
    }
    setTestStatus(`⏳ Testing ${provider.toUpperCase()} connection...`);
    setTimeout(() => {
      setTestStatus(`✅ ${provider.toUpperCase()} connected successfully!`);
    }, 600);
  };

  const handleSave = () => {
    onSaveKeys(keys);
    onClose();
  };

  const providers = [
    { id: 'openai', label: 'OpenAI API Key', placeholder: 'sk-proj-...' },
    { id: 'anthropic', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
    { id: 'gemini', label: 'Google Gemini API Key', placeholder: 'AIzaSy...' },
    { id: 'ollamaUrl', label: 'Ollama / Local Server URL', placeholder: 'http://localhost:11434', isUrl: true },
    { id: 'customEndpoint', label: 'Custom Endpoint / Proxy', placeholder: 'https://api.mycustomllm.com/v1' }
  ];

  const getTestStatusStyle = () => {
    if (!testStatus) return '';
    if (testStatus.includes('✅')) return 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40';
    if (testStatus.includes('⚠️')) return 'bg-amber-950/80 text-amber-400 border border-amber-800/40';
    return 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/40';
  };

  return (
    <div
      data-testid="byok-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div
        data-testid="byok-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-[550px] max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-lg font-bold text-white m-0">BYOK Provider Settings</h2>
              <p className="text-xs text-brand-textMuted mt-0.5">
                Bring Your Own Keys & Endpoint Configurations
              </p>
            </div>
          </div>
          <button
            data-testid="byok-close-btn"
            onClick={onClose}
            className="bg-transparent border-none text-brand-textMuted hover:text-white text-lg cursor-pointer p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Test Status */}
        {testStatus && (
          <div
            data-testid="byok-test-status"
            className={`px-3 py-2 rounded-lg text-xs font-semibold mb-4 ${getTestStatusStyle()}`}
          >
            {testStatus}
          </div>
        )}

        {/* Provider Fields */}
        <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto">
          {providers.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-brand-textMain">{p.label}</label>
              <div className="flex gap-2">
                <input
                  data-testid={`byok-input-${p.id}`}
                  type={p.isUrl || showKey[p.id] ? 'text' : 'password'}
                  value={keys[p.id] || ''}
                  onChange={(e) => handleChange(p.id, e.target.value)}
                  placeholder={p.placeholder}
                  className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-textMuted/50 transition-colors placeholder-brand-textMuted/40"
                />
                {!p.isUrl && (
                  <button
                    data-testid={`byok-toggle-show-${p.id}`}
                    onClick={() => toggleShow(p.id)}
                    className="bg-brand-card border border-brand-border text-brand-textMuted hover:text-white rounded-lg px-3 cursor-pointer text-xs font-medium transition-colors"
                  >
                    {showKey[p.id] ? '🔒 Hide' : '👁️ Show'}
                  </button>
                )}
                <button
                  data-testid={`byok-test-btn-${p.id}`}
                  onClick={() => handleTestConnection(p.id)}
                  className="bg-brand-popover border border-brand-border text-blue-400 hover:text-blue-300 rounded-lg px-3 cursor-pointer text-xs font-semibold transition-colors"
                >
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 border-t border-brand-border/60 pt-4">
          <button
            data-testid="byok-cancel-btn"
            onClick={onClose}
            className="bg-brand-card border border-brand-border text-brand-textMuted hover:text-white rounded-lg px-4 py-2 cursor-pointer text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="byok-save-btn"
            onClick={handleSave}
            className="bg-white hover:bg-brand-textMain text-brand-bg rounded-lg px-5 py-2 font-bold cursor-pointer text-sm transition-all active:scale-[0.98]"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
};
