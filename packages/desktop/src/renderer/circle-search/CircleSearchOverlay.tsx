import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, CornerDownLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { getIpc } from '../lib/electron';

const ipc = getIpc();

export const CircleSearchOverlay: React.FC = () => {
  const [screenImage, setScreenImage] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [query, setQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load fullscreen screen capture on mount
  useEffect(() => {
    const fetchScreen = async () => {
      if (!ipc) return;
      try {
        const dataUrl = await ipc('circle-search-get-screen-image');
        setScreenImage(dataUrl);
      } catch (err: any) {
        console.error('Failed to get screen capture:', err);
        setErrorMsg('Screen recording permission might be required.');
      }
    };

    fetchScreen();

    // Listen for window show events to refresh screenshot
    const handleShow = async () => {
      setSelection(null);
      setQuery('');
      setAiResponse('');
      setErrorMsg('');
      try {
        const dataUrl = await ipc('circle-search-get-screen-image');
        setScreenImage(dataUrl);
      } catch (err) {
        console.error(err);
      }
    };

    ipc('circle-search-window-shown', handleShow);
    return () => {
      ipc('circle-search-window-shown', handleShow);
    };
  }, []);

  // Listen for Escape key
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
    ipc('circle-search-hide');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selection || isLoading) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(startPos.x - currentPos.x);
    const h = Math.abs(startPos.y - currentPos.y);

    // Only set selection if it's large enough (prevent accidental clicks)
    if (w > 10 && h > 10) {
      setSelection({ x, y, w, h });
    }
  };

  // Submit region + query to AI
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selection || !query.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMsg('');
    setAiResponse('');

    try {
      // 1. Crop image from selection using html canvas
      let croppedBase64 = '';
      if (screenImage && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load screen image'));
          img.src = screenImage;
        });

        canvas.width = selection.w;
        canvas.height = selection.h;

        // Draw cropped section to canvas
        ctx?.drawImage(
          img,
          selection.x,
          selection.y,
          selection.w,
          selection.h,
          0,
          0,
          selection.w,
          selection.h
        );

        croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);
      }

      // 2. Invoke main process query stream handler
      if (ipc) {
        // We will receive streaming progress back
        ipc('circle-search-submit', {
          query: query.trim(),
          image: croppedBase64,
        });

        // Set up one-time stream listeners
        const handleChunk = (_evt: any, data: { text: string; done?: boolean; error?: string }) => {
          if (data.error) {
            setErrorMsg(data.error);
            setIsLoading(false);
            cleanup();
          } else if (data.text) {
            setAiResponse((prev) => prev + data.text);
          }
          if (data.done) {
            setIsLoading(false);
            cleanup();
          }
        };

        const cleanup = () => {
          ipc('circle-search-stream-chunk', handleChunk);
        };

        ipc('circle-search-stream-chunk', handleChunk);
      } else {
        // Fallback demo mock
        setTimeout(() => {
          setAiResponse("This is a demo response from Circle-to-Search. The selection image is mapped successfully.");
          setIsLoading(false);
        }, 1500);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during query execution.');
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelection(null);
    setQuery('');
    setAiResponse('');
    setErrorMsg('');
  };

  // Selection box box outline styles
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

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundImage: screenImage ? `url(${screenImage})` : 'none',
        backgroundSize: '100% 100%',
        cursor: selection ? 'default' : 'crosshair',
      }}
    >
      {/* Background tint overlay */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none z-0" />

      {/* Helper crop canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Status banner when loading screen capture */}
      {!screenImage && (
        <div className="z-10 p-4 rounded-xl bg-brand-popover border border-brand-border flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span className="text-xs text-brand-textMuted font-medium">Initializing screenshot overlay...</span>
        </div>
      )}

      {/* Guide text overlay */}
      {screenImage && !selection && !isDrawing && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-brand-popover/80 border border-brand-border/40 backdrop-blur-md text-[11px] font-semibold text-brand-textMain flex items-center gap-2 pointer-events-none shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Draw a rectangle around anything on your desktop to search</span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-400 font-bold border border-zinc-700">ESC to close</span>
        </div>
      )}

      {/* Selection outline */}
      {(isDrawing || selection) && (
        <div
          className={`absolute border-2 border-indigo-500 rounded z-10 pointer-events-none transition-all ${
            isDrawing ? 'border-dashed' : 'pulse-ring-active'
          }`}
          style={selectionStyle}
        >
          {/* Transparent cutout region inside the overlay */}
          <div className="w-full h-full bg-transparent" />
        </div>
      )}

      {/* Darkened overlay elements to isolate selection (cutout effect) */}
      {selection && (
        <>
          <div className="absolute left-0 top-0 bottom-0 bg-black/35 pointer-events-none z-0" style={{ width: selection.x }} />
          <div className="absolute right-0 top-0 bottom-0 bg-black/35 pointer-events-none z-0" style={{ left: selection.x + selection.w }} />
          <div className="absolute top-0 bg-black/35 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, height: selection.y }} />
          <div className="absolute bottom-0 bg-black/35 pointer-events-none z-0" style={{ left: selection.x, width: selection.w, top: selection.y + selection.h }} />
        </>
      )}

      {/* Search Interaction Box & Result Card */}
      {selection && (
        <div
          className="absolute z-20 flex flex-col gap-3 w-80 animate-fade-in pointer-events-auto"
          style={{
            // Position near selection
            left: Math.min(window.innerWidth - 340, Math.max(20, selection.x + selection.w / 2 - 160)),
            top: selection.y + selection.h + 16 > window.innerHeight - 380
              ? Math.max(16, selection.y - 120) // show above if too low
              : selection.y + selection.h + 16,
          }}
        >
          {/* Query input card */}
          <div className="p-3 rounded-xl bg-brand-popover/90 border border-brand-border/80 shadow-2xl backdrop-blur-xl">
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Ask about this selection..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain placeholder-brand-textMuted/45 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="p-1.5 rounded-lg bg-brand-highlight hover:bg-brand-highlight-hover text-brand-highlight-text disabled:opacity-40 transition-colors cursor-pointer"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </form>
            
            <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-brand-border/30 text-[10px] text-brand-textMuted">
              <button
                onClick={handleReset}
                disabled={isLoading}
                className="hover:text-brand-textMain font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Reset selection
              </button>
              <button
                onClick={handleDismiss}
                disabled={isLoading}
                className="hover:text-brand-textMain font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Close search
              </button>
            </div>
          </div>

          {/* AI Response Card */}
          {(isLoading || aiResponse || errorMsg) && (
            <div className="p-4 rounded-xl bg-brand-popover/95 border border-brand-border shadow-2xl backdrop-blur-xl flex flex-col max-h-60 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3" />
                <span>AI Insight</span>
              </div>
              
              {errorMsg && (
                <div className="flex items-start gap-1.5 text-rose-400 text-xs mt-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {isLoading && !aiResponse && (
                <div className="flex items-center gap-2 text-xs text-brand-textMuted py-4">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Consulting model...</span>
                </div>
              )}

              {aiResponse && (
                <div className="text-xs text-brand-textMain leading-relaxed whitespace-pre-wrap">
                  {aiResponse}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
