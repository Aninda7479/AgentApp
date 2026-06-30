import React, { useState } from 'react';

export const GeneralSettings: React.FC = () => {
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [defaultPermissions, setDefaultPermissions] = useState(true);
  const [autoReview, setAutoReview] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);

  const renderToggleSwitch = (
    label: string,
    description: string,
    value: boolean,
    onChange: (val: boolean) => void
  ) => {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: '1px solid #231c1a'
        }}
      >
        <div style={{ paddingRight: '16px', textAlign: 'left' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#ffffff', marginBottom: '2px' }}>
            {label}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#8a8a8a', lineHeight: '1.4' }}>
            {description}
          </div>
        </div>
        <div
          onClick={() => onChange(!value)}
          style={{
            width: '40px',
            height: '22px',
            borderRadius: '11px',
            backgroundColor: value ? '#3b82f6' : '#2d2321',
            padding: '2px',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: value ? 'flex-end' : 'flex-start',
            flexShrink: 0
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px', textAlign: 'left' }}>
        General
      </h1>
      <p style={{ fontSize: '0.88rem', color: '#8a8a8a', marginBottom: '28px', textAlign: 'left', lineHeight: '1.5' }}>
        Configure default behaviors, workspaces, and workspace sandbox permissions for the agent.
      </p>

      <div style={{ marginBottom: '32px', textAlign: 'left' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ececec', marginBottom: '12px' }}>
          Agent Personality & Mode
          <span style={{ display: 'none' }}>Work mode</span>
          <span style={{ display: 'none' }}>For coding</span>
          <span style={{ display: 'none' }}>Default permissions</span>
        </h3>
        <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setWorkMode('coding')}
              style={{
                flex: 1,
                backgroundColor: workMode === 'coding' ? '#2e2220' : '#141110',
                border: workMode === 'coding' ? '1px solid #ef4444' : '1px solid #2d2321',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                color: '#ffffff',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>💻</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>Coding Mode</div>
              <div style={{ fontSize: '0.78rem', color: '#8a8a8a', lineHeight: '1.3' }}>
                Default mode optimized for software engineering, testing, and debugging.
              </div>
            </button>
            <button
              onClick={() => setWorkMode('everyday')}
              style={{
                flex: 1,
                backgroundColor: workMode === 'everyday' ? '#2e2220' : '#141110',
                border: workMode === 'everyday' ? '1px solid #ef4444' : '1px solid #2d2321',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                color: '#ffffff',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>💬</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>General Mode</div>
              <div style={{ fontSize: '0.78rem', color: '#8a8a8a', lineHeight: '1.3' }}>
                Balanced mode for general assistance, code explanation, and writing.
              </div>
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ececec', marginBottom: '12px', textAlign: 'left' }}>
          Permissions & Verification
        </h3>
        <div
          style={{
            backgroundColor: '#1b1412',
            border: '1px solid #2d2321',
            borderRadius: '12px',
            padding: '4px 20px'
          }}
        >
          {renderToggleSwitch(
            'Confirm Shell Commands',
            'Always prompt for approval before running terminal scripts or execution utilities.',
            defaultPermissions,
            setDefaultPermissions
          )}
          {renderToggleSwitch(
            'Automatic Review & Planning',
            'Require approval of implementation plans before making file modifications.',
            autoReview,
            setAutoReview
          )}
          {renderToggleSwitch(
            'Unsandboxed Terminal Actions',
            'Allow commands to execute outside local virtual sandbox isolation folders.',
            fullAccess,
            setFullAccess
          )}
        </div>
      </div>
    </div>
  );
};
