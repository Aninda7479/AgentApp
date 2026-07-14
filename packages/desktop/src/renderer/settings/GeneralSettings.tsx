import React from 'react';
import { Check, Code2, MessageSquare, Moon, Sun, Monitor, Globe, Eye, Ban } from 'lucide-react';
import { ThemeMode } from '../types';
import { InternetAccessLevel } from './types';

/** Props for the general settings panel. */
interface GeneralSettingsProps {
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  workMode: 'coding' | 'everyday';
  onWorkModeChange: (mode: 'coding' | 'everyday') => void;
  confirmShellCommands: boolean;
  onConfirmShellCommandsChange: (val: boolean) => void;
  autoReviewPlan: boolean;
  onAutoReviewPlanChange: (val: boolean) => void;
  unsandboxedActions: boolean;
  onUnsandboxedActionsChange: (val: boolean) => void;
  internetAccessLevel: InternetAccessLevel;
  onInternetAccessLevelChange: (level: InternetAccessLevel) => void;
}

/** Props for a labeled boolean toggle row. */
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
        value ? 'bg-[var(--brand-accent)]' : 'bg-brand-border'
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

/** Renders appearance, work mode, and permission settings for the agent. */
export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  themeMode,
  onThemeChange,
  workMode,
  onWorkModeChange,
  confirmShellCommands,
  onConfirmShellCommandsChange,
  autoReviewPlan,
  onAutoReviewPlanChange,
  unsandboxedActions,
  onUnsandboxedActionsChange,
  internetAccessLevel,
  onInternetAccessLevelChange
}) => {
  const internetAccessOptions: {
    id: InternetAccessLevel;
    label: string;
    description: string;
    Icon: typeof Globe;
  }[] = [
    {
      id: 'all',
      label: 'All Access',
      description: 'The agent may use the network freely — fetch, browse, search, and publish.',
      Icon: Globe
    },
    {
      id: 'observation',
      label: 'Observation Only',
      description: 'Read public web pages (GET) but cannot post, upload, or change remote state.',
      Icon: Eye
    },
    {
      id: 'none',
      label: 'No Internet',
      description: 'Fully air-gapped. The agent can only use local tools and the AI provider API.',
      Icon: Ban
    }
  ];

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
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        General
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Configure default behaviors, workspace appearance, and sandbox permissions for the agent.
      </p>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Appearance</h3>
        <div className="settings-section">
          <div className="ui-label mb-3">Theme</div>
          <div className="settings-segment">
            {[
              { id: 'light' as const, label: 'Lite', Icon: Sun },
              { id: 'system' as const, label: 'System', Icon: Monitor },
              { id: 'dark' as const, label: 'Dark', Icon: Moon }
            ].map(({ id, label, Icon }) => {
              const selected = themeMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onThemeChange(id)}
                  className={selected ? 'selected' : ''}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {selected && <Check size={14} className="text-[var(--brand-accent)]" />}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Agent Personality &amp; Mode</h3>
        <span className="hidden">Work mode</span>
        <span className="hidden">For coding</span>
        <span className="hidden">Default permissions</span>
        <div className="settings-section">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modes.map(({ id, label, description, Icon }) => {
              const selected = workMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onWorkModeChange(id)}
                  className={`settings-choice ${selected ? 'selected' : ''}`}
                >
                  <Icon size={18} className="settings-choice-icon" />
                  <div className="settings-choice-title">{label}</div>
                  <div className="settings-choice-desc">{description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Permissions &amp; Verification</h3>
        <div className="settings-section px-5 py-1">
          <ToggleRow
            label="Confirm Shell Commands"
            description="Always prompt for approval before running terminal scripts or execution utilities."
            value={confirmShellCommands}
            onChange={onConfirmShellCommandsChange}
          />
          <ToggleRow
            label="Automatic Review & Planning"
            description="Require approval of implementation plans before making file modifications."
            value={autoReviewPlan}
            onChange={onAutoReviewPlanChange}
          />
          <ToggleRow
            label="Unsandboxed Terminal Actions"
            description="Allow commands to execute outside local virtual sandbox isolation folders."
            value={unsandboxedActions}
            onChange={onUnsandboxedActionsChange}
          />
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Internet Access</h3>
        <p className="settings-section-sub">
          Controls whether the agent may reach the network on its own. This prevents autonomous, potentially
          dangerous internet actions. The AI provider API is always allowed so the assistant can still respond.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {internetAccessOptions.map(({ id, label, description, Icon }) => {
            const selected = internetAccessLevel === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`internet-access-${id}`}
                onClick={() => onInternetAccessLevelChange(id)}
                className={`settings-choice ${selected ? 'selected' : ''}`}
              >
                <Icon size={18} className="settings-choice-icon" />
                <div className="flex items-center gap-1.5 settings-choice-title">
                  {label}
                  {selected && <Check size={14} className="text-[var(--brand-accent)]" />}
                </div>
                <div className="settings-choice-desc">{description}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
