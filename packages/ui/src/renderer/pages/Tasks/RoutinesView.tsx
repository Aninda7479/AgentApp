import React, { useState } from 'react';
import {
  Clock,
  Play,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Repeat,
  Sparkles,
  Bot,
  Bell,
  X,
} from 'lucide-react';
import { useRoutines } from '../../hooks/useRoutines';
import { RoutineModal } from './RoutineModal';
import type { RoutineTrigger } from '../../core/types';

export const RoutinesView: React.FC = () => {
  const { routines, loading, runningId, lastLog, saveRoutine, deleteRoutine, executeNow, clearLog } = useRoutines();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineTrigger | null>(null);

  const handleEdit = (routine: RoutineTrigger) => {
    setEditingRoutine(routine);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingRoutine(null);
    setModalOpen(true);
  };

  const handleToggle = async (routine: RoutineTrigger) => {
    await saveRoutine({
      ...routine,
      enabled: !routine.enabled,
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the scheduled routine "${name}"?`)) {
      await deleteRoutine(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-8 select-none">
      {/* Top Controls */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
            <Clock size={20} className="text-cyan-400" />
            <span>Autonomous Scheduled Routines</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            24/7 background agent automations (market scans, email triage, and scheduled reports)
          </p>
        </div>

        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
        >
          <Plus size={15} />
          <span>New Routine</span>
        </button>
      </div>

      {/* Routine Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {routines.map((routine) => {
          const isExecuting = runningId === routine.id;

          return (
            <div
              key={routine.id}
              className={`rounded-3xl p-5 border flex flex-col justify-between backdrop-blur-xl transition-all ${
                routine.enabled
                  ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                  : 'bg-slate-950/40 border-slate-900 opacity-60'
              }`}
            >
              <div>
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Clock size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{routine.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono font-semibold text-cyan-400">
                          {routine.cronExpression || `Every ${routine.intervalSeconds}s`}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] text-slate-400 font-mono">@{routine.personaId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(routine)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                        routine.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {routine.enabled ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => handleEdit(routine)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Edit routine"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(routine.id, routine.name)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete routine"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Description & Prompt */}
                {routine.description && (
                  <p className="text-xs text-slate-400 mb-2 leading-relaxed">{routine.description}</p>
                )}

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Prompt Instruction
                  </div>
                  <div className="text-xs font-mono text-slate-300 line-clamp-2">{routine.prompt}</div>
                </div>
              </div>

              {/* Bottom Meta & Run Button */}
              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  {routine.lastStatus === 'success' && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 size={12} />
                      <span>Ran successfully</span>
                    </span>
                  )}
                  {routine.lastStatus === 'error' && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle size={12} />
                      <span>Failed</span>
                    </span>
                  )}
                  {!routine.lastStatus && <span>Never ran</span>}
                  <span className="text-slate-600">•</span>
                  <span>{routine.runCount} runs</span>
                </div>

                <button
                  onClick={() => executeNow(routine.id)}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isExecuting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  <span>{isExecuting ? 'Running...' : 'Run Now'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {routines.length === 0 && !loading && (
        <div className="text-center py-16 bg-slate-900/20 rounded-3xl border border-slate-800/60 p-8">
          <Clock size={36} className="mx-auto text-slate-500 mb-3" />
          <h3 className="text-sm font-bold text-slate-200 mb-1">No Scheduled Routines Configured</h3>
          <p className="text-xs text-slate-400 mb-4">
            Create recurring background routines to automate continuous research, morning briefings, or inbox management.
          </p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20"
          >
            Create Routine
          </button>
        </div>
      )}

      {/* Execution Log Result Modal */}
      {lastLog && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center gap-2">
                {lastLog.status === 'success' ? (
                  <CheckCircle2 size={18} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={18} className="text-red-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Routine Execution Output</h3>
                  <p className="text-xs text-slate-400">Completed in {lastLog.durationMs}ms</p>
                </div>
              </div>
              <button
                onClick={clearLog}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
              {lastLog.error ? (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
                  {lastLog.error}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {lastLog.output}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
              <button
                onClick={clearLog}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Routine Modal */}
      <RoutineModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRoutine(null);
        }}
        onSave={saveRoutine}
        initialRoutine={editingRoutine}
      />
    </div>
  );
};
