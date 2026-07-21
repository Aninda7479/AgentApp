import React, { useState, KeyboardEvent, useEffect, useRef, useMemo } from 'react';
import { Select } from '../../components/ui';
import { getIpc } from '../../lib/electron';
import {
  Plus,
  Cpu,
  Mic,
  ArrowUp,
  Folder,
  ChevronDown,
  UserCheck,
  Check,
  ShieldCheck,
  ShieldAlert,
  Info,
  Workflow,
} from 'lucide-react';
import {
  SlashSuggestion,
  SkillInfo,
  builtinSuggestions,
  buildSuggestions,
} from '../../components/slashCommands';
import { ComposerService } from '../../logic/composer';

/**
 * The auto-routing sentinel. The internal value is `'Orchestrator'` so the
 * orchestrator's routing branch (main process) resolves it; in the Workspace
 * composer it is displayed as `AUTO_ROUTE_LABEL` with a distinct icon.
 */
const AUTO_ROUTE_MODEL = 'Orchestrator';
const AUTO_ROUTE_LABEL = 'Orchestrator';

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeWavHeader(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function bufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  return writeWavHeader(samples, buffer.sampleRate);
}


/** Options returned by the Composer when a prompt is submitted. */
export interface ComposerOptions {
  model: string;
  mode: 'auto' | 'plan' | 'bypass';
  attachments: string[];
}

/** A file attachment queued in the composer. */
export interface AttachmentItem {
  filename: string;
  sourcePath?: string;
  buffer?: number[];
}

interface ProjectRef {
  name: string;
}

/** Props for the Composer prompt input component. */
export interface ComposerProps {
  onSend: (prompt: string, options: ComposerOptions) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  onStop?: () => void;
  availableModels?: string[];
  /**
   * State-aware message shown when no model is available (null when usable).
   * Lets the placeholder tell the user the *correct* next step (connect a
   * provider vs. enable a model) instead of a single generic string.
   */
  emptyStateMessage?: string | null;
  defaultModel?: string;
  /** Called whenever the user changes the selected model in the dropdown. */
  onModelChange?: (model: string) => void;
  /**
   * The approval choice seeded from the active chat/project/global "Sandbox &
   * Internet" defaults. The user can still change it per send; this only sets
   * the initial value when the active scope changes.
   */
  defaultApprovalMode?: 'always' | 'ask' | 'never';
  activeProject?: string;
  onAttachClick?: () => void;
  promptValue?: string;
  onPromptChange?: (val: string) => void;
  onAttachPastedFiles?: (files: FileList) => void;
  attachments?: AttachmentItem[];
  onRemoveAttachment?: (index: number) => void;

  // ── Real, functional extras (no filler) ──
  /** Projects available for the context pill's switcher. */
  projects?: ProjectRef[];
  /** Switch the active project from the composer context pill. */
  onSelectProject?: (name: string) => void;
  /** Sandbox / full-access execution mode (bound to real settings). */
  sandbox?: boolean;
  onSandboxChange?: (value: boolean) => void;
  /** Invoked when the browser/Electron lacks the Web Speech API. */
  onMicUnavailable?: () => void;
  /** Surfaces a user-facing mic notice (errors, setup hints) as a toast. */
  onMicNotice?: (message: string) => void;

  // ── Slash-command autocomplete ──
  /** Built-in slash commands shown in the `/` autocomplete. */
  slashCommands?: SlashSuggestion[];
  /** Discovered skills shown in the `/` autocomplete. */
  skills?: SkillInfo[];
  /** Configured MCP servers shown in the `/` autocomplete. */
  mcpServers?: { name: string; id: string; tools?: { name: string; description?: string }[] }[];
}

// Web Speech API types are not in the standard lib; treat as any.
const SpeechRecognitionCtor: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

