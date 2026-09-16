import React, { useState, KeyboardEvent, useEffect, useRef, useMemo } from 'react';
import { Select } from '../../components/ui';
import { getIpc } from '../../lib/ipc';
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
  X,
  Sparkles,
  Wrench,
  Terminal,
  Search,
  Zap,
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


/** A skill or tool selected via the slash menu, displayed as a chip. */
export interface SelectedTool {
  id: string;
  name: string;
  category: 'skill' | 'builtin' | 'mcp';
}

/** Options returned by the Composer when a prompt is submitted. */
export interface ComposerOptions {
  model: string;
  mode: 'auto' | 'plan' | 'bypass';
  attachments: string[];
  selectedTools?: SelectedTool[];
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
  placeholder?: string;
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
  /** Invoked when the environment lacks the Web Speech API. */
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
  availableModels = [],
  emptyStateMessage,
  defaultModel = '',
  placeholder,
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
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const approvalDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelSearchInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      const target = evt.target as Node;
      if (approvalDropdownRef.current && !approvalDropdownRef.current.contains(target)) {
        setShowApprovalDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) {
        setShowModelDropdown(false);
        setModelSearchQuery('');
      }
    };
    if (showApprovalDropdown || showModelDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showApprovalDropdown, showModelDropdown]);

  useEffect(() => {
    if (showModelDropdown) {
      requestAnimationFrame(() => {
        modelSearchInputRef.current?.focus();
      });
    } else {
      setModelSearchQuery('');
    }
  }, [showModelDropdown]);


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
  const [workspaceVoiceEnabled, setWorkspaceVoiceEnabled] = useState<boolean>(true);

  const ipcRenderer = getIpc();

  // Resolve which engine the mic should use, whether workspace voice is enabled, and whether a cloud model is ready.
  useEffect(() => {
    if (!ipcRenderer) return;
    let active = true;

    const applyVoiceSettings = (settings: any) => {
      if (!active) return;
      const voice = settings?.voice || {};
      const tTarget = voice.typingTarget;
      const tEnabled = voice.typingEnabled;
      
      let enabled = true;
      if (tTarget !== undefined) {
        enabled = tTarget === 'both' || tTarget === 'composer';
      } else if (tEnabled !== undefined) {
        enabled = Boolean(tEnabled);
      } else {
        enabled = true;
      }

      setWorkspaceVoiceEnabled(enabled);
      setVoiceEngine(
        voice.engine === 'browser' || voice.engine === 'model' || voice.engine === 'local'
          ? voice.engine
          : 'auto'
      );
      setLocalWhisperEnabled(Boolean(voice.localWhisper?.enabled));
      const providers = settings?.providers || [];
      const provider = providers.find((p: any) => p.id === voice.providerId) || providers.find((p: any) => p.apiKey);
      setVoiceModelAvailable(Boolean(provider?.apiKey));
    };

    ipcRenderer.invoke('settings-read').then(applyVoiceSettings).catch(() => { /* leave defaults */ });

    const onSettingsChanged = (_e: any, settings: any) => {
      applyVoiceSettings(settings);
    };
    ipcRenderer.on('settings-changed', onSettingsChanged);

    return () => {
      active = false;
      ipcRenderer.removeListener('settings-changed', onSettingsChanged);
    };
  }, [ipcRenderer]);

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

  // ── Selected tools/skills (shown as chips above textarea) ──────────────────
  const [selectedTools, setSelectedTools] = useState<SelectedTool[]>([]);

  const addSelectedTool = (s: SlashSuggestion) => {
    const tool: SelectedTool = { id: s.name, name: s.label, category: s.category };
    setSelectedTools(prev => {
      if (prev.some(t => t.id === tool.id)) return prev;
      return [...prev, tool];
    });
  };

  const removeSelectedTool = (id: string) => {
    setSelectedTools(prev => prev.filter(t => t.id !== id));
  };

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

  /** Insert a selected suggestion at the caret, or add as a chip for skills/MCP tools. */
  const acceptSlash = (item: SlashSuggestion) => {
    // For skills and MCP tools, add as a visual chip instead of text insertion
    if (item.category === 'skill' || item.category === 'mcp') {
      addSelectedTool(item);
      setSlashStart(null);
      setSlashQuery('');
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // For builtin commands, insert the text at caret
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      if (onAttachPastedFiles) {
        onAttachPastedFiles(e.dataTransfer.files);
      }
    }
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

  const handleRightClickPaste = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, select, option, input:not([type="text"]):not([type="password"])')) {
      return;
    }

    e.preventDefault();
    navigator.clipboard.readText().then((clipText) => {
      if (!clipText) return;

      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const text = textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        const newText = before + clipText + after;

        setPrompt(newText);

        // Focus and set cursor position after paste
        const newCursorPos = start + clipText.length;
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        });
      } else {
        setPrompt(prompt + clipText);
      }
    }).catch((err) => {
      console.error('Failed to read clipboard text on right click:', err);
    });
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
    onSend(toSend, ComposerService.buildSendOptions(selectedModel, approvalMode, [], selectedTools));
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
      onContextMenu={handleRightClickPaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="px-4 pt-2 pb-4 max-w-235 w-full mx-auto flex flex-col gap-2 box-border relative z-10 shrink-0"
    >
      {/* The main input composer capsule */}
      <div className={`relative w-full flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl sm:rounded-[22px] border transition-all duration-200 shadow-lg ${
        isDraggingOver
          ? 'bg-cyan-950/40 border-cyan-500/80 ring-2 ring-cyan-500/30'
          : 'bg-[#1e1f23]/95 dark:bg-[#1f2024]/95 border-white/10 dark:border-white/10 focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/10'
      }`}>
        {isDraggingOver && (
          <div className="flex items-center justify-center py-2 text-cyan-400 text-xs font-semibold animate-pulse select-none">
            Drop images or files here to attach
          </div>
        )}

        {/* Selected Skills/Tools Chips */}
        {selectedTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1 pb-1.5 border-b border-white/10 select-none animate-fade-in">
            {selectedTools.map(tool => (
              <span
                key={tool.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                  tool.category === 'skill'
                    ? 'bg-[color:var(--neon-constructive)]/10 border-[color:var(--neon-constructive)]/25 text-[color:var(--neon-constructive)]'
                    : 'bg-[color:var(--neon-live)]/10 border-[color:var(--neon-live)]/25 text-[color:var(--neon-live)]'
                }`}
              >
                {tool.category === 'skill' ? (
                  <Sparkles className="w-2.5 h-2.5" />
                ) : tool.category === 'mcp' ? (
                  <Wrench className="w-2.5 h-2.5" />
                ) : (
                  <Terminal className="w-2.5 h-2.5" />
                )}
                <span>{tool.name}</span>
                <button
                  type="button"
                  onClick={() => removeSelectedTool(tool.id)}
                  className="ml-0.5 hover:opacity-70 transition-opacity cursor-pointer"
                  aria-label={`Remove ${tool.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Composer Attachments Queue Row */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1 pb-2 border-b border-white/10 select-none">
            {attachments.map((file, idx) => {
              const isImage =
                file.filename.match(/\.(png|jpe?g|webp|gif|svg)$/i) ||
                (file.sourcePath && file.sourcePath.startsWith('data:image/'));

              return (
                <div key={idx} className="flex items-center gap-1.5 bg-black/40 hover:bg-black/60 border border-white/10 px-2.5 py-1 rounded-xl text-xs text-white animate-fade-in group transition-colors">
                  {isImage && file.sourcePath ? (
                    <img
                      src={file.sourcePath}
                      alt={file.filename}
                      className="w-4 h-4 object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-neutral-400 text-[10px]">📎</span>
                  )}
                  <span className="truncate max-w-35 font-medium font-sans">{file.filename}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment && onRemoveAttachment(idx)}
                    className="text-neutral-400 hover:text-white font-bold ml-1 rounded hover:bg-white/10 w-4 h-4 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={`Remove ${file.filename}`}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 1: Text Bar (Most Left: Plus icon button, Center: Auto-growing Textarea, Most Right: Mic & Rounded Arrow Send) */}
        <div className="flex items-end gap-1.5 sm:gap-2 relative">
          {/* On the most left: Plus / attach button */}
          <button
            type="button"
            data-testid="composer-attach-btn"
            onClick={() => onAttachClick?.()}
            aria-label="Attach file"
            title="Attach file"
            className="shrink-0 w-8 h-8 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center mb-0.5"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Auto-growing Textarea */}
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
            placeholder={placeholder || (hasModels ? "Ask anything — or type / for skills, commands & tools" : (emptyStateMessage || "No models are connected yet. Please go to Settings to connect a provider."))}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-white text-sm sm:text-base resize-none w-full min-h-[36px] max-h-[180px] leading-relaxed placeholder:text-neutral-500 font-sans disabled:opacity-50 py-1.5 px-1 scrollbar-thin scrollbar-thumb-neutral-700"
          />

          {/* On the most right: Mic and Enter (Rounded arrow) button */}
          <div className="flex items-center gap-1 shrink-0 mb-0.5">
            {/* Mic / voice dictation */}
            {workspaceVoiceEnabled && (
              <button
                type="button"
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  listening
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                    : transcribing
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse'
                    : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            {/* Submit / Stop (Rounded arrow button) */}
            {isGenerating ? (
              <button
                type="button"
                data-testid="btn-stop"
                onClick={onStop}
                aria-label="Stop generating"
                className="bg-rose-600 hover:bg-rose-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold cursor-pointer transition-all duration-150 active:scale-95 shadow-md"
              >
                <span className="text-[10px] leading-none">⏹</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-send"
                onClick={handleSend}
                aria-label="Send message"
                title="Send (Enter)"
                disabled={disabled || !prompt.trim() || !hasModels}
                className={`rounded-full w-8 h-8 flex items-center justify-center transition-all duration-150 active:scale-95 ${
                  !prompt.trim() || disabled || !hasModels
                    ? 'bg-white/5 text-neutral-500 cursor-not-allowed border border-white/5'
                    : 'bg-white text-black hover:bg-neutral-200 shadow-md cursor-pointer'
                }`}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {selectedIsRouter && (
          <div
            data-testid="composer-router-hint"
            className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 leading-none"
          >
            <Info className="w-3 h-3 shrink-0 text-neutral-500" />
            <span>
              auto-routing: active across available models
            </span>
          </div>
        )}
      </div>

      {/* Row 2: Under the text box - Model Select and Permission Mode Level */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 px-2 pt-0.5 text-xs select-none">
        {/* Model Select Button */}
          <div className="relative inline-block" ref={modelDropdownRef}>
            <button
              type="button"
              data-testid="model-select-btn"
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors select-none cursor-pointer ${
                showModelDropdown
                  ? 'bg-white/10 text-white'
                  : 'text-white hover:bg-white/10'
              }`}
              title={`Model: ${selectedModel === AUTO_ROUTE_MODEL ? AUTO_ROUTE_LABEL : (selectedModel || (hasModels ? 'Select model...' : (emptyStateMessage || 'No models connected')))}`}
              aria-label={`Select model, currently ${selectedModel || 'none'}`}
            >
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                {selectedModel === AUTO_ROUTE_MODEL
                  ? AUTO_ROUTE_LABEL
                  : (selectedModel || (hasModels ? 'Select model...' : (emptyStateMessage || 'No models connected')))}
              </span>
            </button>

            {showModelDropdown && (
              <div
                className="absolute bottom-full right-0 mb-2 w-72 max-h-80 flex flex-col bg-[#1f2024]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {/* Search Input Box */}
                <div className="p-2 border-b border-white/10 shrink-0 bg-[#1f2024]/50">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 focus-within:border-white/20 text-xs">
                    <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <input
                      ref={modelSearchInputRef}
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowModelDropdown(false);
                          setModelSearchQuery('');
                        }
                      }}
                      placeholder="Search models..."
                      className="w-full bg-transparent text-xs text-white placeholder:text-neutral-500 focus:outline-none"
                    />
                    {modelSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setModelSearchQuery('')}
                        className="text-neutral-400 hover:text-white p-0.5 rounded cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Model List */}
                <div className="overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-neutral-700 flex-1">
                  {filteredAvailableModels.length === 0 ? (
                    <div className="p-3 text-center text-xs text-neutral-400">
                      {modelSearchQuery ? `No models found matching "${modelSearchQuery}"` : (emptyStateMessage || 'No models connected')}
                    </div>
                  ) : (
                    filteredAvailableModels.map((model) => {
                      const isSelected = selectedModel === model;
                      const isAuto = model === AUTO_ROUTE_MODEL;
                      return (
                        <div
                          key={model}
                          onClick={() => {
                            setSelectedModel(model);
                            onModelChange?.(model);
                            setShowModelDropdown(false);
                            setModelSearchQuery('');
                          }}
                          className={`flex items-center justify-between p-2 rounded-xl hover:bg-white/5 cursor-pointer text-xs transition-colors ${
                            isSelected ? 'text-white font-semibold bg-white/10' : 'text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isAuto ? (
                              <Workflow className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            ) : (
                              <Cpu className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="truncate text-xs font-medium text-white">
                                {isAuto ? AUTO_ROUTE_LABEL : model}
                              </div>
                              {isAuto && (
                                <div className="text-[10px] text-neutral-400 truncate">
                                  Auto-routes to best model
                                </div>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Permission mode Level Button */}
          <div className="relative inline-block" ref={approvalDropdownRef}>
            <button
              type="button"
              data-testid="approval-dropdown-btn"
              onClick={() => setShowApprovalDropdown(!showApprovalDropdown)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors select-none cursor-pointer ${
                showApprovalDropdown
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title={`Permission Mode: ${getApprovalLabel()}`}
              aria-label={`Permission Mode: ${getApprovalLabel()}`}
            >
              <span>{getApprovalLabel()}</span>
            </button>

            {showApprovalDropdown && (
              <div
                data-testid="approval-dropdown-menu"
                className="absolute bottom-full right-0 mb-2 w-72 bg-[#1f2024]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1.5 text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                  Permission Level
                </div>
                <button
                  type="button"
                  data-testid="approval-option-ask"
                  onClick={() => {
                    setApprovalMode('ask');
                    setShowApprovalDropdown(false);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                    approvalMode === 'ask' ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-white">Ask for approval</div>
                    <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                      Confirm commands and file edits before execution.
                    </div>
                  </div>
                  {approvalMode === 'ask' && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 ml-1" />}
                </button>

                <button
                  type="button"
                  data-testid="approval-option-always"
                  onClick={() => {
                    setApprovalMode('always');
                    setShowApprovalDropdown(false);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                    approvalMode === 'always' ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-white">Always approve</div>
                    <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                      Execute actions autonomously without interruption.
                    </div>
                  </div>
                  {approvalMode === 'always' && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 ml-1" />}
                </button>

                <button
                  type="button"
                  data-testid="approval-option-never"
                  onClick={() => {
                    setApprovalMode('never');
                    setShowApprovalDropdown(false);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-colors ${
                    approvalMode === 'never' ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-white">Never approve</div>
                    <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                      Read-only safety mode; block all execution requests.
                    </div>
                  </div>
                  {approvalMode === 'never' && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 ml-1" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Slash-command autocomplete popover */}
        {menuOpen && (
          <div
            data-testid="slash-menu"
            className="absolute bottom-full left-0 mb-2 ui-popover w-110 max-w-[90vw] p-1.5 z-50 max-h-80 overflow-y-auto"
          >
            <div className="ui-menu-label px-2 py-1">Commands, Skills &amp; Tools</div>
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
                  {s.category === 'skill' && (
                    <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)] border border-[color:var(--neon-constructive)]/20 flex-shrink-0">
                      SKILL
                    </span>
                  )}
                  {s.category === 'mcp' && (
                    <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[color:var(--neon-live)]/10 text-[color:var(--neon-live)] border border-[color:var(--neon-live)]/20 flex-shrink-0">
                      TOOL
                    </span>
                  )}
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

      {/* Under-composer context row: project switcher + sandbox mode */}
      <div data-testid="composer-badges-row" className="flex gap-2 px-1 items-center flex-wrap">
        {/* Project context pill + switcher */}
        <div className="relative">
          <button
            data-testid="badge-project"
            onClick={() => projects.length > 0 && setProjectMenuOpen((v) => !v)}
            className={`bg-brand-card border border-brand-border rounded-full text-brand-textMain px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1 select-none shadow-sm transition-all duration-150 active:scale-[0.98] ${
              projects.length > 0 ? 'cursor-pointer hover:border-brand-border-strong hover:bg-brand-popover' : 'cursor-default'
            }`}
          >
            <Folder className="w-3 h-3 text-brand-textMuted" />
            <span className="max-w-30 truncate">{activeProject || 'No Project'}</span>
            {projects.length > 0 && <ChevronDown className="w-2 h-2 text-brand-textMuted" />}
          </button>

          {projectMenuOpen && projects.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 ui-popover w-56 p-1.5 z-50 max-h-[50vh] overflow-y-auto">
              <div className="ui-menu-label">Switch project</div>
              <button
                onClick={() => {
                  onSelectProject?.('');
                  setProjectMenuOpen(false);
                }}
                className={`ui-popover-item ${!activeProject ? 'active' : ''}`}
              >
                <Folder className="w-3.5 h-3.5 text-brand-textMuted" />
                <span className="truncate">No Project</span>
                {!activeProject && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
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
