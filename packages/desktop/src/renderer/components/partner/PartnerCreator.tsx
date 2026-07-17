import React, { useMemo, useState } from 'react';
import { X, Copy, Save, Upload } from 'lucide-react';
import { PetSprite } from './PetSprite';
import {
  PARTNER_MOODS,
  validatePartnerManifest,
  type PartnerAnimation,
  type PartnerManifest,
  type PartnerMood,
  type PartnerReaction
} from './types';

const ANIMATIONS: PartnerAnimation[] = ['float', 'bounce', 'pulse', 'wiggle', 'think', 'none'];

interface ReactionForm {
  emoji: string;
  line: string;
  animation: PartnerAnimation;
}

interface CreatorForm {
  id: string;
  name: string;
  kind: string;
  version: string;
  description: string;
  author: string;
  accent: string;
  emoji: string;
  model: string;
  modelFolder: string;
  reactions: Record<string, ReactionForm>;
}

function blankForm(): CreatorForm {
  const reactions: Record<string, ReactionForm> = {};
  for (const m of PARTNER_MOODS) reactions[m] = { emoji: '', line: '', animation: 'none' };
  return {
    id: '',
    name: '',
    kind: '',
    version: '1.0.0',
    description: '',
    author: '',
    accent: '#7c83ff',
    emoji: '🐾',
    model: '',
    modelFolder: '',
    reactions
  };
}

function fromManifest(m: PartnerManifest): CreatorForm {
  const reactions: Record<string, ReactionForm> = {};
  for (const mood of PARTNER_MOODS) {
    const r: PartnerReaction = m.reactions[mood] ?? {};
    reactions[mood] = {
      emoji: r.emoji ?? '',
      line: r.line ?? '',
      animation: r.animation ?? 'none'
    };
  }
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    version: m.version,
    description: m.description,
    author: m.author ?? '',
    accent: m.accent ?? '#7c83ff',
    emoji: m.emoji ?? '🐾',
    model: m.model ?? '',
    modelFolder: m.modelFolder ?? '',
    reactions
  };
}

export interface PartnerCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the serialized manifest JSON when the user saves to the library. */
  onSave: (json: string) => void | Promise<void>;
  /** An existing Partner to edit, if any. */
  initial?: PartnerManifest | null;
}

/**
 * The "make your own Partner" editor. Authors a complete partner.json, previews
 * it live, and can load/edit an existing manifest or copy the JSON out.
 */