/** Main prompt composer with model selector, approval mode, voice dictation, and context controls. */
export const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  isGenerating = false,
  onStop,
  availableModels = ['5.5 Medium', 'o3-mini', 'gpt-4o', 'claude-3-5-sonnet'],
  emptyStateMessage,
  defaultModel = '5.5 Medium',
  activeProject = '',
  onAttachClick,
  promptValue,
  onPromptChange,
  onAttachPastedFiles,
  attachments = [],
  onRemoveAttachment,
  onModelChange,
  projects = [],
  onSelectProject,
  sandbox = true,
  onSandboxChange,
  onMicUnavailable,
  onMicNotice,
  slashCommands,
  skills = [],
  mcpServers = [],
  defaultApprovalMode
}) => {
  const [localPrompt, setLocalPrompt] = useState('');
  const prompt = promptValue !== undefined ? promptValue : localPrompt;
  const setPrompt = onPromptChange !== undefined ? onPromptChange : setLocalPrompt;

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [approvalMode, setApprovalMode] = useState<'always' | 'never' | 'ask'>('ask');
  const [showApprovalDropdown, setShowApprovalDropdown] = useState(false);


  // Voice dictation
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');
  // Model-based (cloud STT) path state.
  const mediaRecorderRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const isPreTranscribingRef = useRef<boolean>(false);
  const [voiceEngine, setVoiceEngine] = useState<'auto' | 'browser' | 'model' | 'local'>('auto');
  const [voiceModelAvailable, setVoiceModelAvailable] = useState<boolean | null>(null);
  const [localWhisperEnabled, setLocalWhisperEnabled] = useState<boolean>(false);

  const ipcRenderer = getIpc();

  // Resolve which engine the mic should use, and whether a cloud model is ready.
  useEffect(() => {
    if (!ipcRenderer) return;
    let active = true;
    ipcRenderer.invoke('settings-read').then((settings: any) => {
      if (!active) return;
      const voice = settings?.voice || {};
      setVoiceEngine(
        voice.engine === 'browser' || voice.engine === 'model' || voice.engine === 'local'
          ? voice.engine
          : 'auto'
      );
      setLocalWhisperEnabled(Boolean(voice.localWhisper?.enabled));
      const providers = settings?.providers || [];
      const provider = providers.find((p: any) => p.id === voice.providerId) || providers.find((p: any) => p.apiKey);
      setVoiceModelAvailable(Boolean(provider?.apiKey));
    }).catch(() => { /* leave defaults */ });
    return () => { active = false; };
  }, []);

  // Keep the model selector in sync with the active chat's model. This makes the
  // model sticky per chat (switching chats shows that chat's model) and reflects
  // a model the user just picked for this conversation.
  useEffect(() => {
    setSelectedModel(defaultModel);
  }, [defaultModel]);

  const usesModelEngine =
    voiceEngine === 'model' ||
    voiceEngine === 'local' ||
    (voiceEngine === 'auto' && (voiceModelAvailable === true || localWhisperEnabled === true));

  // Project switcher popover
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const tx = textareaRef.current;
    if (tx) {
      tx.style.height = 'auto';
      tx.style.height = `${Math.min(tx.scrollHeight, 180)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt]);

  // ── Slash-command autocomplete ───────────────────────────────────────────────
  const [slashStart, setSlashStart] = useState<number | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  const allSuggestions = useMemo(
    () =>
      buildSuggestions(
        slashCommands && slashCommands.length ? slashCommands : builtinSuggestions(),
        skills,
        mcpServers
      ),
    [slashCommands, skills, mcpServers]
  );

  const filtered = useMemo(
    () => ComposerService.filterSuggestions(allSuggestions, slashQuery),
    [allSuggestions, slashQuery]
  );

  const menuOpen = slashStart !== null;
  const activeIndex = filtered.length ? Math.min(slashIndex, filtered.length - 1) : 0;

  // Keeps the highlighted item visible as the user arrows through the list.
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (menuOpen) {
      activeItemRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, menuOpen]);

  /** Recompute the active slash token from the caret position. */
  const updateSlashFromCaret = (value: string, caret: number) => {
    let start = caret;
    while (start > 0 && !/\s/.test(value[start - 1])) start--;
    const token = value.slice(start, caret);
    if (token.startsWith('/')) {
      const q = token.slice(1);
      // Only reset the highlight to the first item when the query text changes
      // (typing a new character). Caret/arrow movement within the same token
      // must not reset the selection — otherwise ArrowUp/Down can't navigate.
      if (q !== slashQuery) setSlashIndex(0);
      setSlashStart(start);
      setSlashQuery(q);
    } else {
      setSlashStart(null);
      setSlashQuery('');
    }
  };

  const syncSlash = () => {
    const el = textareaRef.current;
    if (!el) return;
    updateSlashFromCaret(el.value, el.selectionStart ?? el.value.length);
  };

  /** Insert a selected suggestion at the caret, replacing the in-progress token. */
  const acceptSlash = (item: SlashSuggestion) => {
    const el = textareaRef.current;
    const value = prompt;
    const caret = el?.selectionStart ?? value.length;
    const start = slashStart ?? caret;
    const newValue = value.slice(0, start) + item.insertText + value.slice(caret);
    setPrompt(newValue);
    setSlashStart(null);
    setSlashQuery('');
    const newCaret = start + item.insertText.length;
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (t) {
        t.focus();
        t.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      if (onAttachPastedFiles) {
        onAttachPastedFiles(files);
      }
    }
  };

  const hasModels = availableModels && availableModels.length > 0;
  // "Orchestrator" is the auto-router meta-entry, not a concrete sendable
  // model. Surface a hint when it's selected so the user understands they can
  // pick a specific model to send directly (addresses the silent composer
  // dead-end the ux-critic flagged — no guidance when the router is selected).
  const selectedIsRouter = selectedModel === 'Orchestrator';

  useEffect(() => {
    if (hasModels) {
      if (!availableModels.includes(selectedModel)) {
        setSelectedModel(availableModels[0] || defaultModel);
      }
    }
  }, [availableModels, defaultModel, hasModels, selectedModel]);

  useEffect(() => {
    if (defaultModel && availableModels.includes(defaultModel)) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel]);

  // Seed the approval dropdown from the active chat/project/global default. The
  // user can still change it per send; this only sets the initial value
  // when the resolved scope's default changes.
  useEffect(() => {
    if (defaultApprovalMode) {
      setApprovalMode(defaultApprovalMode);
    }
  }, [defaultApprovalMode]);

  const stopMicStream = () => {
    try {
      micStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch {
      /* ignore */
    }
    micStreamRef.current = null;
  };

  const finalizeTranscription = (text: string) => {
    setTranscribing(false);
    const base = basePromptRef.current;
    const trimmed = text.trim();
    if (!trimmed) return;
    setPrompt(base + (base && !base.endsWith(' ') ? ' ' : '') + trimmed);
  };

  const appendTranscript = (text: string) => {
    const base = basePromptRef.current;
    const trimmed = text.trim();
    if (!trimmed) return;
    setPrompt(base + (base && !base.endsWith(' ') ? ' ' : '') + trimmed);
  };

  /** Model-based dictation: record audio with MediaRecorder, then transcribe. */
  const startModelDictation = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onMicNotice?.('Microphone access is not available in this environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const chunks: BlobPart[] = [];
      const mimeType = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].find(
        (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)
      ) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e: any) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
        
        // Quietly run accumulative pre-transcription while recording (every 3 seconds)
        if (recorder.state === 'recording' && !isPreTranscribingRef.current && chunks.length > 0) {
          isPreTranscribingRef.current = true;
          try {
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioContextClass();
            let audioBuffer: AudioBuffer;
            try {
              audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (decodeErr) {
              await audioCtx.close();
              throw decodeErr;
            }
            await audioCtx.close();

            const OfflineAudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const offlineCtx = new OfflineAudioContextClass(
              1,
              Math.round(audioBuffer.duration * 16000),
              16000
            );
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start();
            const renderedBuffer = await offlineCtx.startRendering();

            const wavBuffer = bufferToWav(renderedBuffer);
            const buf = new Uint8Array(wavBuffer);

            const res = ipcRenderer
              ? await ipcRenderer.invoke('media-transcribe', {
                  buffer: buf,
                  filename: 'dictation.wav',
                  mimeType: 'audio/wav'
                })
              : null;
            if (res?.ok && recorder.state === 'recording') {
              const base = basePromptRef.current;
              const trimmed = (res.text || '').trim();
              if (trimmed) {
                setPrompt(base + (base && !base.endsWith(' ') ? ' ' : '') + trimmed);
              }
            }
          } catch (err) {
            console.warn('Pre-transcription chunk error:', err);
          } finally {
            isPreTranscribingRef.current = false;
          }
        }
      };
      recorder.onstop = async () => {
        stopMicStream();
        setListening(false);
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        if (blob.size === 0) {
          setTranscribing(false);
          return;
        }
        setTranscribing(true);
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          let audioBuffer: AudioBuffer;
          try {
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          } catch (decodeErr) {
            await audioCtx.close();
            throw decodeErr;
          }
          await audioCtx.close();

          const OfflineAudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
          const offlineCtx = new OfflineAudioContextClass(
            1,
            Math.round(audioBuffer.duration * 16000),
            16000
          );
          const source = offlineCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineCtx.destination);
          source.start();
          const renderedBuffer = await offlineCtx.startRendering();

          const wavBuffer = bufferToWav(renderedBuffer);
          const buf = new Uint8Array(wavBuffer);

          const res = ipcRenderer
            ? await ipcRenderer.invoke('media-transcribe', {
                buffer: buf,
                filename: 'dictation.wav',
                mimeType: 'audio/wav'
              })
            : null;
          if (res?.ok) {
            finalizeTranscription(res.text || '');
          } else {
            basePromptRef.current = prompt; // Re-sync base on error
            setTranscribing(false);
            onMicNotice?.(res?.error || 'Transcription failed.');
          }
        } catch (err: any) {
          basePromptRef.current = prompt; // Re-sync base on error
          setTranscribing(false);
          onMicNotice?.(err?.message ? `Transcription failed: ${err.message}` : 'Transcription failed.');
        }
      };
      basePromptRef.current = prompt;
      isPreTranscribingRef.current = false;
      recorder.start(3000); // Trigger data chunks every 3 seconds while user speaks
      setListening(true);
    } catch (err: any) {
      stopMicStream();
      setListening(false);
      const denied = /denied|notallowed|permission/i.test(String(err?.message || err?.name || ''));
      onMicNotice?.(denied ? 'Microphone permission was denied.' : 'Could not start the microphone.');
    }
  };

  const stopModelDictation = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      stopMicStream();
      setListening(false);
    }
  };

  const toggleDictation = () => {
    // Cloud STT model path (Auto-with-config or explicit Model engine).
    if (usesModelEngine) {
      if (listening || transcribing) {
        if (transcribing) return;
        stopModelDictation();
        return;
      }
      startModelDictation();
      return;
    }

    // Browser Web Speech API path.
    if (!SpeechRecognitionCtor) {
      onMicUnavailable?.();
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
      appendTranscript(text);
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

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      try {
        mediaRecorderRef.current?.stop?.();
      } catch {
        /* already stopped */
      }
      stopMicStream();
    };
  }, []);

  const handleSend = () => {
    if (!prompt.trim() || disabled || isGenerating || !hasModels) return;
    const toSend = prompt;
    // Clear BEFORE dispatching: prompt-seed commands (/image, /pdf, /3d, …) set
    // the composer synchronously inside onSend, so clearing afterwards would wipe
    // the seed the user is meant to review. Clearing first lets the seed win, and
    // still clears instantly for normal sends.
    setPrompt('');
    basePromptRef.current = '';
    onSend(toSend, ComposerService.buildSendOptions(selectedModel, approvalMode, []));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (menuOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptSlash(filtered[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashStart(null);
        setSlashQuery('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getApprovalLabel = () => ComposerService.approvalLabel(approvalMode);

  return (
    <div
      data-testid="composer-container"
      className="px-4 pt-2 pb-4 max-w-235 w-full mx-auto flex flex-col gap-2 box-border relative z-10"
    >
      {/* The main input composer card */}
      <div className="glass-panel rounded-xl p-3 flex flex-col shadow-sm relative transition-all duration-300 focus-within:border-brand-border-strong focus-within:ring-2 focus-within:ring-brand-hover-strong">
        {/* Composer Attachments Queue Row */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-brand-border/40 select-none">
            {attachments.map((file, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-brand-card hover:bg-brand-card/85 border border-brand-border px-2.5 py-1 rounded-lg text-xs text-brand-textMain animate-fade-in group transition-colors">
                <span className="text-brand-textMuted text-[10px]">📎</span>
                <span className="truncate max-w-35 font-medium font-sans">{file.filename}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment && onRemoveAttachment(idx)}
                  className="text-brand-textMuted hover:text-brand-textMain font-bold ml-1 rounded hover:bg-[var(--brand-hover)] w-4 h-4 flex items-center justify-center transition-colors cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          data-testid="composer-input"
          aria-label="Message"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            updateSlashFromCaret(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={handleKeyDown}
          onClick={syncSlash}
          onSelect={syncSlash}
          onPaste={handlePaste}
          placeholder={hasModels ? "Ask anything — or type / for skills, commands & tools" : (emptyStateMessage || "No models are connected yet. Please go to Settings to connect a provider.")}
          disabled={disabled}
          rows={1}
          className="bg-transparent border-none outline-none text-brand-textMain text-sm resize-none w-full min-h-11 leading-relaxed placeholder-brand-textMuted/55 font-sans disabled:opacity-50"
        />

        {selectedIsRouter && (
          <div
            data-testid="composer-router-hint"
            className="mb-3 flex items-center gap-1.5 text-[10px] font-mono text-brand-textMuted/65 leading-none"
          >
            <Info className="w-3 h-3 shrink-0 text-brand-textMuted/50" />
            <span>
              auto-routing: active across available models
            </span>
          </div>
        )}

        {/* Toolbar row inside box */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-t border-brand-border/60 pt-4 mt-4">
          {/* Left toolbar elements */}
          <div className="flex items-center gap-2 relative">
            {/* Plus / attach button */}
            <button
              data-testid="composer-attach-btn"
              onClick={() => onAttachClick?.()}
              aria-label="Attach file"
              title="Attach file"
              className="text-brand-textMuted hover:text-brand-textMain p-2 rounded-lg bg-brand-popover/60 hover:bg-brand-popover border border-brand-border transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Ask for Approval Dropdown Pill */}
            <div className="relative">
              <button
                data-testid="approval-dropdown-btn"
                onClick={() => setShowApprovalDropdown(!showApprovalDropdown)}
                className="bg-brand-popover border border-brand-border hover:border-brand-border-strong hover:bg-brand-card text-brand-textMain px-3 sm:px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none active:scale-[0.98] shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5 text-brand-textMuted" />
                <span className="hidden sm:inline">{getApprovalLabel()}</span>
                <ChevronDown className="w-3 h-3 text-brand-textMuted" />
              </button>

              {showApprovalDropdown && (
                <div
                  data-testid="approval-dropdown-menu"
                  className="absolute bottom-full left-0 mb-2 glass-panel rounded-lg shadow-lg z-50 w-47.5 overflow-hidden"
                >
                  <div
                    data-testid="approval-option-ask"
                    onClick={() => {
                      setApprovalMode('ask');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-brand-hover cursor-pointer transition-colors"
                  >
                    Ask for approval
                  </div>
                  <div
                    data-testid="approval-option-always"
                    onClick={() => {
                      setApprovalMode('always');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-brand-hover cursor-pointer transition-colors"
                  >
                    Always approve
                  </div>
                  <div
                    data-testid="approval-option-never"
                    onClick={() => {
                      setApprovalMode('never');
                      setShowApprovalDropdown(false);
                    }}
                    className="px-3.5 py-2.5 text-xs text-brand-textMain hover:bg-brand-hover cursor-pointer transition-colors"
                  >
                    Never approve
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right toolbar elements */}
          <div className="flex items-center gap-2.5">
            {/* Model Badge */}
            <div className="relative">
              <Select
                options={availableModels.map((model) =>
                  model === AUTO_ROUTE_MODEL
                    ? { value: model, label: AUTO_ROUTE_LABEL, icon: <Workflow className="w-3.5 h-3.5" />, description: 'Auto-routes each request to the best model for the job — or pick a specific model to send directly.' }
                    : { value: model, label: model, icon: <Cpu className="w-3.5 h-3.5" /> }
                )}
                value={selectedModel}
                onChange={(model) => {
                  setSelectedModel(model);
                  onModelChange?.(model);
                }}
                placeholder={hasModels ? 'Select model...' : (emptyStateMessage || 'No models connected')}
                direction="up"
                className="w-45 sm:w-55"
              />
            </div>

            {/* Mic / voice dictation */}
            <button
              data-testid="composer-mic-btn"
              data-testid-mic-state={transcribing ? 'transcribing' : listening ? 'listening' : 'idle'}
              onClick={toggleDictation}
              title={
                transcribing
                  ? 'Transcribing…'
                  : listening
                  ? 'Stop dictation'
                  : usesModelEngine
                  ? 'Dictate with your voice (cloud model)'
                  : (SpeechRecognitionCtor ? 'Dictate with your voice' : 'Voice input not supported here')
              }
              aria-label={
                transcribing
                  ? 'Transcribing'
                  : listening
                  ? 'Stop dictation'
                  : 'Dictate with your voice'
              }
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                listening
                  ? 'bg-[color:var(--neon-destructive)]/15 border-[color:var(--neon-destructive)]/40 text-[color:var(--neon-destructive)]'
                  : transcribing
                  ? 'bg-[color:var(--neon-live)]/15 border-[color:var(--neon-live)]/40 text-[color:var(--neon-live)]'
                  : 'bg-brand-popover/60 hover:bg-brand-popover border-brand-border text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : transcribing ? 'animate-pulse' : ''}`} />
            </button>

            {/* Submit / Stop */}
            {isGenerating ? (
              <button
                data-testid="btn-stop"
                onClick={onStop}
                aria-label="Stop generating"
                className="bg-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/85 hover:shadow-[0_0_12px_var(--neon-destructive)] text-white rounded-full w-8 h-8 flex items-center justify-center font-bold cursor-pointer transition-all duration-150 active:scale-[0.92]"
              >
                <span className="text-[10px] leading-none">⏹</span>
              </button>
            ) : (
              <button
                data-testid="btn-send"
                onClick={handleSend}
                aria-label="Send message"
                disabled={disabled || !prompt.trim() || !hasModels}
                className={`rounded-full w-8 h-8 flex items-center justify-center transition-all duration-150 ${
                  !prompt.trim() || disabled || !hasModels
                    ? 'bg-brand-popover text-brand-textMuted/40 cursor-not-allowed border border-brand-border'
                    : 'bg-brand-highlight hover:bg-brand-highlight-hover text-brand-highlight-text cursor-pointer active:scale-[0.92] border border-brand-highlight-border-subtle'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Slash-command autocomplete popover */}
        {menuOpen && (
          <div
            data-testid="slash-menu"
            className="absolute bottom-full left-0 mb-2 ui-popover w-110 max-w-[90vw] p-1.5 z-50 max-h-80 overflow-y-auto"
          >
            <div className="ui-menu-label px-2 py-1">Slash commands &amp; tools</div>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-brand-textMuted">No matching commands</div>
            )}
            {filtered.map((s, i) => (
              <button
                key={s.name}
                type="button"
                data-testid={`slash-item-${s.name}`}
                ref={i === activeIndex ? activeItemRef : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSlash(s);
                }}
                onMouseEnter={() => setSlashIndex(i)}
                className={`ui-popover-item flex flex-col items-start gap-0.5 text-left ${i === activeIndex ? 'active' : ''}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      s.category === 'builtin'
                        ? 'bg-brand-textMuted'
                        : s.category === 'skill'
                        ? 'bg-[color:var(--neon-constructive)]'
                        : 'bg-[color:var(--neon-live)]'
                    }`}
                  />
                  <span className="font-mono text-xs font-semibold text-brand-textMain truncate">{s.label}</span>
                  {s.usage && (
                    <span className="ml-auto text-[10px] text-brand-textMuted font-mono truncate max-w-50 pl-2">
                      {s.usage}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-brand-textMuted pl-3.5 truncate w-full">{s.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Dictation indicator */}
        {listening && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[color:var(--neon-destructive)]/15 border border-[color:var(--neon-destructive)]/30 text-[color:var(--neon-destructive)] text-[10px] font-semibold animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-destructive)] animate-pulse" />
            Listening…
          </div>
        )}
        {transcribing && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[color:var(--neon-live)]/15 border border-[color:var(--neon-live)]/30 text-[color:var(--neon-live)] text-[10px] font-semibold animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            Transcribing…
          </div>
        )}
      </div>

      {/* Under-composer context row: project switcher + sandbox mode */}
      <div data-testid="composer-badges-row" className="flex gap-2 px-1 items-center flex-wrap">
        {/* Project context pill + switcher */}
        {activeProject && (
          <div className="relative">
            <button
              data-testid="badge-project"
              onClick={() => projects.length > 0 && setProjectMenuOpen((v) => !v)}
              className={`bg-brand-card border border-brand-border rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm transition-all duration-150 active:scale-[0.98] ${
                projects.length > 0 ? 'cursor-pointer hover:border-brand-border-strong hover:bg-brand-popover' : 'cursor-default'
              }`}
            >
              <Folder className="w-3 h-3 text-brand-textMuted" />
              <span className="max-w-30 truncate">{activeProject}</span>
              {projects.length > 0 && <ChevronDown className="w-2 h-2 text-brand-textMuted" />}
            </button>

            {projectMenuOpen && projects.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 ui-popover w-56 p-1.5 z-50 max-h-[50vh] overflow-y-auto">
                <div className="ui-menu-label">Switch project</div>
                {projects.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      onSelectProject?.(p.name);
                      setProjectMenuOpen(false);
                    }}
                    className={`ui-popover-item ${p.name === activeProject ? 'active' : ''}`}
                  >
                    <Folder className="w-3.5 h-3.5 text-brand-textMuted" />
                    <span className="truncate">{p.name}</span>
                    {p.name === activeProject && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sandbox / full-access toggle */}
        <button
          data-testid="badge-sandbox"
          onClick={() => onSandboxChange?.(!sandbox)}
          title={sandbox ? 'Running sandboxed — toggle for full access' : 'Full system access enabled — click to sandbox'}
          className={`rounded-full px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm border transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            sandbox
              ? 'bg-[color:var(--neon-constructive)]/10 border-[color:var(--neon-constructive)]/25 text-[color:var(--neon-constructive)] hover:bg-[color:var(--neon-constructive)]/15'
              : 'bg-[color:var(--neon-attention)]/10 border-[color:var(--neon-attention)]/25 text-[color:var(--neon-attention)] hover:bg-[color:var(--neon-attention)]/15'
          }`}
        >
          {sandbox ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
          <span>{sandbox ? 'Sandboxed' : 'Full access'}</span>
        </button>
      </div>
    </div>
  );
};
