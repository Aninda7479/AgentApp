import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || React.useId();
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold text-brand-textMain select-none">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-highlight/75 focus:ring-1 focus:ring-brand-highlight/30 transition-all placeholder-brand-textMuted/40 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-[11px] text-red-400 mt-0.5">{error}</span>}
    </div>
  );
};
