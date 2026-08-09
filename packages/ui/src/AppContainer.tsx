import React, { useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatView } from './components/ChatView.js';
import { ChatInput } from './components/ChatInput.js';
import { StudioView } from './components/StudioView.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ArtifactsViewer } from './components/ArtifactsViewer.js';
import { ChatMessage, ChatSession, ModelConfig, ModelOption, ServerConfig, ArtifactItem } from './types.js';
import { DEFAULT_SERVER_CONFIG, AVAILABLE_MODELS } from './config.js';
import { SuperAgentApiClient } from './api/client.js';

export interface AppContainerProps {
  initialServerConfig?: Partial<ServerConfig>;
  onExecuteTauriCommand?: (command: string, args?: any) => Promise<any>;
}

export const AppContainer: React.FC<AppContainerProps> = ({ initialServerConfig }) => {
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    ...DEFAULT_SERVER_CONFIG,
    ...initialServerConfig
  });

  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: selectedModel.provider,
    modelId: selectedModel.id
  });

  const [activeTab, setActiveTab] = useState<'chat' | 'studio'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: '1', title: 'Code Refactoring & Build Check', updatedAt: 'Just now', messageCount: 4 }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('1');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are SuperAgent, an autonomous AI assistant specialized in coding and software engineering tasks.'
  );
  const [isStreaming, setIsStreaming] = useState(false);

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  const apiClient = new SuperAgentApiClient(serverConfig);

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: new Date().toISOString()
    };

    const assistantMsgId = String(Date.now() + 1);
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    let accumulatedText = '';

    await apiClient.streamAgentRun(text, modelConfig, systemPrompt, (evt) => {
      if (evt.type === 'token') {
        accumulatedText += evt.data?.text || '';
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: [{ type: 'text', text: accumulatedText }] }
              : msg
          )
        );
      } else if (evt.type === 'tool_call') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: [
                    ...msg.content,
                    {
                      type: 'tool_use',
                      id: evt.data.id || String(Date.now()),
                      name: evt.data.name || 'tool',
                      input: evt.data.input || {}
                    }
                  ]
                }
              : msg
          )
        );
      } else if (evt.type === 'tool_output') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: [
                    ...msg.content,
                    {
                      type: 'tool_result',
                      tool_use_id: evt.data.tool_use_id || '',
                      content: evt.data.output || '',
                      is_error: evt.data.is_error
                    }
                  ]
                }
              : msg
          )
        );
      } else if (evt.type === 'finished' || evt.type === 'error') {
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
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
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
            setMessages([]);
            setActiveSessionId(String(Date.now()));
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Center Main View Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
          {activeTab === 'chat' ? (
            <>
              <ChatView
                messages={messages}
                isStreaming={isStreaming}
                onCopyText={handleCopyText}
              />
              <ChatInput
                onSendMessage={handleSendMessage}
                isStreaming={isStreaming}
                onStopStreaming={() => setIsStreaming(false)}
                selectedModel={selectedModel}
                onSelectModel={(m) => {
                  setSelectedModel(m);
                  setModelConfig((prev) => ({ ...prev, provider: m.provider, modelId: m.id }));
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
