import React, { useState } from 'react';
import { UserCog, Heart, Shield, Users, BookOpen, Save, Check } from 'lucide-react';
import {
  usePartnerMemory,
  partnerMemory,
  type CompanionRelationshipType,
  type PersonalitySliders,
} from '../../stores/partnerMemory';

const RELATIONSHIP_TYPES: { id: CompanionRelationshipType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'friend',     label: 'Friend',     icon: <Users size={14} />,    desc: 'Supportive, curious, and witty peer' },
  { id: 'girlfriend', label: 'Girlfriend', icon: <Heart size={14} />,    desc: 'Affectionate, warm, playful, and deeply caring' },
  { id: 'boyfriend',  label: 'Boyfriend',  icon: <Shield size={14} />,   desc: 'Calm, protective, encouraging, and loyal' },
  { id: 'mentor',     label: 'Mentor',     icon: <BookOpen size={14} />, desc: 'Wise, articulate, focused on your growth' },
];

export const CompanionPersona: React.FC = () => {
  const memory = usePartnerMemory();

  const [name, setName] = useState(memory.companionName);
  const [nickname, setNickname] = useState(memory.userNickname);
  const [relType, setRelType] = useState<CompanionRelationshipType>(memory.relationshipType);
  const [personality, setPersonality] = useState<PersonalitySliders>(memory.personality);
  const [backstory, setBackstory] = useState(memory.backstory);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    partnerMemory.updatePersona({
      companionName: name.trim() || 'Kai',
      userNickname: nickname.trim() || 'Partner',
      relationshipType: relType,
      personality,
      backstory: backstory.trim(),
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleSliderChange = (key: keyof PersonalitySliders, val: number) => {
    setPersonality(prev => ({ ...prev, [key]: val }));
  };

  return (
    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-slate-100 select-none scrollbar-none">
      {/* Persona Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-950/40 via-purple-900/30 to-slate-900/60 border border-indigo-500/30 p-5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-1">
          <UserCog size={16} className="text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-100">Companion Persona & Identity</h2>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Tune your companion's personality traits, names, and backstory to fit your ideal partner dynamic.
        </p>

        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Companion Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Kai"
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">What they call you</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="e.g. Darling / Captain"
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Relationship Dynamics */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <h3 className="text-xs font-bold text-slate-200 mb-2.5">Relationship Dynamic</h3>
        <div className="grid grid-cols-2 gap-2">
          {RELATIONSHIP_TYPES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRelType(r.id)}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer
                ${relType === r.id
                  ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-400 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <div className="mt-0.5 shrink-0 text-indigo-400">{r.icon}</div>
              <div>
                <div className="text-xs font-bold text-slate-100">{r.label}</div>
                <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Personality Trait Sliders */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md space-y-3.5">
        <h3 className="text-xs font-bold text-slate-200">Personality Spectrum</h3>

        {/* Warmth */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300 font-semibold">Warmth & Affection</span>
            <span className="text-slate-400 font-mono">
              {personality.warmth === 1 ? 'Reserved' : personality.warmth >= 4 ? 'Deeply Affectionate' : 'Warm'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={personality.warmth}
            onChange={e => handleSliderChange('warmth', Number(e.target.value))}
            className="w-full accent-pink-500 cursor-pointer"
          />
        </div>

        {/* Playfulness */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300 font-semibold">Playfulness & Teasing</span>
            <span className="text-slate-400 font-mono">
              {personality.playfulness === 1 ? 'Serious' : personality.playfulness >= 4 ? 'Very Playful' : 'Balanced'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={personality.playfulness}
            onChange={e => handleSliderChange('playfulness', Number(e.target.value))}
            className="w-full accent-purple-500 cursor-pointer"
          />
        </div>

        {/* Directness */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300 font-semibold">Boldness & Directness</span>
            <span className="text-slate-400 font-mono">
              {personality.directness === 1 ? 'Shy / Gentle' : personality.directness >= 4 ? 'Bold & Proactive' : 'Moderate'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={personality.directness}
            onChange={e => handleSliderChange('directness', Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Formality */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300 font-semibold">Dialogue Formality</span>
            <span className="text-slate-400 font-mono">
              {personality.formality === 1 ? 'Casual Slang' : personality.formality >= 4 ? 'Articulate & Polite' : 'Natural'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={personality.formality}
            onChange={e => handleSliderChange('formality', Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Backstory */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <label className="block text-xs font-bold text-slate-200 mb-1">Companion Backstory & Lore</label>
        <p className="text-[10px] text-slate-400 mb-2">
          This context is seamlessly woven into your companion's memory and responses.
        </p>
        <textarea
          rows={3}
          value={backstory}
          onChange={e => setBackstory(e.target.value)}
          placeholder="Write your companion's lore or shared history..."
          className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Save Action Button */}
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
      >
        {savedSuccess ? (
          <>
            <Check size={16} className="text-emerald-300" />
            <span>Persona Saved & Updated!</span>
          </>
        ) : (
          <>
            <Save size={15} />
            <span>Save Companion Persona</span>
          </>
        )}
      </button>
    </form>
  );
};
