import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 flex-shrink-0 rounded-full p-1 cursor-pointer transition-colors duration-200 border-none outline-none ${
          checked ? 'bg-brand-highlight' : 'bg-brand-border'
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {label && (
        <span
          onClick={() => onChange(!checked)}
          className="text-xs font-semibold text-brand-textMain cursor-pointer select-none"
        >
          {label}
        </span>
      )}
    </div>
  );
};
