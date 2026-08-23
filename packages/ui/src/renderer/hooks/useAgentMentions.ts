import { useState, useEffect, useMemo } from 'react';
import type { AgentPersona } from '../core/types';
import { usePersonas } from './usePersonas';

export function useAgentMentions(promptText: string, cursorPosition: number = promptText.length) {
  const { personas } = usePersonas();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Check if cursor is immediately after `@` or `@query`
  const mentionMatch = useMemo(() => {
    const textBeforeCursor = promptText.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) return null;

    // Check that `@` is at the beginning of input or preceded by a space
    if (lastAtIndex > 0 && !/\s/.test(textBeforeCursor[lastAtIndex - 1])) {
      return null;
    }

    const query = textBeforeCursor.slice(lastAtIndex + 1);
    // Don't trigger if query contains space
    if (/\s/.test(query)) return null;

    return {
      query: query.toLowerCase(),
      startIndex: lastAtIndex,
      endIndex: cursorPosition,
    };
  }, [promptText, cursorPosition]);

  const filteredPersonas = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionMatch.query;
    if (!q) return personas;
    return personas.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.roleTitle.toLowerCase().includes(q)
    );
  }, [mentionMatch, personas]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionMatch?.query]);

  const isOpen = Boolean(mentionMatch && filteredPersonas.length > 0);

  const applyMention = (
    persona: AgentPersona,
    currentText: string,
    setText: (newText: string) => void,
    setCursor?: (pos: number) => void
  ) => {
    if (!mentionMatch) return;

    const before = currentText.slice(0, mentionMatch.startIndex);
    const after = currentText.slice(mentionMatch.endIndex);
    const inserted = `@${persona.id} `;
    const newText = `${before}${inserted}${after}`;

    setText(newText);
    if (setCursor) {
      const newPos = before.length + inserted.length;
      setCursor(newPos);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    currentText: string,
    setText: (newText: string) => void,
    setCursor?: (pos: number) => void
  ): boolean => {
    if (!isOpen) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredPersonas.length);
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredPersonas.length) % filteredPersonas.length);
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = filteredPersonas[selectedIndex];
      if (selected) {
        applyMention(selected, currentText, setText, setCursor);
      }
      return true;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      return true;
    }

    return false;
  };

  return {
    isOpen,
    filteredPersonas,
    selectedIndex,
    applyMention,
    handleKeyDown,
  };
}
