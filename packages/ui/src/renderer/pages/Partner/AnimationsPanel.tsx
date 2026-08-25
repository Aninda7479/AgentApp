import React, { useState } from 'react';
import { Sparkles, StopCircle, Play, Flame, Search, CheckCircle2 } from 'lucide-react';
import type { CompanionAction } from './animations';
import { usePartnerMemory } from '../../stores/partnerMemory';

interface AnimationsPanelProps {
  currentAction: CompanionAction;
  onTriggerAction: (action: CompanionAction) => void;
}

interface AnimationCardDef {
  id: CompanionAction;
  label: string;
  emoji: string;
  category: 'Greetings' | 'Expressions' | 'Grooves & Energy' | 'Relaxation' | 'Roleplay';
  duration: string;
  desc: string;
  triggerPrompt: string;
}

const ALL_ANIMATION_OPTIONS: AnimationCardDef[] = [
  // Greetings
  { id: 'wave',    label: 'Wave Hello',      emoji: '👋', category: 'Greetings',        duration: '4.5s',     desc: 'Friendly warm wave with soft body tilt and smiling gaze.', triggerPrompt: 'Hi Kai! Wave at me!' },
  { id: 'salute',  label: 'Respect Salute',  emoji: '🫡', category: 'Greetings',        duration: '4.0s',     desc: 'Crisp military salute with straight spine and focused gaze.', triggerPrompt: 'Salute the captain!' },
  { id: 'bow',     label: 'Polite Bow',      emoji: '🙇', category: 'Greetings',        duration: '3.2s',     desc: 'Graceful Japanese greeting bending smoothly at the hips.', triggerPrompt: 'Thank you so much!' },

  // Expressions & Feelings
  { id: 'heart',   label: 'Heart Love',      emoji: '💖', category: 'Expressions',      duration: '5.0s',     desc: 'Interlocking hands forming a cute chest heart with tilted head.', triggerPrompt: 'I love you!' },
  { id: 'peace',   label: 'Victory Peace',   emoji: '✌️', category: 'Expressions',      duration: '4.5s',     desc: 'Playful cheek pose with peace sign and confident wink.', triggerPrompt: 'We won!' },
  { id: 'blush',   label: 'Shy Blush',       emoji: '😳', category: 'Expressions',      duration: '4.5s',     desc: 'Shy body turn with hands together and downward glance.', triggerPrompt: "You're so cute!" },
  { id: 'laugh',   label: 'Giggle & Laugh',  emoji: '😄', category: 'Expressions',      duration: '4.0s',     desc: 'Hand over mouth with shoulders shaking with laughter.', triggerPrompt: 'Tell me a funny joke!' },

  // Grooves & Energy
  { id: 'dance',   label: 'Groovy Dance',    emoji: '💃', category: 'Grooves & Energy', duration: 'Looping',  desc: 'Rhythmic step-touch groove with hip sway and fluid arms.', triggerPrompt: 'Show me a dance!' },
  { id: 'cheer',   label: 'Fist Pump Cheer', emoji: '🎉', category: 'Grooves & Energy', duration: '4.5s',     desc: 'Enthusiastic double fist pump bounce with joyful celebration.', triggerPrompt: 'We deployed to production!' },
  { id: 'neko',    label: 'Cat Girl Paws',   emoji: '🐱', category: 'Grooves & Energy', duration: '5.0s',     desc: 'Alternating cat paw rolls with cute rhythmic head bobbing.', triggerPrompt: 'Meow like a cat!' },

  // Relaxation & Attention
  { id: 'stretch', label: 'Morning Stretch', emoji: '🤸', category: 'Relaxation',      duration: '6.0s',     desc: 'Deep overhead stretch arching spine gracefully, then exhales.', triggerPrompt: 'Can you do a stretch?' },
  { id: 'listen',  label: 'Attentive Listen',emoji: '👂', category: 'Relaxation',      duration: '5.0s',     desc: 'Forward lean toward screen with attentive head tilt.', triggerPrompt: 'Listen carefully to this...' },
  { id: 'thinking',label: 'Curious Think',   emoji: '🤔', category: 'Relaxation',      duration: 'Looping',  desc: 'Hand on chin, looking up with curious, pondering gaze.', triggerPrompt: 'Let me think about this...' },
  { id: 'idle',    label: 'Natural Standing',emoji: '🧍', category: 'Relaxation',      duration: 'Looping',  desc: 'Organic 4.2s breathing cycle with gentle hip weight shift.', triggerPrompt: 'Relax and stand naturally' },
];

const CATEGORIES = ['All', 'Greetings', 'Expressions', 'Grooves & Energy', 'Relaxation'] as const;

export const AnimationsPanel: React.FC<AnimationsPanelProps> = ({ currentAction, onTriggerAction }) => {
  const memory = usePartnerMemory();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  const filtered = ALL_ANIMATION_OPTIONS.filter(anim => {
    const matchCat = selectedCategory === 'All' || anim.category === selectedCategory;
    const matchSearch =
      anim.label.toLowerCase().includes(search.toLowerCase()) ||
      anim.desc.toLowerCase().includes(search.toLowerCase()) ||
      anim.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 text-slate-100 select-none scrollbar-none">
      {/* Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-950/50 via-purple-900/30 to-slate-900/60 border border-indigo-500/30 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100">Motion & Animation Catalog</h2>
          </div>
          {currentAction !== 'idle' && (
            <button
              onClick={() => onTriggerAction('idle')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-[11px] font-bold transition-all cursor-pointer"
            >
              <StopCircle size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-300 leading-snug">
          Trigger live 3D animation routines for {memory.companionName}, or type their keyword in chat!
        </p>

        {/* Search Input */}
        <div className="relative mt-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search motions (dance, wave, stretch, etc.)..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer
              ${selectedCategory === cat
                ? 'bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-sm'
                : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Animation Cards Grid */}
      <div className="space-y-2">
        {filtered.map(anim => {
          const isActive = currentAction === anim.id;

          return (
            <div
              key={anim.id}
              className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 group
                ${isActive
                  ? 'bg-indigo-950/60 border-pink-500/60 ring-1 ring-pink-400/50 shadow-lg'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/70'}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-2xl shrink-0 mt-0.5">{anim.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-xs font-bold text-slate-100">{anim.label}</h3>
                    <span className="px-1.5 py-0.2 rounded-md bg-slate-800/80 border border-slate-700 text-[9px] font-mono text-slate-300">
                      {anim.duration}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-pink-400 animate-pulse">
                        <Flame size={10} /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{anim.desc}</p>
                  <div className="mt-1.5 text-[10px] text-indigo-300/80 font-mono">
                    Chat trigger: <em>"{anim.triggerPrompt}"</em>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onTriggerAction(anim.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer
                  ${isActive
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white'}`}
              >
                {isActive ? (
                  <>
                    <CheckCircle2 size={12} />
                    <span>Playing</span>
                  </>
                ) : (
                  <>
                    <Play size={11} />
                    <span>Play</span>
                  </>
                )}
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center py-6 text-xs text-slate-500 italic">
            No animations found matching "{search}".
          </p>
        )}
      </div>
    </div>
  );
};
