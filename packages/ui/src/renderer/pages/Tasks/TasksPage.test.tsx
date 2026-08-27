import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TasksPage } from './TasksPage';
import { KanbanView } from './KanbanView';

describe('TasksPage Component', () => {
  it('renders TasksPage without throwing when ipc returns non-array object', () => {
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue({ columns: [] }),
    };

    const html = renderToStaticMarkup(
      <TasksPage
        ipc={mockIpc}
        triggerToast={vi.fn()}
      />
    );
    expect(html).toContain('Tasks Board');
    expect(html).toContain('Scheduled Routines');
    expect(html).toContain('Global Scope');
  });

  it('renders KanbanView cleanly with null or undefined cards prop', () => {
    const html = renderToStaticMarkup(
      <KanbanView
        cards={null as any}
        onCardsChange={vi.fn()}
        scope="global"
      />
    );
    expect(html).toContain('Backlog');
    expect(html).toContain('In Progress');
    expect(html).toContain('Review');
    expect(html).toContain('Done');
  });
});
