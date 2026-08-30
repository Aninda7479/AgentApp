import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  CornerDownLeft,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Code2,
  FileText,
  Languages,
  RotateCcw,
  GripHorizontal,
  Monitor,
  MessageSquare,
  Camera,
} from 'lucide-react';
import { getIpc } from '../lib/ipc';
import { getPlatform, getKeySymbols, formatShortcut } from '../lib/platform';

const ipc = getIpc();

export type ScreenContextMode = 'region' | 'fullscreen' | 'textonly';

export const CircleSearchOverlay: React.FC = () => {
  const platform = getPlatform();
  const keys = getKeySymbols();

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [contextMode, setContextMode] = useState<ScreenContextMode>('fullscreen');
  const [query, setQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [followUpQuery, setFollowUpQuery] = useState('');

  // Floating card drag position (null means auto-anchored near selection)
  const [floatingCardPos, setFloatingCardPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; cardX: number; cardY: number }>({ mouseX: 0, mouseY: 0, cardX: 0, cardY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const omniboxInputRef = useRef<HTMLInputElement>(null);
  const floatingCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for window show events to reset state & focus input
    const handleShow = () => {
      setSelection(null);
      setContextMode('fullscreen');
      setQuery('');
      setAiResponse('');
      setErrorMsg('');
      setFloatingCardPos(null);
      setFollowUpQuery('');
      setTimeout(() => {
        omniboxInputRef.current?.focus();
      }, 80);
    };

    const cleanup = ipc('circle-search-window-shown', handleShow);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  // Keyboard shortcut listeners (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDismiss = () => {
    if (ipc?.send) {
      ipc.send('circle-search-hide');
    }
  };

  // ─── Drawing / Selection Handling ──────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking inside floating UI or dragging, ignore
    if ((e.target as HTMLElement).closest('.interactive-ui')) return;
    if (isLoading) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
    setFloatingCardPos(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCard && floatingCardPos) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setFloatingCardPos({
        x: Math.max(10, Math.min(window.innerWidth - 380, dragStartRef.current.cardX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 200, dragStartRef.current.cardY + dy)),
      });
      return;
    }

    if (!isDrawing) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (isDraggingCard) {
      setIsDraggingCard(false);
      return;
    }
    if (!isDrawing) return;
    setIsDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(startPos.x - currentPos.x);
    const h = Math.abs(startPos.y - currentPos.y);

    // Only set selection if it's large enough (prevent accidental clicks)
    if (w > 12 && h > 12) {
      setSelection({ x, y, w, h });
      setContextMode('region');
      setTimeout(() => {
        omniboxInputRef.current?.focus();
      }, 50);
    }
  };

  // ─── Draggable Card Logic ──────────────────────────────────────────────────
  const startDragCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingCard(true);
    const current = floatingCardPos || getComputedCardPos();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardX: current.x,
      cardY: current.y,
    };
  };

  const getComputedCardPos = () => {
    if (floatingCardPos) return floatingCardPos;
    if (!selection) {
      return {
        x: Math.max(20, (window.innerWidth - 420) / 2),
        y: 110,
      };
    }

    const cardWidth = 420;
    const cardHeight = 360;
    let x = selection.x + selection.w + 20;
    let y = selection.y;

    // Flip to left if overflowing right edge
    if (x + cardWidth > window.innerWidth - 20) {
      x = Math.max(20, selection.x - cardWidth - 20);
    }
    // Adjust y if overflowing bottom edge
    if (y + cardHeight > window.innerHeight - 20) {
      y = Math.max(20, window.innerHeight - cardHeight - 20);
    }

    return { x, y };
  };

  // ─── AI Query Submission ───────────────────────────────────────────────────
  const executeQuery = async (customPrompt?: string, mode: string = 'general', forcedContext?: ScreenContextMode) => {
    const activePrompt = (customPrompt !== undefined ? customPrompt : query).trim();
    if (isLoading) return;

    const activeContext = forcedContext || (selection ? 'region' : contextMode);

    setIsLoading(true);
    setErrorMsg('');
    if (!customPrompt) {
      setAiResponse('');
    }

    try {
      let imagePayload: string | undefined = undefined;

      if (activeContext === 'region' && selection) {
        if (ipc?.invoke) {
          try {
            imagePayload = await ipc.invoke('circle-search-capture-area', {
              x: Math.round(selection.x),
              y: Math.round(selection.y),
              width: Math.round(selection.w),
              height: Math.round(selection.h),
              screenWidth: window.innerWidth,
              screenHeight: window.innerHeight,
            });
          } catch (e) {
            console.warn('Native area capture fallback:', e);
          }
        }
      } else if (activeContext === 'fullscreen') {
        if (ipc?.invoke) {
          try {
            imagePayload = await ipc.invoke('circle-search-capture-area', {
              screenWidth: window.innerWidth,
              screenHeight: window.innerHeight,
            });
          } catch (e) {
            console.warn('Native full capture fallback:', e);
          }
        }
      } else {
        // textonly: no image payload sent
        imagePayload = undefined;
      }

      if (ipc?.invoke) {
        const response = await ipc.invoke('circle-search-analyze', {
          prompt: activePrompt,
          image: imagePayload,
          mode,
          contextMode: activeContext,
        });

        if (response && response.text) {
          setAiResponse(response.text);
        } else if (typeof response === 'string') {
          setAiResponse(response);
        } else {
          setAiResponse('Insight synthesized successfully.');
        }
      } else {
        // Simulated responsive preview for dev
        setTimeout(() => {
          setAiResponse(
            `### Visual Insight (${activeContext.toUpperCase()})\n\n- **Target Area**: ${
              activeContext === 'region'
                ? `Circled desktop region (${selection?.w || 0}×${selection?.h || 0})`
                : activeContext === 'fullscreen'
                ? 'Active Screen'
                : 'Spotlight Text Mode'
            }\n- **Summary**: ${
              activePrompt || 'Analysis of live screen content.'
            }\n\n\`\`\`json\n{\n  "status": "success",\n  "contextMode": "${activeContext}",\n  "hasImage": ${Boolean(
              imagePayload
            )},\n  "platform": "${platform}"\n}\n\`\`\``
          );
          setIsLoading(false);
        }, 800);
        return;
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error communicating with visual intelligence engine.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOmniboxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery();
  };

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpQuery.trim()) return;
    const combined = `${query ? query + ' — ' : ''}Follow-up: ${followUpQuery.trim()}`;
    setQuery(combined);
    setFollowUpQuery('');
    executeQuery(combined);
  };

  const handleQuickAction = (mode: string, defaultText: string) => {
    setQuery(defaultText);
    executeQuery(defaultText, mode);
  };

  const handleResetSelection = () => {
    setSelection(null);
    setContextMode('fullscreen');
  };

  const handleClearAll = () => {
    setSelection(null);
    setContextMode('fullscreen');
    setQuery('');
    setAiResponse('');
    setErrorMsg('');
    setFloatingCardPos(null);
    setFollowUpQuery('');
  };

  const handleCopyResponse = () => {
    if (!aiResponse) return;
    navigator.clipboard.writeText(aiResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleOpenInMainChat = () => {
    if (!ipc?.send) return;
    ipc.send('open-chat-with-prompt', {
      prompt: query || 'Analyze circled screen snippet',
    });
    handleDismiss();
  };

  // Selection box outline styles
  const selectionStyle = selection
    ? {
        left: selection.x,
        top: selection.y,
        width: selection.w,
        height: selection.h,
      }
    : {
        left: Math.min(startPos.x, currentPos.x),
        top: Math.min(startPos.y, currentPos.y),
        width: Math.abs(startPos.x - currentPos.x),
        height: Math.abs(startPos.y - currentPos.y),
      };

  const cardPos = getComputedCardPos();

  const handleCopyCircledImage = async () => {
    try {
      if (!selection) return;
      let b64: string | undefined;
      if (ipc?.invoke) {
        b64 = await ipc.invoke('circle-search-capture-area', {
          x: Math.round(selection.x),
          y: Math.round(selection.y),
          width: Math.round(selection.w),
          height: Math.round(selection.h),
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
        });
      }
      if (!b64) return;

      let mimeType = 'image/png';
      let pureB64 = b64;
      if (b64.startsWith('data:')) {
        const match = b64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          pureB64 = match[2];
        }
      }

      // Direct binary Uint8Array decode -> Blob (instant, lossless, 100% valid image)
      const binaryString = atob(pureB64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });

      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error('Failed to copy image to clipboard:', e);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full flex flex-col items-center justify-between overflow-hidden select-none bg-transparent"
      style={{
        cursor: selection ? 'default' : 'crosshair',
        fontFamily: platform === 'macos' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : '"Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Floating Spotlight Omnibox Bar */}
      <div className="interactive-ui absolute top-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2.5 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="w-full gemini-card-glass rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
          {/* Header Row */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#4285f4] text-white font-bold text-xs shadow-sm">
                G
              </div>
              <span className="text-xs font-semibold text-zinc-100">Google app</span>
              <span className="text-[11px] font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">Alt + Space</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-red-500/80 border border-white/20" />
              <button
                type="button"
                onClick={handleDismiss}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Omnibox Input Row */}
          <form onSubmit={handleOmniboxSubmit} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10">
            <input
              ref={omniboxInputRef}
              type="text"
              placeholder="Ask anything"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-sm text-zinc-100 placeholder-zinc-400/60 font-medium"
              autoFocus
            />

            {/* Selection actions */}
            {selection ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCircledImage}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer"
                  title="Copy circled area as image to clipboard"
                >
                  <Camera className="w-3 h-3 text-sky-400" />
                  <span>{copied ? '✓ Copied' : 'Copy Image'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setContextMode(contextMode === 'fullscreen' ? 'textonly' : 'fullscreen')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    contextMode === 'fullscreen'
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={contextMode === 'fullscreen' ? 'Live screen context attached' : 'Text-only ask'}
                >
                  {contextMode === 'fullscreen' ? <Monitor className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                  <span>{contextMode === 'fullscreen' ? 'Live Screen' : 'Text Only'}</span>
                </button>
              </div>
            )}

            {/* Submit Arrow */}
            <button
              type="submit"
              disabled={isLoading || (!query.trim() && !selection && contextMode === 'textonly')}
              className="p-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-900 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer shadow flex-shrink-0"
              title="Execute Search (Enter)"
            >
              {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
            </button>
          </form>

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700/50 flex-shrink-0 cursor-pointer"
            title="Close Circle Search (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Lens / Action Chips */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center text-[11px]">
          <button
            type="button"
            onClick={() => handleQuickAction('explain', selection ? 'Explain what is shown in this selection' : 'Explain what is currently visible on my screen')}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-indigo-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Explain {selection ? 'Selection' : 'Screen'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction('summarize', selection ? 'Summarize key information in this selection' : 'Summarize the contents of my screen')}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-purple-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <FileText className="w-3 h-3 text-purple-400" />
            <span>Summarize</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction('code', selection ? 'Explain or solve this code' : 'Find and analyze code on my screen')}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-cyan-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Code2 className="w-3 h-3 text-cyan-400" />
            <span>Solve Code</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction('ocr', 'Extract and transcribe all text with exact formatting')}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-emerald-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Copy className="w-3 h-3 text-emerald-400" />
            <span>Copy Text (OCR)</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction('translate', 'Translate visible text to English')}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-pink-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Languages className="w-3 h-3 text-pink-400" />
            <span>Translate</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMode('textonly');
              setSelection(null);
              omniboxInputRef.current?.focus();
            }}
            className="px-3 py-1 rounded-full gemini-card-glass text-zinc-300 hover:text-white hover:border-amber-400/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <MessageSquare className="w-3 h-3 text-amber-400" />
            <span>Just Text Ask</span>
          </button>
        </div>
      </div>

      {/* Guide hint at bottom */}
      {!selection && !isDrawing && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full gemini-card-glass text-xs font-medium text-zinc-300 flex items-center gap-3 pointer-events-none shadow-lg animate-fade-in">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Circle or drag around anything on your screen to search</span>
          </div>
          <div className="h-3 w-px bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-300">
              {platform === 'macos' ? '⌘ + ⇧ + S' : 'Ctrl + Shift + S'}
            </kbd>
            <span>Circle Search</span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-300 ml-1">
              Esc
            </kbd>
            <span>Close</span>
          </div>
        </div>
      )}

      {/* Selection outline */}
      {(isDrawing || selection) && (
        <div
          className={`absolute rounded-xl z-10 pointer-events-none transition-all ${
            isDrawing ? 'border-2 border-dashed border-indigo-400' : 'gemini-selection-outline'
          }`}
          style={selectionStyle}
        >
          <div className="w-full h-full bg-transparent" />
        </div>
      )}

      {/* Darkened mask around selection */}
      {selection && (
        <>
          <div className="absolute left-0 top-0 bottom-0 bg-black/45 pointer-events-none z-0" style={{ width: selection.x }} />
          <div className="absolute right-0 top-0 bottom-0 bg-black/45 pointer-events-none z-0" style={{ left: selection.x + selection.w }} />
          <div className="absolute top-0 bg-black/45 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, height: selection.y }} />
          <div className="absolute bottom-0 bg-black/45 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, top: selection.y + selection.h }} />
        </>
      )}

      {/* Floating Insight Reply Card */}
      {(selection || aiResponse || isLoading || errorMsg) && (
        <div
          ref={floatingCardRef}
          className="interactive-ui absolute z-30 w-[440px] max-w-[92vw] gemini-card-glass rounded-2xl flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
          style={{
            left: `${cardPos.x}px`,
            top: `${cardPos.y}px`,
          }}
        >
          {/* Card Header (Draggable Handle) */}
          <div
            onMouseDown={startDragCard}
            className="flex items-center justify-between px-4 py-3 bg-white/[0.04] border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-zinc-400" />
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-zinc-200 inline" />
                <span>
                  {selection
                    ? 'Visual Intelligence Region Crop'
                    : contextMode === 'fullscreen'
                    ? 'Visual Intelligence Screen Lens'
                    : 'SuperAgent Spotlight'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {aiResponse && (
                <button
                  type="button"
                  onClick={handleCopyResponse}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy full answer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenInMainChat}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Open in SuperAgent Chat Workspace"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Reset selection & response"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card Content Area */}
          <div className="p-4 max-h-72 overflow-y-auto custom-scrollbar text-xs text-zinc-200 space-y-2.5">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {isLoading && !aiResponse && (
              <div className="flex flex-col items-center justify-center py-6 gap-2.5 text-zinc-400">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-xs font-medium">
                  {selection
                    ? 'Analyzing circled region with Gemini...'
                    : contextMode === 'fullscreen'
                    ? 'Analyzing live screen content...'
                    : 'Querying SuperAgent assistant...'}
                </span>
              </div>
            )}

            {aiResponse && (
              <div className="leading-relaxed whitespace-pre-wrap font-sans space-y-2 text-zinc-200">
                {aiResponse}
              </div>
            )}

            {!isLoading && !aiResponse && !errorMsg && (
              <div className="text-center py-4 text-zinc-400">
                <span>
                  {selection
                    ? `Region (${selection.w}×${selection.h}) is active. Click a quick action chip or ask a question.`
                    : 'Click an action chip above or type your question.'}
                </span>
              </div>
            )}
          </div>

          {/* Follow-up Interactive Bar */}
          <div className="p-2.5 bg-zinc-900/40 border-t border-zinc-800/80">
            <form onSubmit={handleFollowUpSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Ask follow-up question..."
                value={followUpQuery}
                onChange={(e) => setFollowUpQuery(e.target.value)}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isLoading || !followUpQuery.trim()}
                className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Send follow-up"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
