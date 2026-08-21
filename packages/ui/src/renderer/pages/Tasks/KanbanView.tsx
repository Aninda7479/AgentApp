import React, { useState } from 'react';
import { Plus, X, Calendar, AlertCircle, Trash2, Tag, CheckSquare, Clock, Sparkles } from 'lucide-react';

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  labels: { text: string; color: string }[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  createdAt: string;
  column: 'backlog' | 'in-progress' | 'review' | 'done';
  projectScope?: string;
}

interface KanbanViewProps {
  cards: KanbanCard[];
  onCardsChange: (newCards: KanbanCard[]) => void;
  scope: 'global' | 'project';
  projectName?: string;
  onStartWork?: (card: KanbanCard) => void;
}

// Column identity accent — a single 2px top strip, routed through the neon
// state tokens (never raw hues): neutral → live → attention → constructive.
const COLUMNS: { id: KanbanCard['column']; label: string; accent: string }[] = [
  { id: 'backlog', label: 'Backlog', accent: 'var(--brand-border-strong)' },
  { id: 'in-progress', label: 'In Progress', accent: 'var(--neon-live)' },
  { id: 'review', label: 'Review', accent: 'var(--neon-attention)' },
  { id: 'done', label: 'Done', accent: 'var(--neon-constructive)' },
];

// Priority is a stateful escalation — whole-chip tint routed through the neon
// state tokens: neutral (low) → live (medium) → attention (high) → destructive
// (urgent). No raw Tailwind hues, so it stays theme-correct in light + dark.
const PRIORITY_META: Record<
  KanbanCard['priority'],
  { label: string; text: string; bg: string; border: string }
> = {
  low: {
    label: 'Low',
    text: 'var(--brand-text-muted)',
    bg: 'var(--brand-hover)',
    border: 'var(--brand-border)',
  },
  medium: {
    label: 'Medium',
    text: 'var(--neon-live)',
    bg: 'color-mix(in srgb, var(--neon-live) 12%, transparent)',
    border: 'color-mix(in srgb, var(--neon-live) 24%, transparent)',
  },
  high: {
    label: 'High',
    text: 'var(--neon-attention)',
    bg: 'color-mix(in srgb, var(--neon-attention) 12%, transparent)',
    border: 'color-mix(in srgb, var(--neon-attention) 24%, transparent)',
  },
  urgent: {
    label: 'Urgent',
    text: 'var(--neon-destructive)',
    bg: 'color-mix(in srgb, var(--neon-destructive) 14%, transparent)',
    border: 'color-mix(in srgb, var(--neon-destructive) 26%, transparent)',
  },
};

const LABEL_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
];

