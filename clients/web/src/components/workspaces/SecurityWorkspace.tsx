import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  AlertTriangle,
  CheckCircle,
  Clock,
  Layers,
  FileCheck,
  Cpu,
} from 'lucide-react';
import {
  DEMO_CONFIRMATION_TIERS,
  DEMO_ZO_DECISION_STATES,
  DEMO_CREDENTIAL_RECOVERY_BRANCHES,
  SecurityConfirmationTier,
  ZoDecisionState,
  CredentialRecoveryBranch,
} from '../../demoData';

export const SecurityWorkspace: React.FC = () => {
  const [selectedTierId, setSelectedTierId] = useState<string>('always_confirm');
  const [states, setStates] = useState<ZoDecisionState[]>(DEMO_ZO_DECISION_STATES);
  const [recoveryBranches] = useState<CredentialRecoveryBranch[]>(DEMO_CREDENTIAL_RECOVERY_BRANCHES);
  const [isGuardianLocked, setIsGuardianLocked] = useState<boolean>(true);
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string>('rec-2');

  const selectedTier = DEMO_CONFIRMATION_TIERS.find((t) => t.id === selectedTierId) || DEMO_CONFIRMATION_TIERS[1];

  const handleToggleState = (idx: number) => {
    setStates((prev) =>
      prev.map((s) => (s.stateIndex === idx ? { ...s, active: !s.active } : s))
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header & CUALockScreenGuardian Status Shield */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={17} color="#f85149" />
          <span style={{ fontWeight: 600 }}>4-Tier Security Guardian & Credential Vault</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#f85149',
              border: '1px solid #da3633',
            }}
          >
            zo Decision Engine v16 Active
          </span>
        </div>

        {/* CUALockScreenGuardian Shield Indicator & Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: isGuardianLocked ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${isGuardianLocked ? '#10b981' : '#ef4444'}`,
              fontSize: '12px',
            }}
          >
            {isGuardianLocked ? <ShieldCheck size={14} color="#10b981" /> : <ShieldAlert size={14} color="#ef4444" />}
            <span style={{ color: isGuardianLocked ? '#10b981' : '#ef4444', fontWeight: 600 }}>
              CUALockScreenGuardian: {isGuardianLocked ? 'Shield Engaged (Tamper Proof)' : 'Shield Unlocked'}
            </span>
          </div>

          <button
            onClick={() => setIsGuardianLocked((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {isGuardianLocked ? <Unlock size={13} /> : <Lock size={13} />}
            {isGuardianLocked ? 'Release OS Lock' : 'Engage OS Lock'}
          </button>

          <button
            onClick={() => setShowRecoveryModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1f6feb',
              border: 'none',
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Key size={13} /> 7-Branch Vault Recovery
          </button>
        </div>
      </div>

      {/* Main Security Center Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: 4-Tier Confirmation Matrix */}
        <div
          style={{
            width: '380px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
            4-Tier Confirmation Boundaries
          </div>

          {DEMO_CONFIRMATION_TIERS.map((tier) => {
            const isSelected = tier.id === selectedTierId;

            return (
              <div
                key={tier.id}
                onClick={() => setSelectedTierId(tier.id)}
                style={{
                  backgroundColor: isSelected ? '#1e293b' : '#111827',
                  border: isSelected ? `1px solid ${tier.badgeColor}` : '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>
                    {tier.title}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: `${tier.badgeColor}22`,
                      color: tier.badgeColor,
                      border: `1px solid ${tier.badgeColor}`,
                      fontWeight: 700,
                    }}
                  >
                    {tier.riskRating}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  {tier.description}
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Authorized Capabilities:</div>
                  <ul style={{ margin: '0', paddingLeft: '16px', color: '#64748b' }}>
                    {tier.allowedActions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: 16-State `zo` Decision Machine Grid */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#090d16',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Deterministic 16-State zo Decision Machine ({states.filter((s) => s.active).length} Active Guards)
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Click any state card to inspect transitions or simulate fault injection
            </span>
          </div>

          {/* 4x4 Grid of 16-State zo Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {states.map((state) => (
              <div
                key={state.stateIndex}
                onClick={() => handleToggleState(state.stateIndex)}
                style={{
                  backgroundColor: state.active ? '#1e293b' : '#0f172a',
                  border: state.active ? '1px solid #f85149' : '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: state.active ? '#f85149' : '#64748b',
                      fontWeight: 700,
                    }}
                  >
                    S{state.stateIndex.toString().padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#161b22',
                      color: '#94a3b8',
                    }}
                  >
                    {state.category}
                  </span>
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', color: state.active ? '#fca5a5' : '#f8fafc' }}>
                  {state.name}
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                  {state.description}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '4px',
                    fontSize: '10px',
                    color: state.active ? '#10b981' : '#64748b',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: state.active ? '#10b981' : '#475569',
                    }}
                  />
                  <span>{state.active ? 'Armed & Monitoring' : 'Standby'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7-Branch Credential Vault Recovery Dialog Modal */}
      {showRecoveryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '24px',
              width: '560px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                <Key size={18} color="#f59e0b" />
                <span>Credential Vault 7-Branch Disaster Recovery</span>
              </div>
              <button
                onClick={() => setShowRecoveryModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
              Select a designated cryptographic recovery branch to reconstitute your scrypt master vault keys in case of device failure or supervisor lockout.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recoveryBranches.map((branch) => {
                const isSelected = branch.id === activeBranchId;

                return (
                  <div
                    key={branch.id}
                    onClick={() => setActiveBranchId(branch.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#1e293b' : '#090d16',
                      border: isSelected ? '1px solid #f59e0b' : '1px solid #1e293b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: isSelected ? '#fbbf24' : '#f8fafc' }}>
                        {branch.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {branch.description}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: branch.status === 'Ready' ? 'rgba(16,185,129,0.2)' : '#1e293b',
                          color: branch.status === 'Ready' ? '#10b981' : '#94a3b8',
                          fontWeight: 600,
                        }}
                      >
                        {branch.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setShowRecoveryModal(false)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Recovery initiated with branch: ${activeBranchId}`);
                  setShowRecoveryModal(false);
                }}
                style={{
                  backgroundColor: '#f59e0b',
                  border: 'none',
                  color: '#000000',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Proceed with Recovery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
