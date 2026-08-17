import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface TrajectoryIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  tooltip?: string;
  danger?: boolean;
}

export const TrajectoryIconButton: React.FC<TrajectoryIconButtonProps> = ({ 
  icon: Icon, 
  tooltip, 
  danger, 
  className = '', 
  ...props 
}) => {
  return (
    <button
      title={tooltip}
      className={`p-1.5 rounded-md transition-colors flex items-center justify-center
        ${danger 
          ? 'text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10' 
          : 'text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] hover:bg-[color:var(--brand-card)]'
        } ${className}`}
      {...props}
    >
      <Icon size={14} />
    </button>
  );
};

export interface CopyUserButtonProps {
  content: string;
}

export const CopyUserButton: React.FC<CopyUserButtonProps> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <TrajectoryIconButton
      icon={copied ? Check : Copy}
      onClick={handleCopy}
      tooltip="Copy"
      className={copied ? 'text-[color:var(--neon-constructive)]' : ''}
    />
  );
};

export interface MessageActionsProps {
  content: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({ content }) => {
  return (
    <div className="flex items-center gap-1 mt-2">
      <CopyUserButton content={content} />
    </div>
  );
};
