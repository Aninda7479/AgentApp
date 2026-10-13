import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Activity,
  Send,
  Square,
  Server,
  Settings,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { getDaemonClient, DaemonClient, ConnectionState, AgentStreamEvent } from './client';
import { saveConfig } from './config';

interface SystemInfo {
  os_name?: string;
  os_version?: string;
  total_memory_mb?: number;
  used_memory_mb?: number;
  cpu_count?: number;
  cpu_usage_percent?: number;
  hostname?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
  timestamp: number;
}

export const App: React.FC = () => {
  const [client] = useState<DaemonClient>(() => getDaemonClient());
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [sessionId, setSessionId] = useState<string>(() => client.getConfig().defaultSessionId);
  const [prompt, setPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [httpUrlInput, setHttpUrlInput] = useState(() => client.getConfig().httpBaseUrl);
  const [wsUrlInput, setWsUrlInput] = useState(() => client.getConfig().wsBaseUrl);
  const [tokenInput, setTokenInput] = useState(() => client.getConfig().sessionToken || '');
  const [activeThought, setActiveThought] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.connect();
    const unsubState = client.onStateChange(setConnState);

    return () => {
      unsubState();
      client.disconnect();
    };
  }, [client]);

  // Subscribe to current session when session or socket changes
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
          setActiveThought('');
          setCurrentResponse('');
          break;

        case 'token':
          setCurrentResponse((prev) => prev + event.content);
          break;

        case 'thought':
          setActiveThought((prev) => prev + event.content);
          break;

        case 'tool_call':
          // Log tool call into thread
          setMessages((prev) => [
            ...prev,
            {
              id: event.toolCallId || String(Date.now()),
              role: 'system',
              content: `Tool Execution: ${event.toolName}`,
              toolCalls: [{ name: event.toolName, args: event.toolArgs }],
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'tool_result':
          // Update tool call result
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === event.toolCallId && msg.toolCalls && msg.toolCalls[0]) {
                return {
                  ...msg,
                  toolCalls: [{ ...msg.toolCalls[0], result: event.toolResult }],
                };
              }
              return msg;
            })
          );
          break;

        case 'done':
        case 'abort':
          setIsRunning(false);
          // Commit stream response into message list
          setCurrentResponse((finalText) => {
            setActiveThought((finalThought) => {
              if (finalText.trim() || finalThought.trim()) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: String(Date.now()),
                    role: 'assistant',
                    content: finalText,
                    thought: finalThought || undefined,
                    timestamp: Date.now(),
                  },
                ]);
              }
              return '';
            });
            return '';
          });
          break;

        case 'error':
          setIsRunning(false);
          setMessages((prev) => [
            ...prev,
            {
              id: String(Date.now()),
              role: 'system',
              content: `Error: ${event.error}`,
              timestamp: Date.now(),
            },
          ]);
          break;
      }
    });

    return () => {
      unsub();
    };
  }, [client, sessionId]);

  // Scroll to bottom on messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse, activeThought]);

  const fetchSystemInfo = async () => {
    try {
      const info = await client.invoke<SystemInfo>('system-info');
      setSystemInfo(info);
    } catch {
      // Best effort fallback
      try {
        const info = await client.invoke<SystemInfo>('get_system_info');
        setSystemInfo(info);
      } catch {
        // Silently skip if daemon endpoints aren't ready
      }
    }
  };

  const handleSendPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isRunning) return;

    const userText = prompt.trim();
    setPrompt('');

    // Append user message to view
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      },
    ]);

    setIsRunning(true);
    setActiveThought('');
    setCurrentResponse('');

    try {
      client.subscribeSession(sessionId);
      await client.invoke('agent-run', {
        sessionId,
        prompt: userText,
      });
    } catch (err) {
      setIsRunning(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'system',
          content: `Failed to dispatch prompt: ${errMsg}`,
          timestamp: Date.now(),
        },
      ]);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#0d1117', color: '#c9d1d9' }}>
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #30363d',
          backgroundColor: '#161b22',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#1f6feb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#ffffff',
            }}
          >
            SA
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#f0f6fc' }}>SuperAgent Web</div>
            <div style={{ fontSize: '11px', color: '#8b949e' }}>Pure Decoupled Client</div>
          </div>
        </div>

        {/* Connection & Port Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              backgroundColor:
                connState === 'connected'
                  ? 'rgba(35, 134, 54, 0.2)'
                  : connState === 'connecting'
                  ? 'rgba(187, 128, 9, 0.2)'
                  : 'rgba(218, 54, 51, 0.2)',
              color:
                connState === 'connected'
                  ? '#3fb950'
                  : connState === 'connecting'
                  ? '#d29922'
                  : '#f85149',
              border: `1px solid ${
                connState === 'connected'
                  ? '#238636'
                  : connState === 'connecting'
                  ? '#bb8009'
                  : '#da3633'
              }`,
            }}
          >
            {connState === 'connected' ? (
              <CheckCircle2 size={13} />
            ) : connState === 'connecting' ? (
              <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <AlertCircle size={13} />
            )}
            <span>
              {connState === 'connected'
                ? `Core Online (${client.getConfig().httpBaseUrl})`
                : connState === 'connecting'
                ? 'Connecting to Core...'
                : 'Daemon Offline'}
            </span>
          </div>

          <button
            onClick={() => setShowConfigModal(true)}
            style={{
              background: 'none',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <Settings size={14} />
            Config
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Session & Daemon Info */}
        <aside
          style={{
            width: '260px',
            borderRight: '1px solid #30363d',
            backgroundColor: '#0d1117',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b949e', marginBottom: '8px' }}>
              Active Session
            </div>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#f0f6fc',
                padding: '6px 10px',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Daemon Status Card */}
          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#f0f6fc', fontSize: '13px', fontWeight: 600 }}>
              <Server size={14} color="#58a6ff" />
              Daemon Telemetry
            </div>

            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#8b949e' }}>
              <div>Host: <span style={{ color: '#c9d1d9' }}>{systemInfo?.hostname || 'localhost'}</span></div>
              <div>OS: <span style={{ color: '#c9d1d9' }}>{systemInfo?.os_name || 'Generic'}</span></div>
              {systemInfo?.cpu_count && (
                <div>CPUs: <span style={{ color: '#c9d1d9' }}>{systemInfo.cpu_count} cores</span></div>
              )}
              {systemInfo?.total_memory_mb && (
                <div>RAM: <span style={{ color: '#c9d1d9' }}>{Math.round(systemInfo.total_memory_mb / 1024)} GB</span></div>
              )}
            </div>

            <button
              onClick={fetchSystemInfo}
              style={{
                marginTop: '10px',
                width: '100%',
                padding: '4px',
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#8b949e',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </aside>

        {/* Right Main Chat Thread & Composer */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Scrollable Message List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.length === 0 && !isRunning && (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#8b949e', maxWidth: '400px' }}>
                <Sparkles size={36} color="#58a6ff" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ color: '#f0f6fc', margin: '0 0 8px' }}>SuperAgent Web Client Ready</h3>
                <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
                  Connected to SuperAgent Core daemon over port 1469. Send a prompt below to launch autonomous workflows.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  backgroundColor: m.role === 'user' ? '#1f6feb' : m.role === 'system' ? '#161b22' : '#21262d',
                  color: '#f0f6fc',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: m.role === 'system' ? '1px solid #30363d' : 'none',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}
              >
                {m.thought && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#8b949e',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      padding: '8px',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #6e7681',
                      fontStyle: 'italic',
                    }}
                  >
                    {m.thought}
                  </div>
                )}
                {m.content}
                {m.toolCalls && m.toolCalls[0] && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#58a6ff', fontFamily: 'monospace' }}>
                    ⚙ {m.toolCalls[0].name}({JSON.stringify(m.toolCalls[0].args)})
                  </div>
                )}
              </div>
            ))}

            {/* Active Streaming Token / Thought Response */}
            {(activeThought || currentResponse) && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '75%',
                  backgroundColor: '#21262d',
                  color: '#f0f6fc',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid #388bfd',
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                {activeThought && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#8b949e',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      padding: '8px',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #58a6ff',
                      fontStyle: 'italic',
                    }}
                  >
                    Thinking: {activeThought}
                  </div>
                )}
                {currentResponse}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Composer */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid #30363d',
              backgroundColor: '#161b22',
            }}
          >
            <form onSubmit={handleSendPrompt} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                placeholder="Ask SuperAgent or enter an autonomous task (Enter to send)..."
                rows={2}
                disabled={connState !== 'connected'}
                style={{
                  flex: 1,
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#f0f6fc',
                  fontSize: '14px',
                  resize: 'none',
                  outline: 'none',
                }}
              />

              {isRunning ? (
                <button
                  type="button"
                  onClick={handleStopAgent}
                  style={{
                    backgroundColor: '#da3633',
                    border: 'none',
                    color: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                  }}
                >
                  <Square size={16} /> Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim() || connState !== 'connected'}
                  style={{
                    backgroundColor: '#238636',
                    border: 'none',
                    color: '#ffffff',
                    padding: '12px 18px',
                    borderRadius: '8px',
                    cursor: prompt.trim() && connState === 'connected' ? 'pointer' : 'not-allowed',
                    opacity: prompt.trim() && connState === 'connected' ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                  }}
                >
                  <Send size={16} /> Send
                </button>
              )}
            </form>
          </div>
        </main>
      </div>

      {/* Configuration Modal */}
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
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '10px',
              padding: '24px',
              width: '420px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', color: '#f0f6fc' }}>Daemon Connection Config</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>
                  HTTP API URL
                </label>
                <input
                  type="text"
                  value={httpUrlInput}
                  onChange={(e) => setHttpUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#f0f6fc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={wsUrlInput}
                  onChange={(e) => setWsUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#f0f6fc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>
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
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#f0f6fc',
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
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                style={{
                  backgroundColor: '#238636',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
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
