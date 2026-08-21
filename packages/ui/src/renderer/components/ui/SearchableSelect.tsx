import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary line rendered under the label (e.g. the provider-qualified slug). */
  description?: React.ReactNode;
  /** Right-aligned column — e.g. a price string or Free badge. */
  metadata?: React.ReactNode;
  /** Extra text searched (in addition to label + value) but not shown. */
  keywords?: string;
  /** Optional opaque payload carried with the option. */
  raw?: any;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** When true and the typed query matches no option, offer a "Use custom: <query>" row. */
  allowCustom?: boolean;
  className?: string;
  direction?: 'up' | 'down';
  disabled?: boolean;
}

/**
 * Searchable single-select combobox. Reuses the accessibility + portal-popover
 * model of {@link Select} but adds an in-popover text filter. Used where the
 * option set is large (e.g. the Models list) and/or each option carries a
 * secondary data point (price) worth showing without forcing an exact match.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select option...',
  allowCustom = false,
  className = '',
  direction = 'down',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return options;
    return options.filter((o) =>
      (o.label ?? '').toLowerCase().includes(q) ||
      (o.value ?? '').toLowerCase().includes(q) ||
      (o.keywords ?? '').toLowerCase().includes(q)
    );
  }, [options, q]);

  // Optional "type your own" row when nothing matches yet a query is present.
  const showCustom = allowCustom && q.length > 0 && !options.some((o) => o.value.toLowerCase() === q);
  const rowCount = filtered.length + (showCustom ? 1 : 0);

  const selectedOption = options.find((opt) => opt.value === value);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
  };

  const openMenu = () => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex((opt) => opt.value === value)));
    updateCoords();
    setIsOpen(true);
  };

  const commit = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setQuery('');
  };

  const moveActive = (delta: number) => {
    if (rowCount === 0) return;
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return rowCount - 1;
      if (next >= rowCount) return 0;
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      if (!insideContainer && !insidePopup) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();

    const onScroll = () => updateCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen]);

  // Reset the highlighted row whenever the filtered set changes.
  useEffect(() => {
    setActiveIndex((prev) => (prev >= filtered.length ? Math.max(0, filtered.length - 1) : prev));
  }, [filtered.length]);

  useEffect(() => {
    if (!isOpen) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex, baseId, rowCount]);

  // Map the active index onto either a real option or the custom row.
  const activeValue: string | null = (() => {
    if (activeIndex < filtered.length) return filtered[activeIndex]?.value ?? null;
    if (showCustom && activeIndex === filtered.length) return query.trim();
    return null;
  })();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) openMenu();
        else if (activeValue != null) commit(activeValue);
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
        if (isOpen) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (isOpen) { e.preventDefault(); setActiveIndex(Math.max(0, rowCount - 1)); }
        break;
      case 'Escape':
        if (isOpen) { e.preventDefault(); setIsOpen(false); }
        break;
      case 'Tab':
        if (isOpen) setIsOpen(false);
        break;
    }
  };

  const rowClass = (isSelected: boolean, isActive: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
      isSelected
        ? 'bg-brand-hover-strong text-brand-textMain border border-brand-border-strong'
        : 'text-brand-textMain hover:bg-brand-hover'
    } ${isActive ? 'ring-1 ring-brand-border-strong' : ''}`;

  return (
    <div className={`flex flex-col gap-1.5 relative w-full text-left ${className}`} ref={containerRef}>
      {label && (
        <span className="text-xs font-bold text-brand-textMain select-none">{label}</span>
      )}

      {/* Trigger */}
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
        aria-label={label ?? placeholder}
        aria-disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        className={`flex items-center justify-between bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-textMain cursor-pointer select-none outline-none hover:border-brand-border-strong focus-visible:border-brand-border-strong focus-visible:ring-2 focus-visible:ring-brand-border-strong/40 transition-all ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
      >
        <span className={`flex items-center gap-2 ${selectedOption ? 'text-brand-textMain' : 'text-brand-textMuted/50'}`}>
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown size={14} className={`text-brand-textMuted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Popover */}
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
          className={`z-[9999] bg-brand-popover border border-brand-border rounded-xl shadow-xl max-h-[320px] overflow-y-auto p-1.5 duration-100 animate-in fade-in ${
            direction === 'up' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'
          }`}
        >
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 border-b border-brand-border/60 sticky top-0 bg-brand-popover">
            <Search size={13} className="text-brand-textMuted flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search models..."
              className="w-full bg-transparent border-none outline-none text-xs text-brand-textMain placeholder:text-brand-textMuted/50"
            />
          </div>

          {rowCount === 0 ? (
            <div className="text-xs text-brand-textMuted p-2 text-center">No models found</div>
          ) : (
            <>
              {filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <div
                    key={opt.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => commit(opt.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={rowClass(isSelected, isActive)}
                  >
                    <span className="flex flex-col min-w-0 text-left flex-1">
                      <span className="truncate">{opt.label}</span>
                      {opt.description != null && (
                        <span className="text-[11px] font-normal text-brand-textMuted truncate">{opt.description}</span>
                      )}
                    </span>
                    {opt.metadata != null && (
                      <span className="flex-shrink-0 text-right text-[11px] text-brand-textMuted">{opt.metadata}</span>
                    )}
                  </div>
                );
              })}

              {showCustom && (
                <div
                  id={optionId(filtered.length)}
                  role="option"
                  aria-selected={false}
                  onClick={() => commit(query.trim())}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  className={rowClass(false, activeIndex === filtered.length)}
                >
                  <span className="flex flex-col min-w-0 text-left flex-1">
                    <span className="truncate">Use custom: <span className="text-(--brand-accent)">{query.trim()}</span></span>
                    <span className="text-[11px] font-normal text-brand-textMuted truncate">Type an arbitrary model id</span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;
