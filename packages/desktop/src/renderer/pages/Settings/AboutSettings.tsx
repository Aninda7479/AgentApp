import React from 'react';
import { ExternalLink, BookOpen, Bug, Cpu, Plug, Sparkles, Boxes, FolderGit2, LucideIcon } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';

/** Props for the About settings panel. */
interface AboutSettingsProps {
  appVersion?: string;
}

const REPO_URL = 'https://github.com/Aninda7479/AgentApp';

/** Calm, considered capability highlights — one idea per card, no jargon. */
const HIGHLIGHTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Cpu,
    title: 'Local-first',
    body: 'Conversations and data stay on your machine. Nothing leaves unless you connect a provider.'
  },
  {
    icon: Plug,
    title: 'Bring your own models',
    body: 'Wire up OpenAI, Anthropic, Google, and more — or run local models through Ollama.'
  },
  {
    icon: Sparkles,
    title: 'Composable agents',
    body: 'Chain skills, tools, and workflows into agents that fit the way you work.'
  },
  {
    icon: Boxes,
    title: 'A companion on your desktop',
    body: 'Generate 3D characters and a desktop pet that reacts to your sessions.'
  }
];

/** Stack acknowledgements — quiet, not a brag wall. */
const BUILT_WITH = ['Electron', 'React', 'Three.js', 'Tailwind CSS', 'Lucide'];

const LINKS: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: FolderGit2, label: 'GitHub Repository', href: REPO_URL },
  { icon: BookOpen, label: 'Documentation', href: `${REPO_URL}#readme` },
  { icon: Bug, label: 'Report an issue', href: `${REPO_URL}/issues/new` }
];

/** The "About SuperAgent" page — brand voice, layered-atmosphere hero, calm motion. */
export const AboutSettings: React.FC<AboutSettingsProps> = ({ appVersion }) => {
  const ipc =
    typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

  const openInBrowser = (url: string) => {
    if (ipc) {
      ipc.invoke('open-external', url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  };

  return (
    <div className="max-w-[680px] text-left">
      <h1 className="mb-2 font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">
        About SuperAgent
      </h1>
      <p className="mb-7 text-sm leading-6 text-brand-textMuted">
        A local-first home for autonomous AI agents — your workspace, your models, your rules.
      </p>

      {/* Atmosphere hero — the brand mark over calm, layered depth bands. One focal point. */}
      <section className="relative mb-8 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 50% -10%, var(--brand-atmo-glow), transparent 55%)' }}
          />
          <svg className="absolute inset-x-0 bottom-0 h-28 w-full" viewBox="0 0 680 120" preserveAspectRatio="none" fill="none">
            <path d="M0 70 C120 50 240 86 360 66 C480 46 600 84 680 64 L680 120 L0 120 Z" fill="var(--brand-atmo-1)" />
            <path d="M0 90 C140 74 280 104 420 86 C540 70 620 100 680 86 L680 120 L0 120 Z" fill="var(--brand-atmo-2)" />
            <path d="M0 106 C160 96 320 116 480 104 C600 94 640 112 680 104 L680 120 L0 120 Z" fill="var(--brand-atmo-3)" />
          </svg>
        </div>
        <div className="relative flex flex-col items-center gap-4 px-6 py-10 text-center">
          <div className="animate-float">
            <BrandLogo size={72} />
          </div>
          <p className="max-w-sm text-[13px] leading-6 text-brand-textMuted">
            Open-source software that runs on your desktop — compose agents, connect your own
            model providers, and let them work alongside you.
          </p>
        </div>
      </section>

      {/* What it is */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">What it is</h3>
        <p className="text-sm leading-6 text-brand-textMuted">
          SuperAgent is an autonomous AI agent workstation. It keeps your conversations and data on
          your machine, lets you bring your own model keys (OpenAI, Anthropic, Google, and more — or
          local models through Ollama), and turns skills, tools, and workflows into agents that fit
          how you work.
        </p>
      </section>

      {/* Highlights */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Highlights</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="rounded-xl border border-brand-border bg-brand-card p-4">
              <div className="mb-2 flex items-center gap-2 text-brand-textMain">
                <h.icon size={16} className="text-brand-textMuted" />
                <span className="text-sm font-medium">{h.title}</span>
              </div>
              <p className="text-[13px] leading-5 text-brand-textMuted">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built with */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Built with</h3>
        <div className="flex flex-wrap gap-2">
          {BUILT_WITH.map((tech) => (
            <span key={tech} className="ui-chip">
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Links */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Links</h3>
        <div className="flex flex-col gap-2">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                openInBrowser(link.href);
              }}
              className="ui-btn w-full cursor-pointer justify-between"
            >
              <span className="flex items-center gap-2">
                <link.icon size={15} className="text-brand-textMuted" />
                {link.label}
              </span>
              <ExternalLink size={14} className="text-brand-textMuted" />
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-brand-border pt-4 text-xs text-brand-textMuted">
        Version v{appVersion || '0.1.0'} · Licensed under GPL-3.0.
      </div>
    </div>
  );
};

export default AboutSettings;
