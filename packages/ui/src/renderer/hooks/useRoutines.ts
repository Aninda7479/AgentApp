import { useState, useEffect, useCallback } from 'react';
import { CoreApiClient } from '../services/CoreApiClient';
import type { RoutineTrigger, RoutineExecutionLog } from '../core/types';

export function useRoutines() {
  const [routines, setRoutines] = useState<RoutineTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastLog, setLastLog] = useState<RoutineExecutionLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await CoreApiClient.listRoutines();
      setRoutines(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load scheduled routines');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  const saveRoutine = useCallback(
    async (routine: RoutineTrigger) => {
      const saved = await CoreApiClient.saveRoutine(routine);
      setRoutines((prev) => {
        const index = prev.findIndex((r) => r.id === saved.id);
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

  const deleteRoutine = useCallback(
    async (id: string) => {
      const deleted = await CoreApiClient.deleteRoutine(id);
      if (deleted) {
        setRoutines((prev) => prev.filter((r) => r.id !== id));
      }
      return deleted;
    },
    []
  );

  const executeNow = useCallback(
    async (id: string) => {
      setRunningId(id);
      setError(null);
      try {
        const log = await CoreApiClient.runRoutine(id);
        setLastLog(log);
        // Refresh routine stats
        await fetchRoutines();
        return log;
      } catch (err: any) {
        setError(err.message || `Failed to run routine ${id}`);
        throw err;
      } finally {
        setRunningId(null);
      }
    },
    [fetchRoutines]
  );

  return {
    routines,
    loading,
    runningId,
    lastLog,
    error,
    refresh: fetchRoutines,
    saveRoutine,
    deleteRoutine,
    executeNow,
    clearLog: () => setLastLog(null),
  };
}
