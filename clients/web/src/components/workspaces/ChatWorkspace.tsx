import React, { useState } from 'react';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode,
  Eye,
  Search,
  Globe,
  Sparkles,
  Send,
  Square,
  Paperclip,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { DEMO_CHAT_TRAJECTORY, DemoChatMessage, TrajectoryToolCall, QuizQuestion } from '../../demoData';
import { ConnectionState } from '../../client';

interface ChatWorkspaceProps {
  onSendPrompt?: (text: string) => void;
  onStopAgent?: () => void;
  isRunning?: boolean;
  connState?: ConnectionState;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  onSendPrompt,
  onStopAgent,
  isRunning = false,
  connState = 'connected',
}) => {
  const [messages, setMessages] = useState<DemoChatMessage[]>(DEMO_CHAT_TRAJECTORY);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-3-5-sonnet');
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always' | 'never'>('ask');
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({ 'msg-02': false });
  const [expandedToolDiffs, setExpandedToolDiffs] = useState<Record<string, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({ 'quiz-01': 0 });
  const [attachments, setAttachments] = useState<string[]>(['SmartSensor_RevC.kicad_pcb']);

  const toggleThought = (msgId: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleToolDiff = (toolId: string) => {
    setExpandedToolDiffs((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSelectQuiz = (quizId: string, optionIndex: number) => {
    setQuizAnswers((prev) => ({ ...prev, [quizId]: optionIndex }));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isRunning) return;

    const userMsg: DemoChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    onSendPrompt?.(inputText.trim());
    setInputText('');
  };

  const renderToolIcon = (category: TrajectoryToolCall['category']) => {
    switch (category) {
      case 'Ran':
        return <Terminal size={14} color="#58a6ff" />;
      case 'Edited':
        return <FileCode size={14} color="#10b981" />;
      case 'Read':
        return <Eye size={14} color="#ec4899" />;
      case 'Searched':
        return <Search size={14} color="#f59e0b" />;
      case 'Browsed':
        return <Globe size={14} color="#06b6d4" />;
      default:
        return <Sparkles size={14} color="#8b5cf6" />;
    }
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
      {/* Top Session Breadcrumb Bar */}
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
          <MessageSquare size={16} color="#1f6feb" />
          <span style={{ fontWeight: 600, color: '#f8fafc' }}>Session: session-wgc-directx-stream</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
            }}
          >
            Autonomous Trajectory Active
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          <span style={{ color: '#94a3b8' }}>Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              padding: '4px 8px',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (200k)</option>
            <option value="gpt-4o">GPT-4o Omnichannel</option>
            <option value="gemini-1-5-pro">Gemini 1.5 Pro (2M)</option>
            <option value="deepseek-r1">DeepSeek R1 (Reasoning)</option>
          </select>

          <span style={{ color: '#94a3b8' }}>Approval:</span>
          <select
            value={approvalMode}
            onChange={(e) => setApprovalMode(e.target.value as 'ask' | 'always' | 'never')}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              padding: '4px 8px',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value="ask">Ask Before Dangerous Ops</option>
            <option value="always">Always Allow (Autonomous)</option>
            <option value="never">Read-Only Enforced</option>
          </select>
        </div>
      </div>

      {/* Main Trajectory Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {messages.map((m) => {
          const isUser = m.role === 'user';

          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                width: isUser ? 'auto' : '100%',
                maxWidth: isUser ? '80%' : '880px',
                gap: '8px',
              }}
            >
              {/* User / Assistant Header pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  paddingLeft: isUser ? '0' : '4px',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <span style={{ fontWeight: 600, color: isUser ? '#58a6ff' : '#8b5cf6' }}>
                  {isUser ? 'Supervisor' : 'SuperAgent Core'}
                </span>
                <span>•</span>
                <span>{m.timestamp}</span>
              </div>

              {/* Message Content Bubble */}
              <div
                style={{
                  backgroundColor: isUser ? '#1e3a8a' : '#0f172a',
                  border: isUser ? '1px solid #2563eb' : '1px solid #1e293b',
                  borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '14px 18px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#f8fafc',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                }}
              >
                {/* Collapsible Thought Card */}
                {m.thought && (
                  <div
                    style={{
                      marginBottom: '14px',
                      backgroundColor: '#1e1b4b',
                      border: '1px solid #4338ca',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => toggleThought(m.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        color: '#c7d2fe',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#818cf8" />
                        <span>Thought for {m.thought.durationSeconds}s</span>
                      </div>
                      {expandedThoughts[m.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {expandedThoughts[m.id] && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderTop: '1px solid #3730a3',
                          fontSize: '12px',
                          fontFamily: 'Consolas, Monaco, monospace',
                          color: '#e0e7ff',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.5',
                          backgroundColor: 'rgba(0,0,0,0.25)',
                        }}
                      >
                        {m.thought.content}
                      </div>
                    )}
                  </div>
                )}

                {/* Main text content */}
                <div>{m.content}</div>

                {/* Tool Call Execution Rows */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div
                    style={{
                      marginTop: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                      Tool Executions ({m.toolCalls.length})
                    </div>

                    {m.toolCalls.map((tc) => {
                      const isDiffOpen = expandedToolDiffs[tc.id];

                      return (
                        <div
                          key={tc.id}
                          style={{
                            backgroundColor: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '8px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              {renderToolIcon(tc.category)}
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: '#58a6ff',
                                  padding: '2px 6px',
                                  backgroundColor: '#1f242c',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                }}
                              >
                                {tc.category}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  color: '#e6edf3',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {tc.target}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {tc.diffStats && (
                                <div style={{ display: 'flex', gap: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                                  <span style={{ color: '#10b981' }}>+{tc.diffStats.added}</span>
                                  <span style={{ color: '#ef4444' }}>-{tc.diffStats.removed}</span>
                                </div>
                              )}

                              {(tc.codeDiff || tc.terminalOutput) && (
                                <button
                                  onClick={() => toggleToolDiff(tc.id)}
                                  style={{
                                    backgroundColor: '#21262d',
                                    border: '1px solid #30363d',
                                    color: '#c9d1d9',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isDiffOpen ? 'Hide Diff' : 'Open Diff'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded Code Diff or Terminal Output */}
                          {isDiffOpen && (
                            <div
                              style={{
                                borderTop: '1px solid #30363d',
                                backgroundColor: '#0d1117',
                                padding: '10px 14px',
                                fontFamily: 'Consolas, Monaco, monospace',
                                fontSize: '12px',
                              }}
                            >
                              {tc.codeDiff && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                                    - {tc.codeDiff.before}
                                  </div>
                                  <div style={{ color: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                                    + {tc.codeDiff.after}
                                  </div>
                                </div>
                              )}

                              {tc.terminalOutput && (
                                <div style={{ color: '#e6edf3', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                  {tc.terminalOutput}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Interactive Question / Quiz Composer Card */}
                {m.quiz && (
                  <div
                    style={{
                      marginTop: '16px',
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>
                      <HelpCircle size={15} />
                      <span>Decision Required: {m.quiz.question}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      {m.quiz.options.map((opt, idx) => {
                        const isSelected = quizAnswers[m.quiz!.id] === idx;

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectQuiz(m.quiz!.id, idx)}
                            style={{
                              textAlign: 'left',
                              padding: '8px 12px',
                              backgroundColor: isSelected ? 'rgba(37,99,235,0.2)' : '#1f2937',
                              border: isSelected ? '1px solid #2563eb' : '1px solid #374151',
                              borderRadius: '6px',
                              color: isSelected ? '#93c5fd' : '#d1d5db',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{opt}</span>
                            {isSelected && <CheckCircle2 size={14} color="#3b82f6" />}
                          </button>
                        );
                      })}
                    </div>

                    {m.quiz.explanation && (
                      <div style={{ marginTop: '10px', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                        Rationale: {m.quiz.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attachment Chips Deck */}
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 20px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid #1e293b',
          }}
        >
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Context Attachments:</span>
          {attachments.map((file, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#58a6ff',
                fontSize: '11px',
                border: '1px solid #334155',
              }}
            >
              <Paperclip size={11} />
              {file}
            </span>
          ))}
        </div>
      )}

      {/* Bottom Composer Bar */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#0f172a',
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Direct SuperAgent autonomous trajectory... (Press Enter to dispatch)"
            rows={2}
            style={{
              flex: 1,
              backgroundColor: '#090d16',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
            }}
          />

          {isRunning ? (
            <button
              type="button"
              onClick={onStopAgent}
              style={{
                backgroundColor: '#ef4444',
                border: 'none',
                color: '#ffffff',
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              <Square size={16} /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputText.trim()}
              style={{
                backgroundColor: inputText.trim() ? '#10b981' : '#334155',
                border: 'none',
                color: '#ffffff',
                padding: '12px 18px',
                borderRadius: '8px',
                cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              <Send size={15} /> Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
