import React, { useRef, useState } from 'react';
import {
  Sparkles,
  Wand2,
  Mic,
  MicOff,
  RotateCcw,
  Maximize2,
  X,
} from 'lucide-react';

interface ImageComposerProps {
  prompt: string;
  onChangePrompt: (prompt: string) => void;
  onGenerate: () => void;
  generating: boolean;
  disabled?: boolean;
}

const SpeechRecognitionCtor: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export const ImageComposer: React.FC<ImageComposerProps> = ({
  prompt,
  onChangePrompt,
  onGenerate,
  generating,
  disabled,
}) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) {
      alert('Voice dictation is not supported in this browser environment.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    basePromptRef.current = prompt;

    rec.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      const base = basePromptRef.current;
      onChangePrompt(base + (base && !base.endsWith(' ') ? ' ' : '') + text);
    };

    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Magic Polish: Enhances short prompts into vivid diffusion prompts
  const handleMagicPolish = () => {
    if (!prompt.trim()) return;
    const enhancements = [
      ', ultra realistic details, cinematic lighting, 8k resolution, photorealistic masterpiece, sharp focus',
      ', intricate textures, volumetric atmosphere, octane render aesthetic, dramatic depth of field',
      ', artstation trending quality, award winning composition, highly detailed render',
    ];
    const picked = enhancements[Math.floor(Math.random() * enhancements.length)];
    onChangePrompt(prompt.trim() + picked);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onGenerate();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="ui-label flex items-center gap-1.5">
          <span>Prompt</span>
          <span className="text-[10px] font-normal text-brand-textMuted font-mono">
            (Ctrl+Enter)
          </span>
        </label>

        {/* Quick Toolbar: Magic Polish, Voice Dictation, Clear */}
        <div className="flex items-center gap-1">
          {prompt && (
            <button
              type="button"
              onClick={() => onChangePrompt('')}
              className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
              title="Clear prompt"
            >
              <X size={12} />
            </button>
          )}

          <button
            type="button"
            onClick={handleMagicPolish}
            disabled={!prompt.trim() || generating}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/10 disabled:opacity-40 transition-colors cursor-pointer"
            title="Enhance prompt with cinematic diffusion keywords"
          >
            <Wand2 size={11} />
            <span>Magic Polish</span>
          </button>

          {SpeechRecognitionCtor && (
            <button
              type="button"
              onClick={toggleListening}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                listening
                  ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                  : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
              }`}
              title={listening ? 'Stop listening' : 'Voice dictation'}
            >
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Main Textarea */}
      <textarea
        rows={3}
        placeholder="Describe the image you want to generate in rich visual detail..."
        value={prompt}
        onChange={(e) => onChangePrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || generating}
        className="ui-input w-full p-2.5 text-xs resize-none transition-all placeholder:text-brand-textMuted/50 focus:ring-1 focus:ring-[var(--brand-accent)]"
      />
    </div>
  );
};
