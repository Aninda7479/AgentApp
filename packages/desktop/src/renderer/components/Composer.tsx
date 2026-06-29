import React, { useState, KeyboardEvent } from 'react';

export interface ComposerOptions {
  model: string;
  mode: 'auto' | 'plan' | 'bypass';
  attachments: string[];
}

export interface ComposerProps {
  onSend: (prompt: string, options: ComposerOptions) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  onStop?: () => void;
  availableModels?: string[];
  defaultModel?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  isGenerating = false,
  onStop,
  availableModels = ['gpt-4o', 'claude-3-5-sonnet', 'codex-v2', 'o3-mini'],
  defaultModel = 'gpt-4o'
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [mode, setMode] = useState<'auto' | 'plan' | 'bypass'>('auto');

  const handleSend = () => {
    if (!prompt.trim() || disabled || isGenerating) return;
    onSend(prompt, {
      model: selectedModel,
      mode,
      attachments: []
    });
    setPrompt('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      data-testid="composer-container"
      style={{
        padding: '16px 32px 24px',
        maxWidth: '900px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          backgroundColor: '#121215',
          border: '1px solid #27272a',
          borderRadius: '16px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}
      >
        <textarea
          data-testid="composer-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask SuperAgent to write code, build media assets, or run MCP tools... (Press Enter to send)"
          disabled={disabled || isGenerating}
          rows={3}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '1rem',
            resize: 'none',
            fontFamily: 'inherit',
            width: '100%'
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #1f1f23',
            paddingTop: '12px',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {/* Controls: Model & Mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Model Select */}
            <select
              data-testid="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={disabled || isGenerating}
              style={{
                backgroundColor: '#1a1a1e',
                border: '1px solid #3f3f46',
                color: '#e4e4e7',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Mode Selectors */}
            <div style={{ display: 'flex', backgroundColor: '#1a1a1e', borderRadius: '6px', padding: '2px' }}>
              {(['auto', 'plan', 'bypass'] as const).map((m) => (
                <button
                  key={m}
                  data-testid={`mode-btn-${m}`}
                  onClick={() => setMode(m)}
                  disabled={disabled || isGenerating}
                  style={{
                    backgroundColor: mode === m ? '#3b82f6' : 'transparent',
                    border: 'none',
                    color: mode === m ? '#ffffff' : '#a1a1aa',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: mode === m ? 600 : 400,
                    textTransform: 'capitalize'
                  }}
                >
                  {m === 'plan' ? 'Plan-First' : m === 'bypass' ? 'Bypass' : 'Auto'}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button: Send or Stop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Shift+Enter: newline</span>
            {isGenerating ? (
              <button
                data-testid="btn-stop"
                onClick={onStop}
                style={{
                  backgroundColor: '#ef4444',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Stop ⏹
              </button>
            ) : (
              <button
                data-testid="btn-send"
                onClick={handleSend}
                disabled={disabled || !prompt.trim()}
                style={{
                  background: !prompt.trim() || disabled
                    ? '#27272a'
                    : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                  border: 'none',
                  color: !prompt.trim() || disabled ? '#71717a' : '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: !prompt.trim() || disabled ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Run Agent ⚡
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
