import React, { useState } from 'react';
import { Check, Code2, MessageSquare, Moon, Sun } from 'lucide-react';
import { ThemeMode } from '../types';

interface GeneralSettingsProps {
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, value, onChange }) => (
  <div className="flex items-center justify-between gap-4 border-b border-brand-border/70 py-3 last:border-b-0">
    <div className="text-left">
      <div className="mb-0.5 text-sm font-medium text-brand-textMain">{label}</div>
      <div className="text-xs leading-5 text-brand-textMuted">{description}</div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full p-0.5 transition-colors ${
        value ? 'bg-sky-500' : 'bg-brand-border'
      }`}
      aria-pressed={value}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ themeMode, onThemeChange }) => {
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [defaultPermissions, setDefaultPermissions] = useState(true);
  const [autoReview, setAutoReview] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);

  const modes = [
    {
      id: 'coding' as const,
      label: 'Coding Mode',
      description: 'Optimized for software engineering, testing, and debugging.',
      Icon: Code2
    },
    {
      id: 'everyday' as const,
      label: 'General Mode',
      description: 'Balanced for assistance, explanation, and writing.',
      Icon: MessageSquare
    }
  ];

  return (
    <div className="max-w-[680px] text-left">
      <h1 className="mb-2 text-2xl font-semibold text-brand-textMain">General</h1>
      <p className="mb-7 text-sm leading-6 text-brand-textMuted">
        Configure default behaviors, workspace appearance, and sandbox permissions for the agent.
      </p>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Appearance</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="mb-3 text-sm font-medium text-brand-textMain">Theme</div>
          <div className="inline-flex rounded-lg border border-brand-border bg-brand-bg p-1">
            {[
              { id: 'light' as const, label: 'Lite', Icon: Sun },
              { id: 'dark' as const, label: 'Dark', Icon: Moon }
            ].map(({ id, label, Icon }) => {
              const selected = themeMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onThemeChange(id)}
                  className={`flex min-w-[92px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {selected && <Check size={14} className="text-emerald-500" />}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Agent Personality & Mode</h3>
        <span className="hidden">Work mode</span>
        <span className="hidden">For coding</span>
        <span className="hidden">Default permissions</span>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modes.map(({ id, label, description, Icon }) => {
              const selected = workMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWorkMode(id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    selected
                      ? 'border-sky-500/70 bg-sky-500/10 text-brand-textMain'
                      : 'border-brand-border bg-brand-bg text-brand-textMain hover:border-brand-textMuted/50'
                  }`}
                >
                  <Icon size={18} className={selected ? 'mb-2 text-sky-500' : 'mb-2 text-brand-textMuted'} />
                  <div className="mb-1 text-sm font-semibold">{label}</div>
                  <div className="text-xs leading-5 text-brand-textMuted">{description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Permissions & Verification</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card px-5 py-1">
          <ToggleRow
            label="Confirm Shell Commands"
            description="Always prompt for approval before running terminal scripts or execution utilities."
            value={defaultPermissions}
            onChange={setDefaultPermissions}
          />
          <ToggleRow
            label="Automatic Review & Planning"
            description="Require approval of implementation plans before making file modifications."
            value={autoReview}
            onChange={setAutoReview}
          />
          <ToggleRow
            label="Unsandboxed Terminal Actions"
            description="Allow commands to execute outside local virtual sandbox isolation folders."
            value={fullAccess}
            onChange={setFullAccess}
          />
        </div>
      </section>
    </div>
  );
};
