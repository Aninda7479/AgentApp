import React, { useState } from 'react';
import {
  Globe,
  Clock,
  Layers,
  Activity,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Terminal,
  Code,
  CheckCircle,
} from 'lucide-react';
import {
  DEMO_BROWSER_TABS,
  DEMO_WEBMCP_TOOLS,
  DEMO_CDP_EVENTS,
  BrowserTabLease,
  WebMcpTool,
  CdpStreamEvent,
} from '../../demoData';

export const BrowserWorkspace: React.FC = () => {
  const [tabs, setTabs] = useState<BrowserTabLease[]>(DEMO_BROWSER_TABS);
  const [selectedTabId, setSelectedTabId] = useState<string>(DEMO_BROWSER_TABS[0].tabId);
  const [activeTierFilter, setActiveTierFilter] = useState<'all' | 'claimExistingTab' | 'createTab'>('all');
  const [cdpEvents, setCdpEvents] = useState<CdpStreamEvent[]>(DEMO_CDP_EVENTS);
  const [selectedToolName, setSelectedToolName] = useState<string>('query_table');

  const selectedTab = tabs.find((t) => t.tabId === selectedTabId) || tabs[0];
  const selectedTool = DEMO_WEBMCP_TOOLS.find((t) => t.name === selectedToolName) || DEMO_WEBMCP_TOOLS[0];

  const filteredTabs = tabs.filter((t) => {
    if (activeTierFilter === 'all') return true;
    return t.tier === activeTierFilter;
  });

  const handleRenewLease = (tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.tabId === tabId ? { ...t, remainingSeconds: t.remainingSeconds + 300 } : t))
    );
  };

  const handleReleaseLease = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.tabId !== tabId));
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
      {/* Top Header & Two-Tier Leasing Summary */}
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
          <Globe size={17} color="#3fb950" />
          <span style={{ fontWeight: 600 }}>Browser Leasing & WebMCP Studio</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#3fb950',
              border: '1px solid #238636',
            }}
          >
            CDP Port 9222 Connected
          </span>
        </div>

        {/* Tier filter pill buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setActiveTierFilter('all')}
            style={{
              backgroundColor: activeTierFilter === 'all' ? '#1e293b' : 'transparent',
              border: activeTierFilter === 'all' ? '1px solid #3b82f6' : '1px solid #334155',
              color: activeTierFilter === 'all' ? '#f8fafc' : '#94a3b8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            All Leases ({tabs.length})
          </button>
          <button
            onClick={() => setActiveTierFilter('claimExistingTab')}
            style={{
              backgroundColor: activeTierFilter === 'claimExistingTab' ? 'rgba(6,182,212,0.15)' : 'transparent',
              border: activeTierFilter === 'claimExistingTab' ? '1px solid #06b6d4' : '1px solid #334155',
              color: activeTierFilter === 'claimExistingTab' ? '#06b6d4' : '#94a3b8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Claimed User Tabs
          </button>
          <button
            onClick={() => setActiveTierFilter('createTab')}
            style={{
              backgroundColor: activeTierFilter === 'createTab' ? 'rgba(16,185,129,0.15)' : 'transparent',
              border: activeTierFilter === 'createTab' ? '1px solid #10b981' : '1px solid #334155',
              color: activeTierFilter === 'createTab' ? '#10b981' : '#94a3b8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Ephemeral Agent Tabs
          </button>
        </div>
      </div>

      {/* Main 3-Column Studio Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Two-Tier Tab Leasing Deck */}
        <div
          style={{
            width: '340px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Active Tab Leases ({filteredTabs.length})
            </div>
            <button
              onClick={() => {
                const newTab: BrowserTabLease = {
                  tabId: `tab-${Date.now()}`,
                  title: 'New Sandboxed Tab',
                  url: 'about:blank',
                  tier: 'createTab',
                  leaseholderAgentId: 'agent-adhoc-scraper',
                  remainingSeconds: 600,
                  initialLeaseSeconds: 600,
                  isAudited: true,
                  cdpSessionId: 'CDP-NEW',
                };
                setTabs((prev) => [newTab, ...prev]);
                setSelectedTabId(newTab.tabId);
              }}
              style={{
                backgroundColor: '#238636',
                border: 'none',
                color: '#ffffff',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={12} /> Lease Tab
            </button>
          </div>

          {filteredTabs.map((tab) => {
            const isSelected = tab.tabId === selectedTabId;
            const isClaimed = tab.tier === 'claimExistingTab';

            return (
              <div
                key={tab.tabId}
                onClick={() => setSelectedTabId(tab.tabId)}
                style={{
                  backgroundColor: isSelected ? '#1e293b' : '#111827',
                  border: isSelected ? '1px solid #3fb950' : '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isClaimed ? 'rgba(6,182,212,0.2)' : 'rgba(16,185,129,0.2)',
                      color: isClaimed ? '#06b6d4' : '#10b981',
                      border: `1px solid ${isClaimed ? '#06b6d4' : '#10b981'}`,
                      fontWeight: 600,
                    }}
                  >
                    {isClaimed ? 'claimExistingTab (Shared)' : 'createTab (Isolated)'}
                  </span>

                  {/* Lease Countdown Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f59e0b' }}>
                    <Clock size={11} />
                    <span>{Math.floor(tab.remainingSeconds / 60)}m {tab.remainingSeconds % 60}s</span>
                  </div>
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </div>

                <div style={{ fontSize: '11px', color: '#58a6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  {tab.url}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                  <span>{tab.leaseholderAgentId}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenewLease(tab.tabId);
                      }}
                      title="Renew Lease (+5m)"
                      style={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        color: '#c9d1d9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                      }}
                    >
                      +5m Renew
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReleaseLease(tab.tabId);
                      }}
                      title="Release Lease"
                      style={{
                        backgroundColor: 'rgba(239,68,68,0.2)',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                      }}
                    >
                      Release
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center Column: Injected DOM Badge Preview & CDP Inspector */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#090d16',
            padding: '16px',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* Injected DOM Badge Preview Frame */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <ShieldCheck size={16} color="#3fb950" />
                <span>Injected DOM Badge Preview (Target Page Overlay)</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                CDP Session: {selectedTab.cdpSessionId}
              </span>
            </div>

            {/* Simulated Webpage Surface with Injected SuperAgent Badge */}
            <div
              style={{
                position: 'relative',
                height: '240px',
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '20px',
                color: '#1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                {selectedTab.title}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                URL: <span style={{ color: '#2563eb' }}>{selectedTab.url}</span>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#334155' }}>
                WebMCP DOM observer active. The agent can evaluate DOM expressions, extract structured tables, or trigger synthetic click and input events.
              </p>

              {/* Floating Injected SuperAgent Badge (Bottom Right) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  right: '16px',
                  backgroundColor: '#090d16',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  border: '1px solid #1f6feb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                <span style={{ fontWeight: 600 }}>SuperAgent Leased</span>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>({selectedTab.leaseholderAgentId})</span>
              </div>
            </div>
          </div>

          {/* CDP Stream Event Inspector */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Terminal size={15} color="#58a6ff" />
                <span>CDP Stream Event Inspector</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Live DevTools Protocol frames
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                backgroundColor: '#090d16',
                borderRadius: '6px',
                padding: '8px',
                border: '1px solid #1e293b',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {cdpEvents.map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderBottom: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#64748b' }}>{evt.timestamp}</span>
                    <span style={{ color: '#ec4899', fontWeight: 600 }}>{evt.method}</span>
                    <span style={{ color: '#cbd5e1' }}>{evt.payloadSummary}</span>
                  </div>
                  <span style={{ color: '#10b981' }}>{evt.latencyMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: WebMCP In-Page Tools Registry */}
        <div
          style={{
            width: '360px',
            borderLeft: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
            WebMCP In-Page Registry ({DEMO_WEBMCP_TOOLS.length})
          </div>

          {DEMO_WEBMCP_TOOLS.map((tool) => {
            const isSelected = tool.name === selectedToolName;

            return (
              <div
                key={tool.name}
                onClick={() => setSelectedToolName(tool.name)}
                style={{
                  backgroundColor: isSelected ? '#1e293b' : '#111827',
                  border: isSelected ? '1px solid #8b5cf6' : '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#c084fc', fontSize: '13px', fontFamily: 'monospace' }}>
                    {tool.name}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {tool.callCount} calls
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  {tool.description}
                </div>

                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Injected Script: {tool.injectedScriptSizeKb} KB</span>
                  <span>Required: {tool.parameters.required.join(', ') || 'none'}</span>
                </div>
              </div>
            );
          })}

          {/* Selected Tool JSON Schema Viewer */}
          <div
            style={{
              marginTop: '10px',
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              Input Parameter Schema ({selectedTool.name})
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '11px',
                color: '#38bdf8',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.4',
              }}
            >
              {JSON.stringify(selectedTool.parameters, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