export const PartnerCreator: React.FC<PartnerCreatorProps> = ({ isOpen, onClose, onSave, initial }) => {
  const [form, setForm] = useState<CreatorForm>(() => (initial ? fromManifest(initial) : blankForm()));
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const setField = <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const setReaction = (mood: PartnerMood, patch: Partial<ReactionForm>) => {
    setForm((f) => ({ ...f, reactions: { ...f.reactions, [mood]: { ...f.reactions[mood], ...patch } } }));
  };

  const builtManifest: PartnerManifest = useMemo(() => {
    const reactions: PartnerManifest['reactions'] = {};
    for (const mood of PARTNER_MOODS) {
      const r = form.reactions[mood];
      if (r.emoji || r.line || r.animation !== 'none') {
        reactions[mood] = { emoji: r.emoji || undefined, line: r.line || undefined, animation: r.animation };
      }
    }
    return {
      schema: 'superagent-partner',
      id: form.id.trim().toLowerCase().replace(/\s+/g, '-') || 'my-partner',
      name: form.name.trim() || 'My Partner',
      kind: form.kind.trim() || 'companion',
      version: form.version.trim() || '1.0.0',
      description: form.description.trim() || 'A custom Partner.',
      author: form.author.trim() || undefined,
      accent: form.accent,
      emoji: form.emoji || '🐾',
      model: form.model.trim() || undefined,
      modelFolder: form.modelFolder.trim() || undefined,
      reactions
    };
  }, [form]);

  const json = useMemo(() => JSON.stringify(builtManifest, null, 2), [builtManifest]);

  const handleLoad = () => {
    const res = validatePartnerManifest(safeParse(importText));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(fromManifest(res.manifest));
    setImportText('');
    setError(null);
  };

  const handleSave = () => {
    const res = validatePartnerManifest(safeParse(json));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSave(json);
    setError(null);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard unavailable — select the JSON below to copy manually.');
    }
  };

  return (
    <div className="ui-modal-backdrop" data-testid="partner-creator">
      <div className="ui-modal flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-outfit text-lg font-semibold text-brand-textMain">Create a Partner</h2>
            <p className="text-xs text-brand-textMuted">
              Anyone can build one. Export the JSON and share it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-brand-textMuted hover:bg-[var(--brand-hover-strong)] hover:text-brand-textMain"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-4">
          {/* Left: identity */}
          <div className="flex-1 space-y-3">
            <Field label="Name">
              <input className="ui-input" data-testid="creator-name" value={form.name} placeholder="Nova"
                onChange={(e) => setField('name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind / species">
                <input className="ui-input" data-testid="creator-kind" value={form.kind} placeholder="star"
                  onChange={(e) => setField('kind', e.target.value)} />
              </Field>
              <Field label="Version">
                <input className="ui-input" value={form.version} onChange={(e) => setField('version', e.target.value)} />
              </Field>
            </div>
            <Field label="Description">
              <input className="ui-input" data-testid="creator-desc" value={form.description} placeholder="A bright companion"
                onChange={(e) => setField('description', e.target.value)} />
            </Field>
            <Field label="Author (optional)">
              <input className="ui-input" value={form.author} placeholder="@you"
                onChange={(e) => setField('author', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default emoji">
                <input className="ui-input text-center text-lg" data-testid="creator-emoji" value={form.emoji}
                  onChange={(e) => setField('emoji', e.target.value)} />
              </Field>
              <Field label="Accent color">
                <input type="color" className="ui-input h-10 p-1" data-testid="creator-accent" value={form.accent}
                  onChange={(e) => setField('accent', e.target.value)} />
              </Field>
            </div>
            <Field label="3D model (optional)">
              <input className="ui-input" data-testid="creator-model" value={form.model}
                placeholder="creature.glb — overrides the built-in 3D creature"
                onChange={(e) => setField('model', e.target.value)} />
            </Field>
            <Field label="3D model folder (optional)">
              <input className="ui-input" data-testid="creator-model-folder" value={form.modelFolder}
                placeholder="src/my-model — folder w/ index.ts exporting a Character"
                onChange={(e) => setField('modelFolder', e.target.value)} />
            </Field>
          </div>

          {/* Right: live preview */}
          <div className="flex w-40 flex-shrink-0 flex-col items-center justify-start gap-2 rounded-xl border border-brand-border bg-brand-bg p-3">
            <span className="ui-eyebrow">Preview</span>
            <PetSprite manifest={builtManifest} mood="idle" size={44} />
            <div className="text-center text-[13px] font-semibold text-brand-textMain">{builtManifest.name}</div>
            <div className="ui-eyebrow">{builtManifest.kind}</div>
          </div>
        </div>

        {/* Reactions */}
        <div>
          <div className="ui-label mb-2">Reactions by mood</div>
          <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 custom-scrollbar sm:grid-cols-2">
            {PARTNER_MOODS.map((mood) => (
              <div key={mood} className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-bg p-2">
                <span className="w-16 flex-shrink-0 text-[11px] font-semibold capitalize text-brand-textMuted">{mood}</span>
                <input className="ui-input w-10 !px-1 text-center" data-testid={`creator-emoji-${mood}`}
                  value={form.reactions[mood].emoji} placeholder="🙂"
                  onChange={(e) => setReaction(mood, { emoji: e.target.value })} />
                <input className="ui-input flex-1 !py-1.5 text-xs" placeholder="say something…"
                  value={form.reactions[mood].line}
                  onChange={(e) => setReaction(mood, { line: e.target.value })} />
                <select className="ui-input !w-20 !py-1.5 text-xs" value={form.reactions[mood].animation}
                  onChange={(e) => setReaction(mood, { animation: e.target.value as PartnerAnimation })}>
                  {ANIMATIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Import existing */}
        <div>
          <div className="ui-label mb-2">Load an existing manifest (optional)</div>
          <textarea className="ui-input h-20 w-full resize-none font-mono text-xs" data-testid="creator-import"
            placeholder='Paste a partner.json here, then "Load"' value={importText}
            onChange={(e) => setImportText(e.target.value)} />
          <button className="ui-btn mt-2" data-testid="creator-load" onClick={handleLoad}>
            <Upload size={14} /> Load
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 px-3 py-2 text-xs text-[color:var(--neon-destructive)]">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-brand-border pt-3">
          <button className="ui-btn" data-testid="creator-copy" onClick={handleCopy}>
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <div className="flex gap-2">
            <button className="ui-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="ui-btn-primary" data-testid="creator-save" onClick={handleSave}>
              <Save size={14} /> Save to library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="ui-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function safeParse(text: string): unknown {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
