import { useState, useEffect, useCallback } from 'react';
import { CoreApiClient } from '../services/CoreApiClient';
import type { AgentPersona } from '../core/types';

export function usePersonas() {
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await CoreApiClient.listPersonas();
      setPersonas(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load personas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const savePersona = useCallback(
    async (persona: AgentPersona) => {
      const saved = await CoreApiClient.savePersona(persona);
      setPersonas((prev) => {
        const index = prev.findIndex((p) => p.id === saved.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = saved;
          return updated;
        }
        return [...prev, saved];
      });
      return saved;
    },
    []
  );

  const deletePersona = useCallback(
    async (id: string) => {
      const deleted = await CoreApiClient.deletePersona(id);
      if (deleted) {
        setPersonas((prev) => prev.filter((p) => p.id !== id));
      }
      return deleted;
    },
    []
  );

  return {
    personas,
    loading,
    error,
    refresh: fetchPersonas,
    savePersona,
    deletePersona,
  };
}
