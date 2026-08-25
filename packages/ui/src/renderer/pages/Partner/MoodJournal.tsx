import React, { useState } from 'react';
import { Smile, Send, Sparkles, Clock, MessageCircleHeart } from 'lucide-react';
import { usePartnerMemory, partnerMemory } from '../../stores/partnerMemory';
import type { CompanionAction } from './animations';

interface MoodJournalProps {
  onTriggerAction?: (action: CompanionAction) => void;
  onSendChatMessage?: (text: string) => void;
}

const MOOD_OPTIONS = [
  { emoji: '😊', label: 'Great', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', action: 'cheer' as CompanionAction, response: "I'm so glad to hear you're feeling great today! Let's build something awesome!" },
  { emoji: '⚡', label: 'Energized', color: 'border-amber-500/40 bg-amber-500/10 text-amber-300', action: 'dance' as CompanionAction, response: "Love the high energy! Let's crush our goals today!" },
  { emoji: '😌', label: 'Calm', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300', action: 'peace' as CompanionAction, response: "A peaceful mind is the best state for deep work. I'm right here beside you." },
  { emoji: '😴', label: 'Tired', color: 'border-purple-500/40 bg-purple-500/10 text-purple-300', action: 'stretch' as CompanionAction, response: "Make sure you hydrate and take a gentle stretch. Don't push too hard!" },
  { emoji: '😢', label: 'Stressed', color: 'border-rose-500/40 bg-rose-500/10 text-rose-300', action: 'heart' as CompanionAction, response: "Take a deep breath. You're doing your best, and I'm always in your corner." },
];

export const MoodJournal: React.FC<MoodJournalProps> = ({ onTriggerAction, onSendChatMessage }) => {
  const memory = usePartnerMemory();
  const [selectedMood, setSelectedMood] = useState(MOOD_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [lastLoggedResponse, setLastLoggedResponse] = useState<string | null>(null);

  const handleLogMood = (e: React.FormEvent) => {
    e.preventDefault();
    partnerMemory.logMood(selectedMood.emoji, selectedMood.label, note.trim() || undefined);
    
    // Trigger companion 3D reaction
    onTriggerAction?.(selectedMood.action);

    // Provide immediate empathetic feedback
    setLastLoggedResponse(selectedMood.response);

    // Optional: send to chat context
    if (onSendChatMessage && note.trim()) {
      onSendChatMessage(`[Mood check-in: Feeling ${selectedMood.label} ${selectedMood.emoji}] ${note.trim()}`);
    }

    setNote('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-slate-100 select-none scrollbar-none">
      {/* Top Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-purple-950/40 via-indigo-900/30 to-slate-900/60 border border-purple-500/30 p-5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-1">
          <Smile size={16} className="text-purple-400" />
          <h2 className="text-sm font-bold text-slate-100">Daily Mood Check-In</h2>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          How are you feeling right now, {memory.userNickname}? {memory.companionName} cares about your wellbeing.
        </p>

        {/* Emoji Selector */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {MOOD_OPTIONS.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSelectedMood(opt)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-2xl border transition-all cursor-pointer
                ${selectedMood.label === opt.label
                  ? `${opt.color} ring-2 ring-purple-400 shadow-md scale-105`
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-[10px] font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Note input & Submit */}
        <form onSubmit={handleLogMood} className="space-y-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a quick thought or note (optional)..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
          />

          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-400">
              +{3} Affinity points for check-in
            </span>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
            >
              <Send size={12} />
              <span>Log Mood</span>
            </button>
          </div>
        </form>
      </div>

      {/* Companion Response Toast */}
      {lastLoggedResponse && (
        <div className="p-3.5 rounded-2xl bg-indigo-950/50 border border-indigo-500/40 text-xs text-indigo-200 flex items-start gap-2.5 shadow-lg animate-fade-in">
          <MessageCircleHeart size={16} className="text-pink-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-100">{memory.companionName}: </span>
            <span>"{lastLoggedResponse}"</span>
          </div>
        </div>
      )}

      {/* Mood History Timeline */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-slate-400" />
          <h3 className="text-xs font-bold text-slate-200">Recent Mood Log</h3>
        </div>

        <div className="space-y-2">
          {memory.moodHistory.map(entry => (
            <div
              key={entry.id}
              className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs"
            >
              <span className="text-xl shrink-0">{entry.moodEmoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">{entry.moodLabel}</span>
                  <span className="text-[10px] text-slate-500">{entry.dateStr}</span>
                </div>
                {entry.note && (
                  <p className="text-slate-400 text-[11px] mt-0.5 break-words">{entry.note}</p>
                )}
              </div>
            </div>
          ))}

          {memory.moodHistory.length === 0 && (
            <p className="text-[11px] text-slate-500 italic text-center py-3">
              No mood check-ins yet. Log your first mood above!
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
