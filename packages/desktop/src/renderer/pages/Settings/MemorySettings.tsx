import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Sparkles,
  UserCheck,
  BookOpen,
  FileText,
  AlertCircle,
  Globe,
  FolderCode,
  ShieldCheck,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { getIpc } from '../../lib/electron';

export interface UserProfileEntry {
  key: string;
  value: unknown;
  category: 'preference' | 'identity' | 'environment' | 'custom';
  updatedAt: number;
}

export interface LearnedInsight {
  id: string;
  topic: string;
  lesson: string;
  category: 'error_prevention' | 'user_preference' | 'workflow_optimization';
  timestamp: number;
}

export interface ProjectInstructionFile {
  filePath: string;
  sourceType: 'agent' | 'claude' | 'cursor' | 'system' | 'custom';
  rawContent: string;
  rules: string[];
}

export const MemorySettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState('');
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [profileEntries, setProfileEntries] = useState<UserProfileEntry[]>([]);
  const [insights, setInsights] = useState<LearnedInsight[]>([]);
  const [projectInstructions, setProjectInstructions] = useState<ProjectInstructionFile[]>([]);
  
  // Section toggle / expansion states
  const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'global' | 'project'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for adding profile or insight
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<'profile' | 'insight'>('profile');
  
  const [profileKey, setProfileKey] = useState('');
  const [profileValue, setProfileValue] = useState('');
  const [profileCategory, setProfileCategory] = useState<'preference' | 'identity' | 'environment' | 'custom'>('preference');

  const [insightTopic, setInsightTopic] = useState('');
  const [insightLesson, setInsightLesson] = useState('');
  const [insightCategory, setInsightCategory] = useState<'error_prevention' | 'user_preference' | 'workflow_optimization'>('user_preference');

  const loadMemoryData = useCallback(async () => {
    setLoading(true);
    const ipc = getIpc();
    if (ipc) {
      try {
        const res = await ipc.invoke('global-memory-read');
        if (res) {
          setDefaultSystemPrompt(res.defaultSystemPrompt || '');
          setGlobalInstructions(res.globalMemoryInstructions || '');
          setProfileEntries(res.userProfile || []);
          setInsights(res.learnedInsights || []);
          setProjectInstructions(res.projectInstructions || []);
        }
      } catch (err) {
        console.error('Failed to read memory data:', err);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMemoryData();
  }, [loadMemoryData]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSaveGlobalInstructions = async () => {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('global-memory-save-instructions', { instructions: globalInstructions });
        showToast('success', 'Updated Global Memory system instructions.');
      } catch (err) {
        showToast('error', 'Failed to save global memory instructions.');
      }
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileKey.trim() || !profileValue.trim()) return;

    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('global-memory-add-profile', {
          key: profileKey.trim(),
          value: profileValue.trim(),
          category: profileCategory
        });
        setProfileKey('');
        setProfileValue('');
        setShowAddForm(false);
        showToast('success', `Added profile entry "${profileKey.trim()}".`);
        await loadMemoryData();
      } catch (err) {
        showToast('error', 'Failed to save profile entry.');
      }
    }
  };

  const handleDeleteProfile = async (key: string) => {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('global-memory-delete-profile', { key });
        showToast('success', `Deleted profile entry "${key}".`);
        await loadMemoryData();
      } catch (err) {
        showToast('error', 'Failed to delete profile entry.');
      }
    }
  };

  const handleAddInsight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insightTopic.trim() || !insightLesson.trim()) return;

    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('global-memory-add-insight', {
          topic: insightTopic.trim(),
          lesson: insightLesson.trim(),
          category: insightCategory
        });
        setInsightTopic('');
        setInsightLesson('');
        setShowAddForm(false);
        showToast('success', `Saved learned insight "${insightTopic.trim()}".`);
        await loadMemoryData();
      } catch (err) {
        showToast('error', 'Failed to save insight.');
      }
    }
  };

  const handleDeleteInsight = async (id: string) => {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('global-memory-delete-insight', { id });
        showToast('success', 'Deleted learned insight.');
        await loadMemoryData();
      } catch (err) {
        showToast('error', 'Failed to delete insight.');
      }
    }
  };

  const filteredProfile = profileEntries.filter(
    (e) =>
      !searchQuery ||
      e.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(e.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInsights = insights.filter(
    (i) =>
      !searchQuery ||
      i.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.lesson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProjectInstructions = projectInstructions.filter(
    (p) =>
      !searchQuery ||
      p.filePath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.rawContent.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-textMain flex items-center gap-2">
            <Brain size={22} className="text-brand-accent" />
            Memory & System Prompts
          </h2>
          <p className="text-sm text-brand-textMuted mt-1">
            Inspect and manage all default system prompts, global instructions, user memories, and project-level prompts passing to the agent.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-brand-accent text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-brand-accent/90 transition-colors flex items-center gap-1.5"
          >
            <Plus size={16} />
            <span>Add Memory Entry</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Add Memory Modal / Form Drawer */}
      {showAddForm && (
        <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-textMain">Add New Memory Item</h3>
            <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => setAddType('profile')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  addType === 'profile' ? 'bg-brand-accent text-white font-medium' : 'text-brand-textMuted hover:text-brand-textMain'
                }`}
              >
                User Profile
              </button>
              <button
                type="button"
                onClick={() => setAddType('insight')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  addType === 'insight' ? 'bg-brand-accent text-white font-medium' : 'text-brand-textMuted hover:text-brand-textMain'
                }`}
              >
                Learned Insight
              </button>
            </div>
          </div>

          {addType === 'profile' && (
            <form onSubmit={handleAddProfile} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4">
                <label className="block text-xs text-brand-textMuted mb-1">Key / Fact Name</label>
                <input
                  type="text"
                  placeholder="e.g. coding_style"
                  value={profileKey}
                  onChange={(e) => setProfileKey(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-xs text-brand-textMuted mb-1">Value</label>
                <input
                  type="text"
                  placeholder="e.g. Strict types, functional approach"
                  value={profileValue}
                  onChange={(e) => setProfileValue(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs text-brand-textMuted mb-1">Category</label>
                <select
                  value={profileCategory}
                  onChange={(e) => setProfileCategory(e.target.value as any)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                >
                  <option value="preference">Preference</option>
                  <option value="identity">Identity</option>
                  <option value="environment">Environment</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="sm:col-span-12 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-brand-textMuted hover:bg-brand-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!profileKey.trim() || !profileValue.trim()}
                  className="bg-brand-accent text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
                >
                  Save Entry
                </button>
              </div>
            </form>
          )}

          {addType === 'insight' && (
            <form onSubmit={handleAddInsight} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs text-brand-textMuted mb-1">Topic</label>
                <input
                  type="text"
                  placeholder="e.g. Build Error Fix"
                  value={insightTopic}
                  onChange={(e) => setInsightTopic(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs text-brand-textMuted mb-1">Category</label>
                <select
                  value={insightCategory}
                  onChange={(e) => setInsightCategory(e.target.value as any)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                >
                  <option value="user_preference">User Preference</option>
                  <option value="error_prevention">Error Prevention</option>
                  <option value="workflow_optimization">Workflow Optimization</option>
                </select>
              </div>
              <div className="sm:col-span-12">
                <label className="block text-xs text-brand-textMuted mb-1">Lesson Learned</label>
                <textarea
                  placeholder="Describe the lesson or guideline..."
                  value={insightLesson}
                  onChange={(e) => setInsightLesson(e.target.value)}
                  rows={2}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-12 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-brand-textMuted hover:bg-brand-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!insightTopic.trim() || !insightLesson.trim()}
                  className="bg-brand-accent text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
                >
                  Save Insight
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-brand-border/60 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-brand-accent text-white'
                : 'text-brand-textMuted hover:bg-brand-hover hover:text-brand-textMain'
            }`}
          >
            All Memory & Prompts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('global')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'global'
                ? 'bg-brand-accent text-white'
                : 'text-brand-textMuted hover:bg-brand-hover hover:text-brand-textMain'
            }`}
          >
            <Globe size={14} />
            Global System
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'project'
                ? 'bg-brand-accent text-white'
                : 'text-brand-textMuted hover:bg-brand-hover hover:text-brand-textMain'
            }`}
          >
            <FolderCode size={14} />
            Project
          </button>
        </div>

        <div className="flex items-center gap-2 bg-brand-card border border-brand-border rounded-lg px-3 py-1.5 text-sm">
          <Search size={14} className="text-brand-textMuted" />
          <input
            type="text"
            placeholder="Filter prompts & memory..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-brand-textMain outline-none text-xs w-48 placeholder:text-brand-textMuted/60"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-brand-textMuted">Loading Memory & System Prompts...</div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: GLOBAL SYSTEM */}
          {(activeTab === 'all' || activeTab === 'global') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-brand-border/40 pb-2">
                <Globe size={18} className="text-brand-accent" />
                <h3 className="text-base font-bold text-brand-textMain uppercase tracking-wide">Section 1: Global System</h3>
              </div>

              {/* Sub-card A: Default Core System Prompt */}
              <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                  className="w-full p-4 text-left flex items-center justify-between bg-brand-bg/40 hover:bg-brand-hover/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span className="font-semibold text-sm text-brand-textMain">Default Core Agent System Prompt</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold uppercase">
                      Built-in Default
                    </span>
                  </div>
                  {showDefaultPrompt ? <ChevronDown size={16} className="text-brand-textMuted" /> : <ChevronRight size={16} className="text-brand-textMuted" />}
                </button>
                {showDefaultPrompt && (
                  <div className="p-4 border-t border-brand-border/60 bg-brand-bg/60">
                    <pre className="text-xs font-mono text-brand-textMain whitespace-pre-wrap leading-relaxed">
                      {defaultSystemPrompt}
                    </pre>
                  </div>
                )}
              </div>

              {/* Sub-card B: Global Memory System Instructions */}
              <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                      <FileText size={16} className="text-brand-accent" />
                      Global Memory System Instructions
                    </h4>
                    <p className="text-xs text-brand-textMuted mt-0.5">
                      System-wide rules injected into every AI turn across all workspaces.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveGlobalInstructions}
                    className="bg-brand-accent text-white px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-accent/90 transition-colors"
                  >
                    Save Global Rules
                  </button>
                </div>
                <textarea
                  value={globalInstructions}
                  onChange={(e) => setGlobalInstructions(e.target.value)}
                  placeholder="- Add custom global system rules or memory directives..."
                  rows={5}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-xs font-mono text-brand-textMain leading-relaxed outline-none focus:border-brand-accent"
                />
              </div>

              {/* Sub-card C: User Profile Entries */}
              <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                    <UserCheck size={16} className="text-brand-accent" />
                    User Profile Memories ({filteredProfile.length})
                  </h4>
                </div>

                {filteredProfile.length === 0 ? (
                  <div className="text-xs text-brand-textMuted italic py-3">No profile memories recorded.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredProfile.map((entry) => (
                      <div
                        key={entry.key}
                        className="bg-brand-bg border border-brand-border/60 rounded-lg p-3 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs text-brand-textMain">{entry.key}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-accent/10 text-brand-accent uppercase font-semibold">
                              {entry.category}
                            </span>
                          </div>
                          <div className="text-xs text-brand-textMuted truncate">
                            {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(entry.key)}
                          className="text-brand-textMuted hover:text-red-400 p-1 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sub-card D: Learned Insights */}
              <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-400" />
                    Learned Insights ({filteredInsights.length})
                  </h4>
                </div>

                {filteredInsights.length === 0 ? (
                  <div className="text-xs text-brand-textMuted italic py-3">No learned insights recorded.</div>
                ) : (
                  <div className="space-y-2">
                    {filteredInsights.map((insight) => (
                      <div
                        key={insight.id}
                        className="bg-brand-bg border border-brand-border/60 rounded-lg p-3 flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs text-brand-textMain">{insight.topic}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase font-semibold">
                              {insight.category.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-brand-textMuted leading-relaxed">{insight.lesson}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteInsight(insight.id)}
                          className="text-brand-textMuted hover:text-red-400 p-1 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: PROJECT */}
          {(activeTab === 'all' || activeTab === 'project') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-brand-border/40 pb-2">
                <FolderCode size={18} className="text-brand-accent" />
                <h3 className="text-base font-bold text-brand-textMain uppercase tracking-wide">Section 2: Project</h3>
              </div>

              {/* Sub-card A: Discovered Project Instruction Files */}
              <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                    <BookOpen size={16} className="text-brand-accent" />
                    Discovered Project Prompts & Instructions ({filteredProjectInstructions.length})
                  </h4>
                  <p className="text-xs text-brand-textMuted mt-0.5">
                    Instruction files auto-discovered from current workspace (e.g. AGENT.md, CLAUDE.md, .cursorrules).
                  </p>
                </div>

                {filteredProjectInstructions.length === 0 ? (
                  <div className="text-xs text-brand-textMuted italic py-4 border border-dashed border-brand-border/60 rounded-lg text-center">
                    No project instruction files (AGENT.md, CLAUDE.md, .cursorrules) found in the active workspace.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredProjectInstructions.map((file) => (
                      <div key={file.filePath} className="bg-brand-bg border border-brand-border/70 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-brand-textMain">{file.filePath}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent uppercase font-medium">
                            {file.rules?.length || 0} Rules Extracted
                          </span>
                        </div>
                        <pre className="text-xs font-mono text-brand-textMuted bg-brand-card/70 p-3 rounded-lg overflow-x-auto max-h-48 scrollbar-none whitespace-pre-wrap">
                          {file.rawContent}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MemorySettings;
