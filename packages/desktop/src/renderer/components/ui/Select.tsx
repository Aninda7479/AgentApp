import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  direction?: 'up' | 'down';
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select option...',
  className = '',
  direction = 'down'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  
  const selectedOption = options.find((opt) => opt.value === value);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update layout coordinates dynamically on scroll/resize when open
  useEffect(() => {
    if (!isOpen) return;

    updateCoords();

    // Use event capture to track scroll events inside nested scrollable containers
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);

    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  return (
    <div className={`flex flex-col gap-1.5 relative w-full text-left ${className}`} ref={containerRef}>
      {label && (
        <span className="text-xs font-bold text-brand-textMain select-none">
          {label}
        </span>
      )}
      
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white cursor-pointer select-none outline-none hover:border-brand-textMuted/40 focus:border-brand-highlight transition-all"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <span className={selectedOption ? 'text-white' : 'text-brand-textMuted/50'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-brand-textMuted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Popover Options List using React Portal to prevent layout clipping */}
      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            ...(direction === 'up'
              ? { bottom: `${window.innerHeight - coords.top + 4}px` }
              : { top: `${coords.top + coords.height + 4}px` })
          }}
          className={`z-[9999] bg-brand-popover border border-brand-border rounded-xl shadow-xl max-h-[220px] overflow-y-auto p-1.5 duration-100 animate-in fade-in ${
            direction === 'up'
              ? 'slide-in-from-bottom-1'
              : 'slide-in-from-top-1'
          }`}
        >
          {options.length === 0 ? (
            <div className="text-xs text-brand-textMuted p-2 text-center">No options available</div>
          ) : (
            options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  opt.value === value
                    ? 'bg-brand-highlight-bg-subtle text-brand-highlight-text border border-brand-highlight-border-subtle/50'
                    : 'text-brand-textMain hover:bg-brand-hover'
                }`}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
