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
  activeProject?: string;
  onAttachClick?: () => void;
  onMicClick?: () => void;
  onLocallyClick?: () => void;
  onBranchClick?: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  isGenerating = false,
  onStop,
  availableModels = ['5.5 Medium', 'o3-mini', 'gpt-4o', 'claude-3-5-sonnet'],
  defaultModel = '5.5 Medium',
  activeProject = 'GlacierPharma',
  onAttachClick,
  onMicClick,
  onLocallyClick,
  onBranchClick
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [approvalMode, setApprovalMode] = useState<'always' | 'never' | 'ask'>('ask');
  const [showApprovalDropdown, setShowApprovalDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const handleSend = () => {
    if (!prompt.trim() || disabled || isGenerating) return;
    onSend(prompt, {
      model: selectedModel,
      mode: approvalMode === 'always' ? 'auto' : approvalMode === 'never' ? 'bypass' : 'plan',
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

  const getApprovalLabel = () => {
    if (approvalMode === 'always') return 'Always approve';
    if (approvalMode === 'never') return 'Never approve';
    return 'Ask for approval';
  };

  return (
    <div
      data-testid="composer-container"
      style={{
        padding: '16px 24px 24px',
        maxWidth: '900px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      {/* The main input composer card */}
      <div
        style={{
          backgroundColor: '#1b1412', // Warm dark card background
          border: '1px solid #2d2321',
          borderRadius: '20px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          position: 'relative'
        }}
      >
        <textarea
          data-testid="composer-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Do anything"
          disabled={disabled || isGenerating}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '1.05rem',
            resize: 'none',
            fontFamily: 'inherit',
            width: '100%',
            minHeight: '60px',
            lineHeight: '1.5'
          }}
        />

        {/* Toolbar row inside box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #2d2321',
            paddingTop: '12px',
            marginTop: '12px'
          }}
        >
          {/* Left toolbar elements */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            {/* Plus button */}
            <button
              data-testid="composer-attach-btn"
              onClick={onAttachClick}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#8a8a8a',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              +
            </button>

            {/* Ask for Approval Dropdown Pill */}
            <div style={{ position: 'relative' }}>
              <button
                data-testid="approval-dropdown-btn"
                onClick={() => setShowApprovalDropdown(!showApprovalDropdown)}
                style={{
                  backgroundColor: '#2e2220',
                  border: '1px solid #3d302e',
                  color: '#ececec',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>✋</span> {getApprovalLabel()} <span style={{ fontSize: '0.65rem', color: '#8a8a8a' }}>▼</span>
              </button>

              {showApprovalDropdown && (
                <div
                  data-testid="approval-dropdown-menu"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: '8px',
                    backgroundColor: '#261c1a',
                    border: '1px solid #3d2b29',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 10,
                    width: '180px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    data-testid="approval-option-ask"
                    onClick={() => {
                      setApprovalMode('ask');
                      setShowApprovalDropdown(false);
                    }}
                    style={{ padding: '10px 12px', fontSize: '0.85rem', cursor: 'pointer', color: '#ececec' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    Ask for approval
                  </div>
                  <div
                    data-testid="approval-option-always"
                    onClick={() => {
                      setApprovalMode('always');
                      setShowApprovalDropdown(false);
                    }}
                    style={{ padding: '10px 12px', fontSize: '0.85rem', cursor: 'pointer', color: '#ececec' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    Always approve
                  </div>
                  <div
                    data-testid="approval-option-never"
                    onClick={() => {
                      setApprovalMode('never');
                      setShowApprovalDropdown(false);
                    }}
                    style={{ padding: '10px 12px', fontSize: '0.85rem', cursor: 'pointer', color: '#ececec' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    Never approve
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right toolbar elements */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Model Badge */}
            <div style={{ position: 'relative' }}>
              <button
                data-testid="model-dropdown-btn"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#8a8a8a',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px'
                }}
              >
                <span>{selectedModel}</span> <span style={{ fontSize: '0.65rem' }}>▼</span>
              </button>

              {showModelDropdown && (
                <div
                  data-testid="model-dropdown-menu"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '8px',
                    backgroundColor: '#261c1a',
                    border: '1px solid #3d2b29',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 10,
                    width: '150px',
                    overflow: 'hidden'
                  }}
                >
                  {availableModels.map((model) => (
                    <div
                      key={model}
                      data-testid={`model-option-${model.replace(/\s+/g, '-')}`}
                      onClick={() => {
                        setSelectedModel(model);
                        setShowModelDropdown(false);
                      }}
                      style={{ padding: '10px 12px', fontSize: '0.85rem', cursor: 'pointer', color: '#ececec' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b2f2d')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {model}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mic Icon */}
            <button
              data-testid="composer-mic-btn"
              onClick={onMicClick}
              style={{
                background: 'none',
                border: 'none',
                color: '#8a8a8a',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              🎙️
            </button>

            {/* Submit Up Arrow Button */}
            {isGenerating ? (
              <button
                data-testid="btn-stop"
                onClick={onStop}
                style={{
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem'
                }}
              >
                ⏹
              </button>
            ) : (
              <button
                data-testid="btn-send"
                onClick={handleSend}
                disabled={disabled || !prompt.trim()}
                style={{
                  backgroundColor: !prompt.trim() || disabled ? '#2d2321' : '#ececec',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: !prompt.trim() || disabled ? '#8a8a8a' : '#1b1412',
                  cursor: !prompt.trim() || disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.15s ease'
                }}
              >
                ↑
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Under-composer badge row: Folder, Work locally, main branch */}
      <div
        data-testid="composer-badges-row"
        style={{
          display: 'flex',
          gap: '8px',
          paddingLeft: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        {/* Project Folder Badge */}
        <div
          data-testid="badge-project"
          style={{
            backgroundColor: '#1b1412',
            border: '1px solid #2d2321',
            borderRadius: '16px',
            color: '#ececec',
            padding: '4px 12px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500
          }}
        >
          <span>📁</span> {activeProject}
        </div>

        {/* Work Locally Badge */}
        <div
          data-testid="badge-work-locally"
          onClick={onLocallyClick}
          style={{
            backgroundColor: '#1b1412',
            border: '1px solid #2d2321',
            borderRadius: '16px',
            color: '#ececec',
            padding: '4px 12px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <span>💻</span> Work locally <span style={{ fontSize: '0.6rem', color: '#8a8a8a' }}>▼</span>
        </div>

        {/* Git Branch Badge */}
        <div
          data-testid="badge-branch"
          onClick={onBranchClick}
          style={{
            backgroundColor: '#1b1412',
            border: '1px solid #2d2321',
            borderRadius: '16px',
            color: '#ececec',
            padding: '4px 12px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <span>🌿</span> main <span style={{ fontSize: '0.6rem', color: '#8a8a8a' }}>▼</span>
        </div>
      </div>
    </div>
  );
};
