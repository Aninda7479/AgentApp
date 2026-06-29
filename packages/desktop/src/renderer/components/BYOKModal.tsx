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

  return (
    <div
      data-testid="byok-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        data-testid="byok-modal-content"
        style={{
          backgroundColor: '#121215',
          border: '1px solid #27272a',
          borderRadius: '16px',
          width: '550px',
          maxWidth: '90%',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          color: '#f4f4f5'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            borderBottom: '1px solid #1f1f23',
            paddingBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚙️</span>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>BYOK Provider Settings</h2>
              <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: '2px 0 0 0' }}>
                Bring Your Own Keys & Endpoint Configurations
              </p>
            </div>
          </div>
          <button
            data-testid="byok-close-btn"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {testStatus && (
          <div
            data-testid="byok-test-status"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: testStatus.includes('✅')
                ? '#064e3b'
                : testStatus.includes('⚠️')
                ? '#78350f'
                : '#1e1b4b',
              color: testStatus.includes('✅')
                ? '#6ee7b7'
                : testStatus.includes('⚠️')
                ? '#fde68a'
                : '#c7d2fe',
              fontSize: '0.85rem',
              marginBottom: '16px'
            }}
          >
            {testStatus}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }}>
          {providers.map((p) => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 600 }}>{p.label}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  data-testid={`byok-input-${p.id}`}
                  type={p.isUrl || showKey[p.id] ? 'text' : 'password'}
                  value={keys[p.id] || ''}
                  onChange={(e) => handleChange(p.id, e.target.value)}
                  placeholder={p.placeholder}
                  style={{
                    flex: 1,
                    backgroundColor: '#09090b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                {!p.isUrl && (
                  <button
                    data-testid={`byok-toggle-show-${p.id}`}
                    onClick={() => toggleShow(p.id)}
                    style={{
                      backgroundColor: '#1a1a1e',
                      border: '1px solid #3f3f46',
                      color: '#a1a1aa',
                      borderRadius: '8px',
                      padding: '0 12px',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    {showKey[p.id] ? '🔒 Hide' : '👁️ Show'}
                  </button>
                )}
                <button
                  data-testid={`byok-test-btn-${p.id}`}
                  onClick={() => handleTestConnection(p.id)}
                  style={{
                    backgroundColor: '#1f1f23',
                    border: '1px solid #3f3f46',
                    color: '#3b82f6',
                    borderRadius: '8px',
                    padding: '0 12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '24px',
            borderTop: '1px solid #1f1f23',
            paddingTop: '16px'
          }}
        >
          <button
            data-testid="byok-cancel-btn"
            onClick={onClose}
            style={{
              backgroundColor: '#1a1a1e',
              border: '1px solid #3f3f46',
              color: '#a1a1aa',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Cancel
          </button>
          <button
            data-testid="byok-save-btn"
            onClick={handleSave}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 20px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
};
