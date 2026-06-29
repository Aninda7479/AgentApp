import React from 'react';

export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  metadata?: {
    filename?: string;
    originalCode?: string;
    modifiedCode?: string;
    mediaType?: 'image' | 'pdf' | 'ppt' | 'audio';
    [key: string]: any;
  };
}

export interface TrajectoryCanvasProps {
  steps: TrajectoryStep[];
  isStreaming?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
}

export const TrajectoryCanvas: React.FC<TrajectoryCanvasProps> = ({
  steps,
  isStreaming = false,
  onViewDiff,
  onActionClick
}) => {
  return (
    <div
      data-testid="trajectory-canvas"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        backgroundColor: '#09090b'
      }}
    >
      {steps.length === 0 ? (
        <div
          data-testid="empty-state"
          style={{
            textAlign: 'center',
            color: '#a1a1aa',
            marginTop: '100px',
            fontSize: '1rem'
          }}
        >
          No agent execution trajectory yet. Type a prompt below to start!
        </div>
      ) : (
        steps.map((step) => {
          if (step.type === 'user') {
            return (
              <div
                key={step.id}
                data-testid={`step-user-${step.id}`}
                style={{
                  alignSelf: 'flex-end',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  maxWidth: '80%',
                  color: '#f4f4f5',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#a1a1aa',
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>User</span>
                  {step.timestamp && <span>{step.timestamp}</span>}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{step.content}</div>
              </div>
            );
          }

          if (step.type === 'thought') {
            return (
              <div
                key={step.id}
                data-testid={`step-thought-${step.id}`}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#121215',
                  borderLeft: '3px solid #8b5cf6',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  maxWidth: '85%',
                  color: '#a1a1aa',
                  fontSize: '0.9rem',
                  fontStyle: 'italic'
                }}
              >
                <div style={{ fontWeight: 600, color: '#c4b5fd', marginBottom: '4px', fontStyle: 'normal' }}>
                  🧠 Reasoning Trajectory
                </div>
                <div>{step.content}</div>
              </div>
            );
          }

          if (step.type === 'tool_call' || step.type === 'tool_result') {
            const isSuccess = step.status === 'success';
            const isError = step.status === 'error';
            const isRunning = step.status === 'running' || step.status === 'pending';

            return (
              <div
                key={step.id}
                data-testid={`step-tool-${step.id}`}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#121215',
                  border: '1px solid #27272a',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  maxWidth: '85%',
                  width: '100%'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem' }}>⚙️</span>
                    <span style={{ fontWeight: 600, color: '#3b82f6', fontSize: '0.9rem' }}>
                      Tool: {step.toolName || 'Executor'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: isSuccess
                          ? '#064e3b'
                          : isError
                          ? '#7f1d1d'
                          : '#1e1b4b',
                        color: isSuccess ? '#6ee7b7' : isError ? '#fca5a5' : '#c7d2fe',
                        fontWeight: 600
                      }}
                    >
                      {isRunning ? 'Running...' : step.status || 'Done'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#09090b',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    color: '#e4e4e7',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {step.content}
                </div>

                {step.metadata?.filename && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    <button
                      data-testid={`view-diff-btn-${step.id}`}
                      onClick={() =>
                        onViewDiff &&
                        onViewDiff(
                          step.metadata!.filename!,
                          step.metadata!.originalCode || '',
                          step.metadata!.modifiedCode || ''
                        )
                      }
                      style={{
                        backgroundColor: '#1f1f23',
                        border: '1px solid #3f3f46',
                        color: '#3b82f6',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🔍 Inspect File Diff ({step.metadata.filename})
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // Default: Assistant text response
          return (
            <div
              key={step.id}
              data-testid={`step-assistant-${step.id}`}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#121215',
                border: '1px solid #27272a',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '90%',
                width: '100%',
                color: '#f4f4f5',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                  fontSize: '0.85rem',
                  color: '#a1a1aa'
                }}
              >
                <span style={{ color: '#8b5cf6', fontWeight: 600 }}>SuperAgent Core</span>
                {step.timestamp && <span>{step.timestamp}</span>}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem' }}>
                {step.content}
              </div>

              {step.metadata?.mediaType && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: '#1a1a1e',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '0.9rem', color: '#e4e4e7' }}>
                    🎨 Generated Media Asset ({step.metadata.mediaType.toUpperCase()})
                  </span>
                  <button
                    onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                    style={{
                      backgroundColor: '#8b5cf6',
                      border: 'none',
                      color: '#ffffff',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Open Artifact
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {isStreaming && (
        <div
          data-testid="streaming-indicator"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#8b5cf6',
            fontSize: '0.85rem',
            padding: '8px 12px'
          }}
        >
          <span style={{ animation: 'pulse 1s infinite' }}>⚡</span>
          <span>SuperAgent is generating trajectory...</span>
        </div>
      )}
    </div>
  );
};
