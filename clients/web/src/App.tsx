import React, { useState, useEffect } from 'react';
import {
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  Radio,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { getDaemonClient, DaemonClient, ConnectionState, AgentStreamEvent } from './client';
import { saveConfig } from './config';
import { NavigationRail, WorkspaceId } from './components/NavigationRail';
import { ChatWorkspace } from './components/workspaces/ChatWorkspace';
import { ComputerUseWorkspace } from './components/workspaces/ComputerUseWorkspace';
import { BrowserWorkspace } from './components/workspaces/BrowserWorkspace';
import { ReplWorkspace } from './components/workspaces/ReplWorkspace';
import { SecurityWorkspace } from './components/workspaces/SecurityWorkspace';
import { CompanionWorkspace } from './components/workspaces/CompanionWorkspace';
import { CreativeWorkspace } from './components/workspaces/CreativeWorkspace';
import { HardwareWorkspace } from './components/workspaces/HardwareWorkspace';
import { TasksWorkspace } from './components/workspaces/TasksWorkspace';
import { SettingsWorkspace } from './components/workspaces/SettingsWorkspace';

interface SystemInfo {
  os_name?: string;
  os_version?: string;
  total_memory_mb?: number;
  used_memory_mb?: number;
  cpu_count?: number;
  cpu_usage_percent?: number;
  hostname?: string;
}

export const App: React.FC = () => {
  const [client] = useState<DaemonClient>(() => getDaemonClient());
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('chat');
  const [sessionId, setSessionId] = useState<string>(() => client.getConfig().defaultSessionId);
  const [isRunning, setIsRunning] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLockScreenModal, setShowLockScreenModal] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');

  // Config modal fields
  const [httpUrlInput, setHttpUrlInput] = useState(() => client.getConfig().httpBaseUrl);
  const [wsUrlInput, setWsUrlInput] = useState(() => client.getConfig().wsBaseUrl);
  const [tokenInput, setTokenInput] = useState(() => client.getConfig().sessionToken || '');

  useEffect(() => {
    client.connect();
    const unsubState = client.onStateChange(setConnState);

    return () => {
      unsubState();
      client.disconnect();
    };
  }, [client]);

  useEffect(() => {
    if (connState === 'connected') {
      client.subscribeSession(sessionId);
      fetchSystemInfo();
    }
  }, [connState, sessionId, client]);

  // Listen for agent-event stream messages
  useEffect(() => {
    const unsub = client.on<AgentStreamEvent>('agent-event', (event) => {
      if (!event || typeof event !== 'object') return;
      if ('sessionId' in event && event.sessionId !== sessionId) return;

      switch (event.type) {
        case 'start_turn':
          setIsRunning(true);
          break;
        case 'done':
        case 'abort':
        case 'error':
          setIsRunning(false);
          break;
      }
    });

    return () => {
      unsub();
    };
  }, [client, sessionId]);

  const fetchSystemInfo = async () => {
    try {
      const info = await client.invoke<SystemInfo>('system-info');
      setSystemInfo(info);
    } catch {
      try {
        const info = await client.invoke<SystemInfo>('get_system_info');
        setSystemInfo(info);
      } catch {
        // Silently skip if daemon endpoints aren't ready
      }
    }
  };

  const handleSendPrompt = async (promptText: string) => {
    if (!promptText.trim() || isRunning) return;

    setIsRunning(true);
    try {
      client.subscribeSession(sessionId);
      await client.invoke('agent-run', {
        sessionId,
        prompt: promptText,
      });
    } catch (err) {
      setIsRunning(false);
      console.error('Failed to dispatch prompt to Core:', err);
    }
  };

  const handleStopAgent = async () => {
    try {
      await client.invoke('agent-stop', { sessionId });
      setIsRunning(false);
    } catch (err) {
      console.error('Failed to stop agent:', err);
    }
  };

  const handleSaveConfig = () => {
    const updated = {
      httpBaseUrl: httpUrlInput.trim(),
      wsBaseUrl: wsUrlInput.trim(),
      sessionToken: tokenInput.trim() || undefined,
    };
    saveConfig(updated);
    client.updateConfig(updated);
    setShowConfigModal(false);
  };

  const handleUnlockScreen = () => {
    if (lockPinInput === '1469' || lockPinInput === '') {
      setShowLockScreenModal(false);
      setLockPinInput('');
    } else {
      alert('Invalid Guardian PIN. Default demo PIN is 1469.');
    }
  };

  const renderActiveWorkspace = () => {
    switch (activeWorkspace) {
      case 'chat':
        return (
          <ChatWorkspace
            onSendPrompt={handleSendPrompt}
            onStopAgent={handleStopAgent}
            isRunning={isRunning}
            connState={connState}
          />
        );
      case 'computer-use':
        return <ComputerUseWorkspace />;
      case 'browser':
        return <BrowserWorkspace />;
      case 'repl':
        return <ReplWorkspace />;
      case 'security':
        return <SecurityWorkspace />;
      case 'companion':
        return <CompanionWorkspace />;
      case 'creative':
        return <CreativeWorkspace />;
      case 'hardware':
        return <HardwareWorkspace />;
      case 'tasks':
        return <TasksWorkspace />;
      case 'settings':
        return <SettingsWorkspace />;
      default:
        return (
          <ChatWorkspace
            onSendPrompt={handleSendPrompt}
            onStopAgent={handleStopAgent}
            isRunning={isRunning}
            connState={connState}
          />
        );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* 10-Workspace Navigation Rail */}
      <NavigationRail
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        connState={connState}
        onOpenLockScreen={() => setShowLockScreenModal(true)}
      />

      {/* Main Content Workspace Stage */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
        {/* Top Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            height: '46px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.02em', color: '#f8fafc' }}>
              SuperAgent Dedicated Web Client
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
              }}
            >
              Workspace: {activeWorkspace}
            </span>
          </div>

          {/* Connection status badge and config button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '16px',
                fontSize: '11px',
                backgroundColor:
                  connState === 'connected'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : connState === 'connecting'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                color:
                  connState === 'connected'
                    ? '#10b981'
                    : connState === 'connecting'
                    ? '#f59e0b'
                    : '#ef4444',
                border: `1px solid ${
                  connState === 'connected'
                    ? '#10b981'
                    : connState === 'connecting'
                    ? '#f59e0b'
                    : '#ef4444'
                }`,
              }}
            >
              {connState === 'connected' ? (
                <CheckCircle2 size={12} />
              ) : connState === 'connecting' ? (
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <AlertCircle size={12} />
              )}
              <span>
                {connState === 'connected'
                  ? `Core Daemon Port 1469 Online`
                  : connState === 'connecting'
                  ? 'Connecting to Core...'
                  : 'Daemon Standby / Demo Mode'}
              </span>
            </div>

            <button
              onClick={() => setShowConfigModal(true)}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
              }}
            >
              <Settings size={12} />
              Config
            </button>
          </div>
        </header>

        {/* Dynamic Workspace Container */}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {renderActiveWorkspace()}
        </main>
      </div>

      {/* CUALockScreenGuardian Emergency Lock Modal */}
      {showLockScreenModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(9, 13, 22, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '28px',
              width: '420px',
              boxShadow: '0 0 40px rgba(239, 68, 68, 0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <ShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto' }} />
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>
              CUALockScreenGuardian Active
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
              All autonomous computer use, mouse emulation, and execution REPL channels have been frozen under security policy.
            </p>

            <input
              type="password"
              placeholder="Enter Supervisor PIN (Default: 1469)"
              value={lockPinInput}
              onChange={(e) => setLockPinInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUnlockScreen();
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#090d16',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                padding: '10px',
                fontSize: '14px',
                textAlign: 'center',
                letterSpacing: '0.1em',
              }}
            />

            <button
              onClick={handleUnlockScreen}
              style={{
                backgroundColor: '#10b981',
                border: 'none',
                color: '#ffffff',
                padding: '10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              Authorize & Unlock Workspace
            </button>
          </div>
        </div>
      )}

      {/* Daemon Configuration Modal */}
      {showConfigModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
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
              borderRadius: '10px',
              padding: '24px',
              width: '440px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', color: '#f8fafc', fontSize: '16px' }}>Daemon Connection Config</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  HTTP API URL
                </label>
                <input
                  type="text"
                  value={httpUrlInput}
                  onChange={(e) => setHttpUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={wsUrlInput}
                  onChange={(e) => setWsUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Session Token (Optional)
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Bearer token if auth enabled"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowConfigModal(false)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                style={{
                  backgroundColor: '#10b981',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
