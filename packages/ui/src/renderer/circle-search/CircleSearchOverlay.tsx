import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  CornerDownLeft,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Camera,
  Layers,
  Code2,
  FileText,
  Languages,
  RotateCcw,
  GripHorizontal,
  Monitor,
  MessageSquare,
} from 'lucide-react';
import { getIpc } from '../lib/ipc';
import { getPlatform, getKeySymbols, formatShortcut } from '../lib/platform';

const ipc = getIpc();

export type ScreenContextMode = 'region' | 'fullscreen' | 'textonly';

export const CircleSearchOverlay: React.FC = () => {
  const platform = getPlatform();
  const keys = getKeySymbols();

  const [screenImage, setScreenImage] = useState<string | null>(null);
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const omniboxInputRef = useRef<HTMLInputElement>(null);
  const floatingCardRef = useRef<HTMLDivElement>(null);

  // Capture or refresh fullscreen screen capture
  const fetchScreen = useCallback(async () => {
    if (!ipc) return;
    try {
      const dataUrl = await ipc('circle-search-get-screen-image');
      if (dataUrl) {
        setScreenImage(dataUrl);
      }
    } catch (err: any) {
      console.error('Failed to get screen capture:', err);
      setErrorMsg('Screen recording permission might be required.');
    }
  }, []);

  useEffect(() => {
    fetchScreen();

    // Listen for window show events to refresh screenshot
    const handleShow = async () => {
      setSelection(null);
      setContextMode('fullscreen');
      setQuery('');
      setAiResponse('');
      setErrorMsg('');
      setFloatingCardPos(null);
      setFollowUpQuery('');
      await fetchScreen();
      setTimeout(() => {
        omniboxInputRef.current?.focus();
      }, 80);
    };

    const cleanup = ipc('circle-search-window-shown', handleShow);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [fetchScreen]);

  // Keyboard shortcut listeners (Escape to close, Ctrl/Cmd+Shift+S to recapture)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        fetchScreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchScreen]);

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
    // Reset floating card position to auto-anchor to the new selection
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

  // ─── Image Crop Execution ──────────────────────────────────────────────────
  const getCroppedImageBase64 = async (): Promise<string> => {
    if (!selection || !screenImage || !canvasRef.current) return '';
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load screen capture'));
        img.src = screenImage;
      });

      // Calculate scale in case of high-DPI scaling
      const scaleX = img.naturalWidth / window.innerWidth;
      const scaleY = img.naturalHeight / window.innerHeight;

      const cropX = selection.x * scaleX;
      const cropY = selection.y * scaleY;
      const cropW = selection.w * scaleX;
      const cropH = selection.h * scaleY;

      canvas.width = Math.max(1, cropW);
      canvas.height = Math.max(1, cropH);

      ctx?.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.9);
    } catch (err) {
      console.warn('Error cropping image:', err);
      return '';
    }
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
        imagePayload = await getCroppedImageBase64();
      } else if (activeContext === 'fullscreen' && screenImage) {
        imagePayload = screenImage;
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
        // Simulated responsive preview for standalone dev
        setTimeout(() => {
          setAiResponse(
            `### Visual Insight (${activeContext.toUpperCase()})\n\n- **Identified Element**: ${
              activeContext === 'region'
                ? `Cropped screen region (${selection?.w || 0}x${selection?.h || 0})`
                : activeContext === 'fullscreen'
                ? 'Full Desktop View'
                : 'Pure Text Ask (Spotlight Mode)'
            }\n- **Summary**: ${
              activePrompt || 'Analysis of desktop query.'
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
      image: selection ? undefined : screenImage,
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

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full flex flex-col items-center justify-between overflow-hidden select-none bg-black/40"
      style={{
        backgroundImage: screenImage ? `url(${screenImage})` : 'none',
        backgroundSize: '100% 100%',
        cursor: selection ? 'default' : 'crosshair',
        fontFamily: platform === 'macos' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : '"Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Google Gemini Glowing Animated Border */}
      <div className="gemini-screen-border" />

      {/* Helper crop canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Floating Spotlight Omnibox Bar */}
      <div className="interactive-ui absolute top-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="w-full gemini-card-glass rounded-2xl p-2.5 flex items-center gap-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          {/* Gemini Sparkle Logo */}
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md flex-shrink-0 animate-pulse">
            <Sparkles className="w-4 h-4" />
          </div>

          {/* Search Omnibox Input */}
          <form onSubmit={handleOmniboxSubmit} className="flex-1 flex items-center gap-2">
            <input
              ref={omniboxInputRef}
              type="text"
              placeholder={
                selection
                  ? `Ask anything about circled region (${selection.w}x${selection.h})...`
                  : contextMode === 'fullscreen'
                  ? "Ask about your entire screen or type any question..."
                  : "Ask SuperAgent anything (Spotlight text mode)..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-sm text-zinc-100 placeholder-zinc-400/60 font-medium"
              autoFocus
            />

            {/* Context Mode Indicators & Selectors */}
            {selection ? (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-semibold text-indigo-300 flex-shrink-0">
                <Layers className="w-3 h-3" />
                <span>Region {selection.w}×{selection.h}</span>
                <button
                  type="button"
                  onClick={handleResetSelection}
                  className="ml-1 hover:text-white transition-colors"
                  title="Clear region (use full screen / text)"
                >
                  <X className="w-3 h-3" />
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
                  title={contextMode === 'fullscreen' ? 'Sending entire screen context (Click for Text-only)' : 'Text-only ask (Click to attach full screen)'}
                >
                  {contextMode === 'fullscreen' ? <Monitor className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                  <span>{contextMode === 'fullscreen' ? 'Full Screen' : 'Text Only'}</span>
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

          {/* Quick Screen Recapture button */}
          <button
            type="button"
            onClick={fetchScreen}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700/50 flex-shrink-0 cursor-pointer"
            title={`Recapture Screen (${formatShortcut('CommandOrControl+Shift+S')})`}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

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
            <span>Circle/drag any area for box crop, or ask about full screen / text</span>
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
          <div className="absolute left-0 top-0 bottom-0 bg-black/40 pointer-events-none z-0" style={{ width: selection.x }} />
          <div className="absolute right-0 top-0 bottom-0 bg-black/40 pointer-events-none z-0" style={{ left: selection.x + selection.w }} />
          <div className="absolute top-0 bg-black/40 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, height: selection.y }} />
          <div className="absolute bottom-0 bg-black/40 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, top: selection.y + selection.h }} />
        </>
      )}

      {/* Floating Google Gemini Reply Card */}
      {(selection || aiResponse || isLoading || errorMsg) && (
        <div
          ref={floatingCardRef}
          className="interactive-ui absolute z-30 w-[420px] max-w-[92vw] gemini-card-glass rounded-2xl flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-zinc-700/60 overflow-hidden"
          style={{
            left: `${cardPos.x}px`,
            top: `${cardPos.y}px`,
          }}
        >
          {/* Card Header (Draggable Handle) */}
          <div
            onMouseDown={startDragCard}
            className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-zinc-500" />
              <div className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 inline" />
                <span>
                  {selection
                    ? 'Google Gemini Region Crop'
                    : contextMode === 'fullscreen'
                    ? 'Google Gemini Full Screen'
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
                    ? 'Analyzing full desktop screen...'
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
