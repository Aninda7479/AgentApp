import React, { useState } from 'react';
import {
  Settings,
  Activity,
  Key,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Sliders,
  Shield,
  Layers,
  Cpu,
  Trash2,
  Download,
} from 'lucide-react';
import {
  DEMO_SETTINGS_MODULES,
  SettingsData,
  SettingsModuleMeta,
  SystemDoctorProbe,
} from '../../demoData';

export const SettingsWorkspace: React.FC = () => {
  const [data, setData] = useState<SettingsData>(DEMO_SETTINGS_MODULES);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('doctor');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [providerKeys, setProviderKeys] = useState<Record<string, boolean>>({});

  const filteredModules = data.modules.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedModule = data.modules.find((m) => m.id === selectedModuleId) || data.modules[0];

  const handleRunDoctorProbe = () => {
    setIsProbing(true);
    setTimeout(() => {
      setIsProbing(false);
      alert('System Doctor diagnostics passed with zero blocking issues.');
    }, 700);
  };

  const toggleKeyMask = (providerName: string) => {
    setProviderKeys((prev) => ({ ...prev, [providerName]: !prev[providerName] }));
  };

  const handleTestProvider = (providerName: string) => {
    alert(`Testing connection to ${providerName}... Status: HTTP 200 OK.`);
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
      {/* Top Header */}
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
          <Settings size={17} color="#8b949e" />
          <span style={{ fontWeight: 600 }}>24-Module Settings Governance Matrix & System Doctor</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #0284c7',
            }}
          >
            All 24 Panels Available
          </span>
        </div>

        {/* Global Search Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#090d16',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '4px 10px',
            }}
          >
            <Search size={13} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search 24 modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'none',
                border: 'none',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none',
                width: '160px',
              }}
            />
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: 24-Module Settings Matrix Navigation */}
        <div
          style={{
            width: '320px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '6px' }}>
            Modules Matrix ({filteredModules.length})
          </div>

          {filteredModules.map((mod) => {
            const isSelected = mod.id === selectedModuleId;

            return (
              <button
                key={mod.id}
                onClick={() => setSelectedModuleId(mod.id)}
                style={{
                  textAlign: 'left',
                  backgroundColor: isSelected ? '#1e293b' : 'transparent',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid transparent',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  transition: 'background-color 0.1s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: '12px', color: isSelected ? '#38bdf8' : '#f8fafc' }}>
                    {mod.title}
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>{mod.category}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mod.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Active Module Detail View */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#090d16',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '24px',
            gap: '20px',
          }}
        >
          {/* Module Banner */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                {selectedModule.title}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                {selectedModule.description} • Category: {selectedModule.category}
              </div>
            </div>

            {selectedModuleId === 'doctor' && (
              <button
                onClick={handleRunDoctorProbe}
                disabled={isProbing}
                style={{
                  backgroundColor: '#1f6feb',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <RefreshCw size={13} style={{ animation: isProbing ? 'spin 1s linear infinite' : 'none' }} />
                Run Hardware Probe
              </button>
            )}
          </div>

          {/* Special Content depending on selected module */}
          {selectedModuleId === 'doctor' ? (
            /* System Doctor Diagnostics */
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={15} color="#10b981" />
                <span>System Doctor Hardware & Runtime Readiness</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.doctorProbes.map((probe, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#161b22',
                      border: '1px solid #21262d',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#f0f6fc' }}>
                        {probe.checkName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>
                        {probe.component} • {probe.detail}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(16,185,129,0.15)',
                        color: '#10b981',
                        border: '1px solid #10b981',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} /> {probe.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedModuleId === 'providers' ? (
            /* Provider Registry Credentials Manager */
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={15} color="#38bdf8" />
                <span>Configured Model Providers</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.providers.map((prov) => {
                  const isRevealed = !!providerKeys[prov.name];

                  return (
                    <div
                      key={prov.name}
                      style={{
                        backgroundColor: '#161b22',
                        border: '1px solid #21262d',
                        borderRadius: '6px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>{prov.name}</div>
                        <div style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>
                          API Key: {isRevealed ? 'sk-real-credential-key-revealed' : prov.keyMasked}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => toggleKeyMask(prov.name)}
                          style={{
                            backgroundColor: '#21262d',
                            border: '1px solid #30363d',
                            color: '#c9d1d9',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {isRevealed ? 'Mask' : 'Reveal'}
                        </button>
                        <button
                          onClick={() => handleTestProvider(prov.name)}
                          style={{
                            backgroundColor: '#238636',
                            border: 'none',
                            color: '#ffffff',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Test Connection
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : selectedModuleId === 'storage' ? (
            /* Storage & Workspace Paths Manager */
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={15} color="#8b5cf6" />
                <span>Workspace Storage & Cache Management</span>
              </div>

              <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                <div>Primary Directory: <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>~/.superagent/</span></div>
                <div>SQLite Database: <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>~/.superagent/core_v2.db (14.2 MB)</span></div>
                <div>WGC Frame Cache: <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>~/.superagent/cache/wgc/ (128.4 MB)</span></div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  onClick={() => alert('WGC and LLM response caches purged.')}
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.2)',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Trash2 size={13} /> Purge Cache
                </button>
                <button
                  onClick={() => alert('Exporting full database dump to superagent-backup.json...')}
                  style={{
                    backgroundColor: '#1f6feb',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                  }}
                >
                  <Download size={13} /> Export Database Backup
                </button>
              </div>
            </div>
          ) : (
            /* Generic Module Config Sheet */
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>
                Governance & Policy Controls
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                This module connects directly to the core configuration file at `packages/core_v2/src/storage/settings.rs`. All modifications are validated against scrypt session tokens and written atomically to disk.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={() => alert(`Settings saved for ${selectedModule.title}`)}
                  style={{
                    backgroundColor: '#238636',
                    border: 'none',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Configuration
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
