import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface WorkedHeaderProps {
  duration: string;
  filesExplored?: number;
  foldersExplored?: number;
  editedFiles?: Array<{ name: string; added: number; removed: number }>;
  children?: React.ReactNode;
  initialExpanded?: boolean;
  isWorking?: boolean;
}

export const WorkedHeader: React.FC<WorkedHeaderProps> = ({
  duration,
  filesExplored = 0,
  foldersExplored = 0,
  editedFiles = [],
  children,
  initialExpanded = false,
  isWorking = false,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  useEffect(() => {
    if (isWorking) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [isWorking]);

  return (
    <div className="flex flex-col mb-4">
      <div
        className="flex items-center gap-2 cursor-pointer text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-sm font-medium flex items-center gap-2">
          {isWorking ? (
            <>
              Thinking... ({duration})
              <span className="w-2 h-2 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            </>
          ) : (
            <span className="italic">Thought for {duration}</span>
          )}
        </span>
      </div>

      {expanded && (
        <div className="ml-2 pl-4 mt-2 border-l border-dashed border-[color:var(--brand-border)] flex flex-col gap-3">
          {(filesExplored > 0 || foldersExplored > 0) && (
            <div className="text-xs text-[color:var(--brand-text-muted)] bg-[color:var(--brand-card)] inline-flex px-2 py-1 rounded-md border border-[color:var(--brand-border)] w-fit">
              Explored {filesExplored} files, {foldersExplored} folders
            </div>
          )}

          {editedFiles.length > 0 && (
            <div className="flex flex-col gap-1">
              {editedFiles.map((file, i) => (
                <div key={i} className="text-xs flex items-center gap-2 font-mono">
                  <span className="text-[color:var(--brand-text-muted)]">M</span>
                  <span className="text-[color:var(--brand-text-main)]">{file.name}</span>
                  <span className="text-[color:var(--neon-constructive)]">+{file.added}</span>
                  <span className="text-[color:var(--neon-destructive)]">-{file.removed}</span>
                </div>
              ))}
            </div>
          )}

          {children && (
            <div className="flex flex-col gap-2 mt-2">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
