import React from 'react';
import { Eye } from 'lucide-react';

interface FileChangedChipProps {
  count: number;
  added: number;
  removed: number;
  onReview?: () => void;
}

export const FileChangedChip: React.FC<FileChangedChipProps> = ({
  count,
  added,
  removed,
  onReview,
}) => {
  return (
    <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] text-sm shadow-sm">
      <span className="font-medium text-[color:var(--brand-text-main)]">
        {count} file{count !== 1 ? 's' : ''} changed
      </span>
      <div className="flex items-center gap-1.5 text-xs font-mono font-medium">
        <span className="text-[color:var(--neon-constructive)]">+{added}</span>
        <span className="text-[color:var(--neon-destructive)]">-{removed}</span>
      </div>
      {onReview && (
        <>
          <div className="w-[1px] h-4 bg-[color:var(--brand-border)] mx-1" />
          <button
            onClick={onReview}
            className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors focus:outline-none"
          >
            <Eye size={14} />
            Review
          </button>
        </>
      )}
    </div>
  );
};
