import React from 'react';
import { X, FileCode, FileText, Copy, Check, ExternalLink } from 'lucide-react';
import { ArtifactItem } from '../types.js';

interface ArtifactsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  artifacts: ArtifactItem[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  onCopyText: (text: string) => void;
}

export const ArtifactsViewer: React.FC<ArtifactsViewerProps> = ({
  isOpen,
  onClose,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onCopyText
}) => {
  const [copied, setCopied] = React.useState(false);
  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId) || artifacts[0];

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!activeArtifact) return;
    onCopyText(activeArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-slate-950 border-l border-slate-800 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileCode className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-100">Artifact Inspector</h3>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Artifacts Selection Tabs */}
      {artifacts.length > 0 && (
        <div className="p-2 border-b border-slate-800 flex space-x-1.5 overflow-x-auto">
          {artifacts.map((art) => (
            <button
              key={art.id}
              onClick={() => onSelectArtifact(art.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                art.id === activeArtifact?.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {art.title}
            </button>
          ))}
        </div>
      )}

      {/* Artifact Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeArtifact ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">{activeArtifact.title}</h4>
                {activeArtifact.filepath && (
                  <span className="text-[11px] font-mono text-slate-400">{activeArtifact.filepath}</span>
                )}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {activeArtifact.content}
            </pre>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            No artifacts generated yet in this run.
          </div>
        )}
      </div>
    </div>
  );
};
