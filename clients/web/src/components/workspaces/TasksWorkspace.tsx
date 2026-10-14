import React, { useState } from 'react';
import {
  CheckSquare,
  Clock,
  Plus,
  Send,
  Sliders,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  DEMO_TASKS_KANBAN,
  TasksData,
  KanbanCard,
  CronRoutine,
} from '../../demoData';

export const TasksWorkspace: React.FC = () => {
  const [board, setBoard] = useState<TasksData>(DEMO_TASKS_KANBAN);
  const [showRoutineModal, setShowRoutineModal] = useState<boolean>(false);
  const [newRoutineName, setNewRoutineName] = useState<string>('');
  const [newRoutineCron, setNewRoutineCron] = useState<string>('0 9 * * *');
  const [newRoutineTelegram, setNewRoutineTelegram] = useState<boolean>(true);
  const [newRoutineChatId, setNewRoutineChatId] = useState<string>('-1008492019');

  const moveCard = (cardId: string, fromColId: string, toColId: string) => {
    setBoard((prev) => {
      let targetCard: KanbanCard | undefined;

      const newCols = prev.columns.map((col) => {
        if (col.id === fromColId) {
          targetCard = col.cards.find((c) => c.id === cardId);
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        }
        return col;
      });

      if (!targetCard) return prev;

      return {
        ...prev,
        columns: newCols.map((col) => {
          if (col.id === toColId) {
            return { ...col, cards: [...col.cards, targetCard!] };
          }
          return col;
        }),
      };
    });
  };

  const handleAddRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoutineName.trim()) return;

    const newRoutine: CronRoutine = {
      id: `cron-${Date.now()}`,
      name: newRoutineName.trim(),
      cronExpression: newRoutineCron.trim(),
      lastRunStatus: 'Running',
      nextRun: 'Scheduled soon',
      telegramNotify: newRoutineTelegram,
      targetChatId: newRoutineChatId.trim(),
    };

    setBoard((prev) => ({
      ...prev,
      routines: [newRoutine, ...prev.routines],
    }));

    setNewRoutineName('');
    setShowRoutineModal(false);
  };

  const getPriorityColor = (priority: KanbanCard['priority']) => {
    switch (priority) {
      case 'High': return '#ef4444';
      case 'Medium': return '#f59e0b';
      case 'Low': return '#10b981';
      default: return '#94a3b8';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header & Routines Modal Trigger */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckSquare size={17} color="#58a6ff" />
          <span style={{ fontWeight: 600 }}>Tasks & Scheduled Routines Kanban</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#58a6ff',
              border: '1px solid #1f6feb',
            }}
          >
            4 Stages • {board.routines.length} Background Cron Jobs
          </span>
        </div>

        <button
          onClick={() => setShowRoutineModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#1f6feb',
            border: 'none',
            color: '#ffffff',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          <Clock size={13} /> Scheduled Routines ({board.routines.length})
        </button>
      </div>

      {/* Main 4-Column Kanban Board */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '14px',
          padding: '16px',
          overflowX: 'auto',
          backgroundColor: '#090d16',
        }}
      >
        {board.columns.map((col, colIdx) => (
          <div
            key={col.id}
            style={{
              flex: 1,
              minWidth: '280px',
              maxWidth: '360px',
              backgroundColor: '#0f172a',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '100%',
              overflow: 'hidden',
            }}
          >
            {/* Column Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{col.title}</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                  }}
                >
                  {col.cards.length}
                </span>
              </div>
            </div>

            {/* Column Cards Feed */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  style={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        color: getPriorityColor(card.priority),
                        border: `1px solid ${getPriorityColor(card.priority)}`,
                      }}
                    >
                      {card.priority}
                    </span>

                    <span style={{ fontSize: '11px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={11} /> {card.dueDate}
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#f0f6fc', lineHeight: '1.4' }}>
                    {card.title}
                  </div>

                  <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: '1.4' }}>
                    {card.description}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#58a6ff' }}>
                      <User size={12} />
                      <span>{card.assignee}</span>
                    </div>

                    {/* Move Column Arrows */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {colIdx > 0 && (
                        <button
                          onClick={() => moveCard(card.id, col.id, board.columns[colIdx - 1].id)}
                          title={`Move to ${board.columns[colIdx - 1].title}`}
                          style={{
                            backgroundColor: '#21262d',
                            border: '1px solid #30363d',
                            color: '#c9d1d9',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <ArrowLeft size={11} />
                        </button>
                      )}

                      {colIdx < board.columns.length - 1 && (
                        <button
                          onClick={() => moveCard(card.id, col.id, board.columns[colIdx + 1].id)}
                          title={`Move to ${board.columns[colIdx + 1].title}`}
                          style={{
                            backgroundColor: '#21262d',
                            border: '1px solid #30363d',
                            color: '#c9d1d9',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Scheduled Cron Routines Modal */}
      {showRoutineModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '20px',
              width: '520px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                <Clock size={16} color="#58a6ff" />
                <span>Scheduled Background Routines</span>
              </div>
              <button
                onClick={() => setShowRoutineModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* List of active routines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {board.routines.map((r) => (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: '#090d16',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#f8fafc' }}>{r.name}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      Cron: {r.cronExpression} • Next: {r.nextRun}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '10px', color: '#10b981' }}>{r.lastRunStatus}</span>
                    {r.telegramNotify && (
                      <div style={{ fontSize: '9px', color: '#38bdf8' }}>Telegram alerts ON</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Routine Form */}
            <form onSubmit={handleAddRoutine} style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Add New Routine</div>
              <input
                type="text"
                placeholder="Routine Name (e.g., Morning Health Check)"
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                style={{
                  backgroundColor: '#090d16',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '6px 10px',
                  fontSize: '12px',
                }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Cron (e.g., 0 9 * * *)"
                  value={newRoutineCron}
                  onChange={(e) => setNewRoutineCron(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
                <input
                  type="text"
                  placeholder="Telegram Chat ID"
                  value={newRoutineChatId}
                  onChange={(e) => setNewRoutineChatId(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '6px 10px',
                    fontSize: '12px',
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newRoutineTelegram}
                  onChange={(e) => setNewRoutineTelegram(e.target.checked)}
                />
                <span>Send Telegram notifications on routine execution</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowRoutineModal(false)}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#cbd5e1',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#1f6feb',
                    border: 'none',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Schedule Routine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
