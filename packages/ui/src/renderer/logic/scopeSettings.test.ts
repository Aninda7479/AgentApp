import { describe, it, expect } from 'vitest';
import { resolveScopeSettings, approvalToPermissionMode } from './scopeSettings';
import type { StoredProject, StoredChat } from '../types';

describe('resolveScopeSettings', () => {
  const project: StoredProject = {
    name: 'P',
    folders: ['/p'],
    settings: { sandbox: 'full-access', approval: 'always', internet: 'observation' }
  };
  const chat: StoredChat = {
    id: 'c1',
    title: 'C',
    project: 'P',
    model: '',
    timestamp: '',
    steps: [],
    settings: { internet: 'none' }
  };

  it('falls back to global when every scope is unset', () => {
    const r = resolveScopeSettings({
      chat: null,
      project: null,
      globalUnsandboxed: false,
      globalInternet: 'all'
    });
    expect(r.unsandboxed).toBe(false);
    expect(r.approval).toBe('ask');
    expect(r.internet).toBe('all');
  });

  it('project overrides global', () => {
    const r = resolveScopeSettings({
      chat: null,
      project,
      globalUnsandboxed: false,
      globalInternet: 'all'
    });
    expect(r.unsandboxed).toBe(true); // project sandbox: full-access
    expect(r.approval).toBe('always');
    expect(r.internet).toBe('observation');
  });

  it('chat overrides project (precedence Chat → Project → Global)', () => {
    const r = resolveScopeSettings({
      chat,
      project,
      globalUnsandboxed: false,
      globalInternet: 'all'
    });
    // chat only sets internet → sandbox/approval inherit from project.
    expect(r.unsandboxed).toBe(true);
    expect(r.approval).toBe('always');
    expect(r.internet).toBe('none'); // chat wins
  });

  it('chat "inherit" defers to project then global', () => {
    const inheritChat: StoredChat = { ...chat, settings: { sandbox: 'inherit', approval: 'inherit', internet: 'inherit' } };
    const r = resolveScopeSettings({
      chat: inheritChat,
      project,
      globalUnsandboxed: true,
      globalInternet: 'none'
    });
    expect(r.unsandboxed).toBe(true); // project full-access wins (chat inherits)
    expect(r.approval).toBe('always');
    expect(r.internet).toBe('observation');
  });

  it('approvalToPermissionMode maps choices (unsandboxed + always → full-autonomy)', () => {
    expect(approvalToPermissionMode('always', true)).toBe('full-autonomy');
    expect(approvalToPermissionMode('always', false)).toBe('auto-approve-edits');
    expect(approvalToPermissionMode('ask', false)).toBe('auto-approve-edits');
    expect(approvalToPermissionMode('never', false)).toBe('deny-all');
  });
});
