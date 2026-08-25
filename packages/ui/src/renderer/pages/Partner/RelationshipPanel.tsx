import React, { useState } from 'react';
import {
  Heart,
  Flame,
  Award,
  Sparkles,
  Brain,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { usePartnerMemory, partnerMemory } from '../../stores/partnerMemory';

interface MilestoneDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

const ALL_MILESTONES: MilestoneDef[] = [
  { id: 'first_meeting', title: 'First Encounter', desc: 'Met your 3D AI companion', icon: '✨' },
  { id: 'streak_3', title: '3-Day Streak', desc: 'Talked 3 days in a row', icon: '🔥' },
  { id: 'streak_7', title: 'Weekly Bond', desc: 'Maintained a 7-day conversation streak', icon: '⚡' },
  { id: 'affinity_50', title: 'Close Friends', desc: 'Reached 50% affinity score', icon: '💖' },
  { id: 'affinity_80', title: 'Deep Trust', desc: 'Reached 80% affinity score', icon: '🌟' },
  { id: 'affinity_100', title: 'Soulmate Bond', desc: 'Maximized affinity to 100%', icon: '👑' },
  { id: 'chats_25', title: '25 Conversations', desc: 'Exchanged 25+ messages with your partner', icon: '💬' },
  { id: 'chats_100', title: 'Centurion', desc: 'Exchanged 100+ deep conversations', icon: '🏆' },
];

function getRelationshipLevel(affinity: number): { title: string; subtitle: string; color: string } {
  if (affinity >= 90) return { title: 'Soulmate', subtitle: 'Unbreakable connection & absolute trust', color: 'text-amber-400' };
  if (affinity >= 70) return { title: 'Inseparable', subtitle: 'Strong mutual affection and understanding', color: 'text-pink-400' };
  if (affinity >= 45) return { title: 'Close Companion', subtitle: 'Comfortable and genuinely fond of each other', color: 'text-indigo-400' };
  if (affinity >= 20) return { title: 'Good Friend', subtitle: 'Warm rapport and regular banter', color: 'text-cyan-400' };
  return { title: 'Acquaintance', subtitle: 'Getting to know each other', color: 'text-slate-400' };
}

export const RelationshipPanel: React.FC = () => {
  const memory = usePartnerMemory();
  const [newMemoryText, setNewMemoryText] = useState('');
  const [showAddMemory, setShowAddMemory] = useState(false);

  const level = getRelationshipLevel(memory.affinityScore);

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    partnerMemory.addMemory(newMemoryText);
    setNewMemoryText('');
    setShowAddMemory(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-slate-100 select-none scrollbar-none">
      
      {/* Header Level Card */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-slate-900/60 border border-indigo-500/30 p-5 shadow-xl relative overflow-hidden backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-bold uppercase tracking-wider">
                Bond Status
              </span>
              <span className="text-xs text-slate-400">with {memory.companionName}</span>
            </div>
            <h2 className={`text-xl font-black tracking-tight ${level.color}`}>
              {level.title}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{level.subtitle}</p>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 shadow-md">
            <Heart size={22} className="animate-pulse" />
          </div>
        </div>

        {/* Affinity Progress Meter */}
        <div className="space-y-1.5 mt-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-300">Affinity Meter</span>
            <span className="font-mono text-pink-400">{memory.affinityScore}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-950/80 border border-slate-800 p-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-pink-500 to-rose-400 transition-all duration-700 shadow-sm"
              style={{ width: `${Math.max(4, memory.affinityScore)}%` }}
            />
          </div>
        </div>

        {/* Stat Pills */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Flame size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100">{memory.streak} Day Streak</div>
              <div className="text-[10px] text-slate-400">Daily interactions</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100">{memory.totalInteractions} Chats</div>
              <div className="text-[10px] text-slate-400">Total exchanges</div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Memories Section */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain size={15} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-100">Companion Memory Recall</h3>
          </div>
          <button
            onClick={() => setShowAddMemory(s => !s)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
          >
            <Plus size={12} />
            <span>Add Fact</span>
          </button>
        </div>

        {showAddMemory && (
          <form onSubmit={handleAddMemory} className="mb-3 flex flex-col gap-2 animate-fade-in">
            <input
              type="text"
              value={newMemoryText}
              onChange={e => setNewMemoryText(e.target.value)}
              placeholder="e.g. Likes building VR & 3D apps in React..."
              className="w-full px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddMemory(false)}
                className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs"
              >
                Remember
              </button>
            </div>
          </form>
        )}

        <div className="space-y-1.5">
          {memory.keyMemories.map((mem, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 group"
            >
              <span className="leading-relaxed">{mem}</span>
              <button
                onClick={() => partnerMemory.removeMemory(idx)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                title="Forget this memory"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {memory.keyMemories.length === 0 && (
            <p className="text-[11px] text-slate-500 italic text-center py-2">
              No memories recorded yet. Talk with your companion to build context!
            </p>
          )}
        </div>
      </div>

      {/* Milestones Grid */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
          <Award size={15} className="text-amber-400" />
          <h3 className="text-xs font-bold text-slate-100">Milestone Badges</h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ALL_MILESTONES.map(m => {
            const unlocked = memory.milestones.includes(m.id);
            return (
              <div
                key={m.id}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all
                  ${unlocked
                    ? 'bg-slate-900/80 border-indigo-500/40 text-slate-200 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/40 opacity-45'}`}
              >
                <div className="text-lg shrink-0 mt-0.5">{m.icon}</div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-100">{m.title}</span>
                    {unlocked ? (
                      <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                    ) : (
                      <Lock size={10} className="text-slate-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset Section */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={() => {
            if (window.confirm('Reset relationship score and memories back to defaults?')) {
              partnerMemory.resetMemory();
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 hover:text-red-400 text-xs transition-colors cursor-pointer"
        >
          <RotateCcw size={12} />
          <span>Reset Relationship</span>
        </button>
      </div>

    </div>
  );
};
