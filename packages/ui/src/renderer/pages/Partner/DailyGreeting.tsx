import React, { useState, useEffect } from 'react';
import { Sun, Moon, Sparkles, X, Heart } from 'lucide-react';
import { usePartnerMemory } from '../../stores/partnerMemory';

interface DailyGreetingProps {
  onGreet?: () => void;
}

export const DailyGreeting: React.FC<DailyGreetingProps> = ({ onGreet }) => {
  const memory = usePartnerMemory();
  const [dismissed, setDismissed] = useState(false);

  // Check if greeted today already
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const key = `superagent_greeting_dismissed_${today}`;
    if (sessionStorage.getItem(key)) {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;

  const hour = new Date().getHours();
  let timeGreeting = 'Good evening';
  let icon = <Moon size={16} className="text-indigo-400" />;
  let sub = "Hope you've had a productive day! Let me know what you'd like to work on.";

  if (hour >= 5 && hour < 12) {
    timeGreeting = 'Good morning';
    icon = <Sun size={16} className="text-amber-400" />;
    sub = "Ready for another great day? I'm right here with you.";
  } else if (hour >= 12 && hour < 18) {
    timeGreeting = 'Good afternoon';
    icon = <Sun size={16} className="text-orange-400" />;
    sub = "How is your progress going? Don't forget to take short breaks!";
  } else if (hour >= 23 || hour < 5) {
    timeGreeting = 'Late night coding?';
    icon = <Moon size={16} className="text-purple-400" />;
    sub = "Burning the midnight oil! Don't push too hard, okay?";
  }

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    sessionStorage.setItem(`superagent_greeting_dismissed_${today}`, 'true');
    setDismissed(true);
  };

  const handleGreetBack = () => {
    onGreet?.();
    handleDismiss();
  };

  return (
    <div className="mx-4 my-2 rounded-2xl bg-gradient-to-r from-indigo-900/60 via-purple-900/40 to-slate-900/80 border border-indigo-500/30 p-3.5 shadow-xl backdrop-blur-xl animate-fade-in relative flex items-start justify-between gap-3 select-none">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-bold text-slate-100">
              {timeGreeting}, {memory.userNickname}! ✨
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-300 text-[9px] font-semibold">
              {memory.companionName}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-snug">{sub}</p>

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleGreetBack}
              className="flex items-center gap-1 px-3 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-[11px] shadow-sm transition-all cursor-pointer"
            >
              <Heart size={11} />
              <span>Wave & Greet</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-2 py-1 rounded-xl text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleDismiss}
        className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
};