export const KanbanView: React.FC<KanbanViewProps> = ({
  cards,
  onCardsChange,
  scope,
  projectName,
  onStartWork,
}) => {
  // Drag and drop state
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Inline card creation state
  const [activeAddCol, setActiveAddCol] = useState<KanbanCard['column'] | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  // Selected card detail modal/slideover
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);

  // Labels editing state inside detail modal
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState(LABEL_COLORS[4].hex); // Default Blue

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    e.dataTransfer.setData('text/plain', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: KanbanCard['column']) => {
    e.preventDefault();
    setDragOverCol(columnId);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, columnId: KanbanCard['column']) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain') || draggedCardId;
    if (cardId) {
      const updated = cards.map((c) => {
        if (c.id === cardId) {
          return { ...c, column: columnId };
        }
        return c;
      });
      onCardsChange(updated);
    }
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  // Add Card inline
  const handleAddCard = (columnId: KanbanCard['column']) => {
    if (!newCardTitle.trim()) return;

    const newCard: KanbanCard = {
      id: `task_${Date.now()}`,
      title: newCardTitle.trim(),
      column: columnId,
      priority: 'medium',
      labels: [],
      createdAt: new Date().toISOString(),
      projectScope: scope === 'project' ? projectName : undefined,
    };

    onCardsChange([...cards, newCard]);
    setNewCardTitle('');
    setActiveAddCol(null);
  };

  // Delete Card
  const handleDeleteCard = (cardId: string) => {
    onCardsChange(cards.filter((c) => c.id !== cardId));
    if (selectedCard?.id === cardId) {
      setSelectedCard(null);
    }
  };

  // Update card details
  const handleUpdateCardField = (cardId: string, field: keyof KanbanCard, value: any) => {
    const updated = cards.map((c) => {
      if (c.id === cardId) {
        const newCard = { ...c, [field]: value };
        if (selectedCard?.id === cardId) {
          setSelectedCard(newCard);
        }
        return newCard;
      }
      return c;
    });
    onCardsChange(updated);
  };

  // Label management inside detail modal
  const handleAddLabel = () => {
    if (!selectedCard || !newLabelText.trim()) return;
    const labels = selectedCard.labels || [];
    if (labels.some((l) => l.text.toLowerCase() === newLabelText.trim().toLowerCase())) return;

    const updatedLabels = [...labels, { text: newLabelText.trim(), color: selectedLabelColor }];
    handleUpdateCardField(selectedCard.id, 'labels', updatedLabels);
    setNewLabelText('');
  };

  const handleRemoveLabel = (labelIndex: number) => {
    if (!selectedCard) return;
    const updatedLabels = selectedCard.labels.filter((_, idx) => idx !== labelIndex);
    handleUpdateCardField(selectedCard.id, 'labels', updatedLabels);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Board columns */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 overflow-y-auto min-h-0 select-none custom-scrollbar">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.column === col.id);
          const isOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-xl bg-brand-sidebar/40 border border-brand-border/40 min-h-[300px] md:min-h-0 ${
                isOver ? 'border-brand-border-strong bg-brand-hover' : ''
              } transition-all duration-200`}
              style={{ borderTop: `2px solid ${col.accent}` }}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-brand-border/30">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-brand-textMain">{col.label}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-brand-hover text-brand-textMuted border border-brand-border/20">
                    {colCards.length}
                  </span>
                </div>
                <button
                  onClick={() => setActiveAddCol(activeAddCol === col.id ? null : col.id)}
                  className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
                  title="Add task"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Inline Add Task Form */}
              {activeAddCol === col.id && (
                <div className="p-2 border-b border-brand-border/20 bg-brand-sidebar/20 animate-fade-in">
                  <input
                    type="text"
                    placeholder="Enter task title..."
                    value={newCardTitle}
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCard(col.id);
                      if (e.key === 'Escape') setActiveAddCol(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-brand-popover border border-brand-border text-xs text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-[var(--brand-accent-border)] focus:ring-1 focus:ring-[var(--brand-accent)] mb-2"
                    autoFocus
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => setActiveAddCol(null)}
                      className="px-2.5 py-1 rounded bg-transparent hover:bg-brand-hover text-brand-textMuted text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAddCard(col.id)}
                      className="px-2.5 py-1 rounded bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Cards Container */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 max-h-[50vh] md:max-h-none custom-scrollbar">
                {colCards.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-xs text-brand-textMuted/40 italic select-none">
                    {/* Quiet-zone atmosphere: contour-mode horizon bands + a single
                        focal disc — original linework, monochrome, never behind dense cards. */}
                    <svg width="92" height="52" viewBox="0 0 92 52" fill="none" aria-hidden="true" className="opacity-60">
                      <circle cx="46" cy="40" r="7" fill="var(--brand-atmo-glow)" stroke="var(--brand-border-strong)" strokeWidth="1" />
                      <path d="M4 40 C 22 33, 34 47, 46 40 S 70 33, 88 40" stroke="var(--brand-border-strong)" strokeWidth="1" fill="none" />
                      <path d="M4 47 C 22 41, 34 53, 46 47 S 70 41, 88 47" stroke="var(--brand-border)" strokeWidth="1" fill="none" opacity="0.7" />
                    </svg>
                    No tasks
                  </div>
                ) : (
                  colCards.map((card) => {
                    const isDragging = draggedCardId === card.id;
                    const prio = PRIORITY_META[card.priority || 'medium'];

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedCard(card)}
                        className={`group relative p-3 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border/80 hover:border-brand-border-strong cursor-grab active:cursor-grabbing transition-all duration-150 ${
                          isDragging ? 'opacity-40 border-dashed border-brand-border-strong bg-transparent' : ''
                        }`}
                      >
                        {/* Tags */}
                        {card.labels && card.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {card.labels.map((lbl, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white/90 border border-white/5"
                                style={{ backgroundColor: lbl.color + '44', borderColor: lbl.color }}
                              >
                                {lbl.text}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Title */}
                        <div className="text-xs font-semibold text-brand-textMain mb-2 group-hover:text-brand-textMain transition-colors line-clamp-2">
                          {card.title}
                        </div>

                        {/* Description snippet */}
                        {card.description && (
                          <p className="text-[11px] text-brand-textMuted line-clamp-2 mb-2 leading-relaxed">
                            {card.description}
                          </p>
                        )}

                        {/* Card Footer info */}
                        <div className="flex items-center justify-between text-[10px] text-brand-textMuted mt-1">
                          {/* Priority — state-coded whole-chip tint (neon tokens) */}
                          <span
                            className="px-1.5 py-0.5 rounded border text-[9px] font-bold"
                            style={{ color: prio.text, backgroundColor: prio.bg, borderColor: prio.border }}
                          >
                            {prio.label}
                          </span>

                          {/* Due date if set */}
                          {card.dueDate && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                              <Calendar className="w-3 h-3 text-brand-textMuted" />
                              {new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-over Card Detail Panel */}
      {selectedCard && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-96 z-40 bg-brand-popover border-l border-brand-border shadow-2xl flex flex-col animate-fade-in select-text">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-brand-border/40">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">
              Task Details
            </span>
            <button
              onClick={() => setSelectedCard(null)}
              className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {/* Title editable */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-brand-textMuted uppercase">Title</label>
              <input
                type="text"
                value={selectedCard.title}
                onChange={(e) => handleUpdateCardField(selectedCard.id, 'title', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain font-semibold focus:outline-none focus:border-[var(--brand-accent-border)] focus:ring-1 focus:ring-[var(--brand-accent)]"
              />
            </div>

            {/* Column Switcher */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-brand-textMuted uppercase">Column</label>
              <select
                value={selectedCard.column}
                onChange={(e) => handleUpdateCardField(selectedCard.id, 'column', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain focus:outline-none focus:border-indigo-500"
              >
                {COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-brand-textMuted uppercase">Description</label>
              <textarea
                value={selectedCard.description || ''}
                placeholder="Add a detailed description..."
                onChange={(e) => handleUpdateCardField(selectedCard.id, 'description', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain placeholder-brand-textMuted/40 leading-relaxed focus:outline-none focus:border-[var(--brand-accent-border)] focus:ring-1 focus:ring-[var(--brand-accent)] resize-none"
              />
            </div>

            {/* Priority and Due Date Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-textMuted uppercase">Priority</label>
                <select
                  value={selectedCard.priority}
                  onChange={(e) => handleUpdateCardField(selectedCard.id, 'priority', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain focus:outline-none focus:border-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-textMuted uppercase">Due Date</label>
                <input
                  type="date"
                  value={selectedCard.dueDate || ''}
                  onChange={(e) => handleUpdateCardField(selectedCard.id, 'dueDate', e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Labels Manager */}
            <div className="space-y-2 border-t border-brand-border/40 pt-4">
              <label className="text-[10px] font-bold text-brand-textMuted uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Labels
              </label>

              {/* Existing Labels list */}
              {selectedCard.labels && selectedCard.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedCard.labels.map((lbl, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-white/95 border"
                      style={{ backgroundColor: lbl.color + '33', borderColor: lbl.color }}
                    >
                      {lbl.text}
                      <button
                        onClick={() => handleRemoveLabel(idx)}
                        className="text-white/60 hover:text-white transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Label Form */}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="New label..."
                  value={newLabelText}
                  onChange={(e) => setNewLabelText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLabel();
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-brand-card border border-brand-border text-xs text-brand-textMain placeholder-brand-textMuted/45 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleAddLabel}
                  className="px-3 py-1.5 rounded bg-brand-hover hover:bg-brand-hover-strong border border-brand-border text-xs font-semibold text-brand-textMain transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Color Swatch selector */}
              <div className="flex gap-1.5 py-1">
                {LABEL_COLORS.map((col) => (
                  <button
                    key={col.hex}
                    onClick={() => setSelectedLabelColor(col.hex)}
                    className={`w-4 h-4 rounded-full border transition-all ${
                      selectedLabelColor === col.hex ? 'scale-125 border-[var(--brand-text-main)] ring-1 ring-[var(--brand-accent)]' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: col.hex }}
                    title={col.name}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer controls: Start Work (Agent) + Delete Task */}
          <div className="p-4 border-t border-brand-border/40 flex items-center gap-2">
            <button
              onClick={() => onStartWork?.(selectedCard)}
              disabled={!onStartWork}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              style={{ color: 'var(--brand-highlight-text)', backgroundColor: 'var(--brand-highlight)', border: '1px solid var(--brand-highlight-hover)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-highlight-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-highlight)'; }}
              title="Start an autonomous agent session to work on this task"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Start Work (Agent)
            </button>
            <button
              onClick={() => handleDeleteCard(selectedCard.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              style={{ color: 'var(--neon-destructive)', backgroundColor: 'color-mix(in srgb, var(--neon-destructive) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--neon-destructive) 24%, transparent)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--neon-destructive) 22%, transparent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--neon-destructive) 12%, transparent)'; }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
