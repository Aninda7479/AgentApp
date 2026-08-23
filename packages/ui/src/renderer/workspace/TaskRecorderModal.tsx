import React, { useState } from 'react';
import {
  X,
  Video,
  Sparkles,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  MousePointer,
  Keyboard,
  Terminal,
  Globe,
  Loader2,
} from 'lucide-react';
import { CoreApiClient } from '../services/CoreApiClient';
import type { SynthesizedSkill } from '../core/types';

interface TaskRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillCreated?: (skill: SynthesizedSkill) => void;
}

export const TaskRecorderModal: React.FC<TaskRecorderModalProps> = ({
  isOpen,
  onClose,
  onSkillCreated,
}) => {
  const [step, setStep] = useState<'initial' | 'recording' | 'synthesizing' | 'completed'>('initial');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actionCount, setActionCount] = useState(0);
  const [skillName, setSkillName] = useState('');
  const [synthesizedSkill, setSynthesizedSkill] = useState<SynthesizedSkill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a task workflow title.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const sId = await CoreApiClient.startTrace(title.trim(), description.trim());
      setSessionId(sId);
      setActionCount(0);
      setStep('recording');
    } catch (err: any) {
      setError(err.message || 'Failed to start recording session');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAction = async (type: 'click' | 'type' | 'navigate' | 'command') => {
    if (!sessionId) return;
    const action = {
      type,
      timestamp: new Date().toISOString(),
      ...(type === 'click' ? { selector: 'button.action-btn', text: 'Confirm Booking' } : {}),
      ...(type === 'type' ? { selector: 'input[name="pickup"]', text: 'HQ Office' } : {}),
      ...(type === 'navigate' ? { url: 'https://service.local/dashboard' } : {}),
      ...(type === 'command' ? { cmd: 'cargo test' } : {}),
    };

    await CoreApiClient.recordTraceAction(sessionId, action);
    setActionCount((prev) => prev + 1);
  };

  const handleStopRecording = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await CoreApiClient.stopTrace(sessionId);
      setSkillName(title);
      setStep('synthesizing');
    } catch (err: any) {
      setError(err.message || 'Failed to stop recording');
    } finally {
      setLoading(false);
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !skillName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const skill = await CoreApiClient.synthesizeTrace(sessionId, skillName.trim());
      setSynthesizedSkill(skill);
      setStep('completed');
      onSkillCreated?.(skill);
    } catch (err: any) {
      setError(err.message || 'Failed to synthesize skill');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('initial');
    setTitle('');
    setDescription('');
    setSessionId(null);
    setActionCount(0);
    setSkillName('');
    setSynthesizedSkill(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Video size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Teach a Task</h2>
              <p className="text-xs text-slate-400">Demonstrate a workflow once, automate it forever</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Stages */}
        <div className="p-6">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium mb-4">
              {error}
            </div>
          )}

          {step === 'initial' && (
            <form onSubmit={handleStartRecording} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Task Workflow Title</label>
                <input
                  type="text"
                  placeholder="e.g. Daily Cab Booking or Invoice Download"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Goal Description</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Navigate to ride portal, choose office destination, compare cheapest option, and confirm booking."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                💡 <strong>How it works</strong>: SuperAgent will record your actions (DOM clicks, keystrokes, navigations) and synthesize a clean, reusable automation skill.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Play size={14} />
                  <span>Start Recording</span>
                </button>
              </div>
            </form>
          )}

          {step === 'recording' && (
            <div className="space-y-6 text-center py-4">
              <div className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-sm font-bold text-red-400 uppercase tracking-wider">Recording in Progress</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-2xl font-extrabold text-slate-100 mb-1">{actionCount}</div>
                <div className="text-xs text-slate-400">Actions Captured</div>
              </div>

              {/* Action Simulation Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSimulateAction('click')}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300"
                >
                  <MousePointer size={12} />
                  <span>Record Click</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateAction('type')}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300"
                >
                  <Keyboard size={12} />
                  <span>Record Input</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateAction('navigate')}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300"
                >
                  <Globe size={12} />
                  <span>Record Navigate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateAction('command')}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300"
                >
                  <Terminal size={12} />
                  <span>Record Command</span>
                </button>
              </div>

              <button
                onClick={handleStopRecording}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs shadow-lg shadow-red-500/20 transition-all cursor-pointer"
              >
                <Square size={14} />
                <span>Stop Recording & Synthesize</span>
              </button>
            </div>
          )}

          {step === 'synthesizing' && (
            <form onSubmit={handleSynthesize} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-200">Demonstration Summary</div>
                <div className="text-xs text-slate-400">Captured {actionCount} interaction steps for "{title}".</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Skill Tool Name</label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. book-cab-daily"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>{loading ? 'Synthesizing Tool...' : 'Generate Reusable Skill'}</span>
                </button>
              </div>
            </form>
          )}

          {step === 'completed' && synthesizedSkill && (
            <div className="space-y-4 text-center py-2">
              <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-slate-100 mb-0.5">Skill Created Successfully!</h3>
                <p className="text-xs text-slate-400">
                  Tool <code className="text-cyan-400">"{synthesizedSkill.id}"</code> is now registered and available to all agent personas and scheduled routines.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left">
                <div className="text-[10px] font-mono text-slate-500 mb-1">Generated Script Preview</div>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-slate-800">
                  {synthesizedSkill.executionScript}
                </pre>
              </div>

              <button
                onClick={handleReset}
                className="w-full px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
