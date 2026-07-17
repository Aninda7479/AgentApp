import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Optional secondary line rendered under the label (e.g. a hint for a meta-entry). */
  description?: React.ReactNode;
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
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // The popup is rendered through a React Portal into document.body, so it lives
  // outside containerRef. We keep a direct ref to it so the outside-click handler
  // can recognise clicks inside the popup as "inside" rather than "outside".
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });

  // Stable, per-instance ids so multiple <Select> on one screen (e.g. the model
  // governance settings has six) each expose a unique, linkable listbox.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

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

  const openMenu = () => {
    const idx = options.findIndex((opt) => opt.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setIsOpen(true);
  };

  const selectActive = () => {
    const opt = options[activeIndex];
    if (opt) {
      onChange(opt.value);
      setIsOpen(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Ignore clicks inside the trigger (containerRef) or inside the portal
      // popup (popupRef) — otherwise selecting an option would close the menu
      // before the option's onClick could fire.
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      if (!insideContainer && !insidePopup) {
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

  // Keep the active option scrolled into view inside the popup (keyboard nav).
  useEffect(() => {
    if (!isOpen) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex, baseId]);

  const moveActive = (delta: number) => {
    if (options.length === 0) return;
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return options.length - 1;
      if (next >= options.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) openMenu();
        else selectActive();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) openMenu();
        else moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) openMenu();
        else moveActive(-1);
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        break;
      case 'Tab':
        if (isOpen) setIsOpen(false);
        break;
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 relative w-full text-left ${className}`} ref={containerRef}>
      {label && (
        <span className="text-xs font-bold text-brand-textMain select-none">
          {label}
        </span>
      )}

      {/* Trigger Button — ARIA 1.3 combobox; focus stays on the combobox and the
          listbox is driven via aria-activedescendant (keyboard nav never moves
          DOM focus out of the trigger, so the menu can't trap keyboard users). */}
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
        aria-label={label ?? placeholder}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        className="flex items-center justify-between bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white cursor-pointer select-none outline-none hover:border-brand-border-strong focus-visible:border-brand-border-strong focus-visible:ring-2 focus-visible:ring-brand-border-strong/40 transition-all"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onBlur={() => setIsOpen(false)}
      >
        <span className={`flex items-center gap-2 ${selectedOption ? 'text-white' : 'text-brand-textMuted/50'}`}>
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown size={14} className={`text-brand-textMuted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Popover Options List using React Portal to prevent layout clipping */}
      {isOpen && createPortal(
        <div
          ref={popupRef}
          id={listboxId}
          role="listbox"
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
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <div
                  key={opt.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-brand-hover-strong text-brand-textMain border border-brand-border-strong'
                      : 'text-brand-textMain hover:bg-brand-hover'
                  } ${isActive ? 'ring-1 ring-brand-border-strong' : ''}`}
                >
                  {opt.icon && <span className="flex-shrink-0 self-start mt-0.5">{opt.icon}</span>}
                  <span className="flex flex-col min-w-0 text-left">
                    <span className="truncate">{opt.label}</span>
                    {opt.description != null && (
                      <span className="text-[11px] font-normal text-brand-textMuted truncate">{opt.description}</span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
