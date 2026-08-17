import React, { useState, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatView } from './components/ChatView.js';
import { ChatInput } from './components/ChatInput.js';
import { StudioView } from './components/StudioView.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ArtifactsViewer } from './components/ArtifactsViewer.js';
import { TrajectoryStep, ChatSession, ModelConfig, ModelOption, ServerConfig, ArtifactItem } from './types.js';
import { DEFAULT_SERVER_CONFIG, AVAILABLE_MODELS } from './config.js';
import { SuperAgentApiClient } from './api/client.js';

export interface AppContainerProps {
  initialServerConfig?: Partial<ServerConfig>;
  onExecuteTauriCommand?: (command: string, args?: any) => Promise<any>;
}

export const AppContainer: React.FC<AppContainerProps> = ({ initialServerConfig }) => {
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    ...DEFAULT_SERVER_CONFIG,
    ...initialServerConfig,
  });

  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: selectedModel.provider,
    modelId: selectedModel.id,
  });

  const [activeTab, setActiveTab] = useState<'chat' | 'studio'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: '1', title: 'Code Refactoring & Build Check', updatedAt: 'Just now', messageCount: 4 },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('1');

  const [steps, setSteps] = useState<TrajectoryStep[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are SuperAgent, an autonomous AI assistant specialized in coding and software engineering tasks.'
  );
  const [isStreaming, setIsStreaming] = useState(false);

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  const runStartTimeRef = useRef<number>(0);
  const apiClient = new SuperAgentApiClient(serverConfig);

  const handleSendMessage = async (text: string) => {
    const userStepId = String(Date.now());
    const userStep: TrajectoryStep = {
      id: userStepId,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'success',
    };

    const assistantStepId = String(Date.now() + 1);
    const assistantStep: TrajectoryStep = {
      id: assistantStepId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'running',
    };

    setSteps(prev => [...prev, userStep, assistantStep]);
    setIsStreaming(true);
    runStartTimeRef.current = Date.now();

    let accumulatedText = '';

    await apiClient.streamAgentRun(text, modelConfig, systemPrompt, evt => {
      const elapsedSec = ((Date.now() - runStartTimeRef.current) / 1000).toFixed(1) + 's';

      if (evt.type === 'token') {
        accumulatedText += evt.data?.text || '';
        setSteps(prev =>
          prev.map(s =>
            s.id === assistantStepId
              ? {
                  ...s,
                  content: accumulatedText,
                  status: 'running',
                  metadata: {
                    ...s.metadata,
                    workedDuration: elapsedSec,
                  },
                }
              : s
          )
        );
      } else if (evt.type === 'tool_call') {
        const toolCallStep: TrajectoryStep = {
          id: evt.data.id || String(Date.now()),
          type: 'tool_call',
          content: '',
          toolName: evt.data.name || 'tool',
          status: 'running',
          timestamp: new Date().toISOString(),
          metadata: {
            toolArgs: evt.data.input || {},
            workedDuration: elapsedSec,
            filename: evt.data.input?.path || evt.data.input?.filePath || evt.data.input?.filename,
          },
        };

        setSteps(prev => {
          // Insert tool call step before the final assistant step
          const withoutLastAssistant = prev.filter(s => s.id !== assistantStepId);
          const currentAssistant = prev.find(s => s.id === assistantStepId) || assistantStep;
          return [...withoutLastAssistant, toolCallStep, currentAssistant];
        });
      } else if (evt.type === 'tool_output') {
        const toolUseId = evt.data.tool_use_id;
        const toolOutputStep: TrajectoryStep = {
          id: String(Date.now()),
          type: 'tool_result',
          content: evt.data.output || '',
          status: evt.data.is_error ? 'error' : 'success',
          timestamp: new Date().toISOString(),
          metadata: {
            toolResult: evt.data.output || '',
            workedDuration: elapsedSec,
          },
        };

        setSteps(prev => {
          // Also update the matching tool_call status if found
          const updated = prev.map(s => {
            if (s.id === toolUseId && s.type === 'tool_call') {
              return {
                ...s,
                status: (evt.data.is_error ? 'error' : 'success') as 'error' | 'success',
                metadata: {
                  ...s.metadata,
                  toolResult: evt.data.output,
                  workedDuration: elapsedSec,
                },
              };
            }
            return s;
          });

          // Insert result before the final assistant step
          const withoutLastAssistant = updated.filter(s => s.id !== assistantStepId);
          const currentAssistant = updated.find(s => s.id === assistantStepId) || assistantStep;
          return [...withoutLastAssistant, toolOutputStep, currentAssistant];
        });
      } else if (evt.type === 'finished' || evt.type === 'error') {
        const finalDuration = ((Date.now() - runStartTimeRef.current) / 1000).toFixed(1) + 's';
        setSteps(prev =>
          prev.map(s =>
            s.id === assistantStepId
              ? {
                  ...s,
                  status: (evt.type === 'error' ? 'error' : 'success') as 'error' | 'success',
                  metadata: {
                    ...s.metadata,
                    workedDuration: finalDuration,
                  },
                }
              : s
          )
        );
        setIsStreaming(false);
      }
    });

    setIsStreaming(false);
  };

  const handleCopyText = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="h-screen w-screen bg-[color:var(--brand-bg,#0a0a0f)] text-[color:var(--brand-text-main,#ecedef)] flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        serverConfig={serverConfig}
        activeModel={selectedModel}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Session Drawer / Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={() => {
            setSteps([]);
            setActiveSessionId(String(Date.now()));
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Center Main View Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[color:var(--brand-bg,#0a0a0f)] relative">
          {activeTab === 'chat' ? (
            <>
              <ChatView
                steps={steps}
                isStreaming={isStreaming}
                onCopyText={handleCopyText}
              />
              <ChatInput
                onSendMessage={handleSendMessage}
                isStreaming={isStreaming}
                onStopStreaming={() => setIsStreaming(false)}
                selectedModel={selectedModel}
                onSelectModel={m => {
                  setSelectedModel(m);
                  setModelConfig(prev => ({ ...prev, provider: m.provider, modelId: m.id }));
                }}
              />
            </>
          ) : (
            <StudioView
              systemPrompt={systemPrompt}
              onSaveSystemPrompt={setSystemPrompt}
            />
          )}
        </main>

        {/* Right Artifacts Inspector */}
        <ArtifactsViewer
          isOpen={isArtifactsOpen}
          onClose={() => setIsArtifactsOpen(false)}
          artifacts={artifacts}
          activeArtifactId={activeArtifactId}
          onSelectArtifact={setActiveArtifactId}
          onCopyText={handleCopyText}
        />
      </div>

      {/* App Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        serverConfig={serverConfig}
        onSaveServerConfig={setServerConfig}
        modelConfig={modelConfig}
        onSaveModelConfig={setModelConfig}
      />
    </div>
  );
};
