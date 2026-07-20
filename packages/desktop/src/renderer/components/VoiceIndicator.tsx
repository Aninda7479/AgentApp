import React, { useState, useEffect, useRef } from 'react';
import { Mic, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { getIpc } from '../lib/electron';

const ipc = getIpc();

export const VoiceIndicator: React.FC = () => {
  const [state, setState] = useState<'recording' | 'transcribing' | 'done' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successText, setSuccessText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!ipc) return;

    const handleVoiceEvent = async (_evt: any, data: { state: 'recording' | 'transcribing' | 'done'; text?: string; error?: string }) => {
      if (data.state === 'recording') {
        setErrorMsg('');
        setSuccessText('');
        setState('recording');
        startRecording();
      } else if (data.state === 'transcribing') {
        setState('transcribing');
        stopRecording();
      } else if (data.state === 'done') {
        if (data.error) {
          setErrorMsg(data.error);
        } else if (data.text) {
          setSuccessText(data.text);
        }
        setState('done');
        setTimeout(() => {
          setState(null);
        }, 1500);
      }
    };

    const handleInjectText = (_evt: any, text: string) => {
      // Find currently focused input/textarea inside the renderer and inject
      const activeEl = document.activeElement;
      if (activeEl && (activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement)) {
        const start = activeEl.selectionStart ?? activeEl.value.length;
        const end = activeEl.selectionEnd ?? activeEl.value.length;
        const val = activeEl.value;
        activeEl.value = val.slice(0, start) + text + val.slice(end);
        // Force React change detection
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    ipc('voice-daemon-event', handleVoiceEvent);
    ipc('voice-daemon-inject', handleInjectText);

    return () => {
      ipc('voice-daemon-event', handleVoiceEvent);
      ipc('voice-daemon-inject', handleInjectText);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // Ship bytes back to main process for Whisper transcription
        ipc.send('voice-daemon-audio-captured', { buffer: arrayBuffer });
        
        // Stop all audio track streams
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // chunk every 100ms
    } catch (err: any) {
      console.error('Failed to access microphone for voice typing:', err);
      setState('done');
      setErrorMsg('Microphone access denied');
      setTimeout(() => setState(null), 1500);
      ipc.send('voice-recording-failed', err.message || String(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  if (!state) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-brand-popover border border-brand-border shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none select-none">
      {state === 'recording' && (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--neon-live)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--neon-live)]"></span>
          </span>
          <Mic className="w-3.5 h-3.5 text-[var(--neon-live)]" />
          <span className="text-xs font-semibold text-brand-textMain">Voice Typing...</span>
        </>
      )}

      {state === 'transcribing' && (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--neon-live)]" />
          <span className="text-xs font-semibold text-brand-textMuted">Transcribing...</span>
        </>
      )}

      {state === 'done' && (
        <>
          {errorMsg ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-[var(--neon-destructive)]" />
              <span className="text-xs font-semibold text-[var(--neon-destructive)] max-w-[160px] truncate">
                {errorMsg}
              </span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--neon-constructive)]" />
              <span className="text-xs font-semibold text-[var(--neon-constructive)] max-w-[160px] truncate">
                {successText || 'Typed'}
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
};
