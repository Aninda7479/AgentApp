import React, { useState } from 'react';
import {
  Box,
  Image as ImageIcon,
  Layers,
  PaintBucket,
  Bone,
  Play,
  Upload,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  LucideIcon
} from 'lucide-react';
import type { PartnerController } from '../logic/agentStream';

/** Shapes of the payloads exchanged with the main process over IPC. */
interface GeneratedModel {
  ok: boolean;
  disabled?: boolean;
  path?: string;
  format?: string;
  provider?: string;
  message?: string;
}

interface StudioViewProps {
  /** The live Partner controller (active id + import/activate/start APIs). */
  partners: PartnerController;
  triggerToast: (message: string, type?: 'info' | 'error') => void;
}

/**
 * The six pipeline stages the user specified for 3D character creation.
 * Steps 1–2 are interactive (concept + geometry); 3–6 describe the downstream
 * pipeline the generator + pet already produce (texture, rig, animation), with
 * component splitting flagged as a future mesh-segmentation capability.
 */
const STEPS: { id: number; label: string; Icon: LucideIcon; desc: string }[] = [
  {
    id: 1,
    label: 'Concept Design',
    Icon: ImageIcon,
    desc:
      'Describe how the character should look and let an image model render a concept, OR upload a concept image directly. This becomes the seed for generation.'
  },
  {
    id: 2,
    label: 'Geometric Generation',
    Icon: Box,
    desc:
      'From the concept (a text prompt and/or one or more reference images from various angles) an AI model builds the 3D geometry — text-to-3D or image-to-3D.'
  },
  {
    id: 3,
    label: 'Component Splitting',
    Icon: Layers,
    desc:
      'Split the single mesh into parts — bare body (face, chest, joints, legs), clothes, hair, accessories — by reality or by your imagined concept. (Mesh auto-segmentation is a planned capability; today the generator returns one unified mesh.)'
  },
  {
    id: 4,
    label: 'Texture Painting',
    Icon: PaintBucket,
    desc:
      'Paint PBR textures (base color, roughness, metalness) onto the geometry so the character reads as a real, lit object. Tripo3D/Meshy emit PBR textures with the model.'
  },
  {
    id: 5,
    label: 'Binding Bones & Skin',
    Icon: Bone,
    desc:
      'Bind a skeleton (rig) to the mesh and skin it so the body bends and moves at its joints. Rigged output is part of what the cloud generators return.'
  },
  {
    id: 6,
    label: 'Animation Generation',
    Icon: Play,
    desc:
      'Generate animations — idle, walk, talk — and hand the rigged, textured character to your 3D pet so it shows and animates in real time.'
  }
];

/**
 * `StudioView` — the dedicated "3D Studio" entry point (selected via
 * Settings → 3D Model Gen → mode = studio). It guides the user through the
 * concept → geometry → (texture/rig/animation) pipeline and, on success,
 * imports the produced model into the active Partner and launches the pet.
 */
export const StudioView: React.FC<StudioViewProps> = ({ partners, triggerToast }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [name, setName] = useState('Luna');
  const [prompt, setPrompt] = useState('');
  const [conceptImage, setConceptImage] = useState<string | null>(null);
  const [conceptPreview, setConceptPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedModel | null>(null);

  const ipc =
    typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

  const handlePickImage = async () => {
    if (!ipc) {
      triggerToast('Image picker is only available in the desktop app.', 'error');
      return;
    }
    try {
      const res = (await ipc.invoke('pick-image-file')) as { path?: string | null };
      if (res?.path) {
        setConceptImage(res.path);
        setConceptPreview(`file:///${res.path.replace(/\\/g, '/')}`);
      }
    } catch {
      triggerToast('Could not open image picker.', 'error');
    }
  };

  const handleGenerate = async () => {
    if (!ipc) {
      triggerToast('3D generation is only available in the desktop app.', 'error');
      return;
    }
    if (!name.trim()) {
      triggerToast('Give your character a name first.', 'error');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = (await ipc.invoke('three-d-generate', {
        name: name.trim(),
        prompt: prompt.trim() || undefined,
        imagePath: conceptImage || undefined
      })) as GeneratedModel;
      setResult(res);
      if (res.disabled) {
        triggerToast('3D Model Gen is disabled in Settings.', 'info');
        setActiveStep(1);
      } else if (res.ok && res.path) {
        triggerToast('Character generated — see the Animation step to show it in your pet.', 'info');
        setActiveStep(6);
      } else if (res.message) {
        triggerToast(res.message, 'info');
      }
    } catch (e: any) {
      triggerToast(`3D generation failed: ${e?.message ?? e}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleShowInPet = async () => {
    if (!result?.ok || !result.path) {
      triggerToast('Generate a character first.', 'error');
      return;
    }
    const activeId = partners.activeId;
    if (!activeId) {
      triggerToast('No active Partner to show the character.', 'info');
      return;
    }
    try {
      await partners.importModel(activeId, result.path);
      partners.setActive(activeId);
      await partners.startPet();
      const label = result.provider === 'local' ? 'local placeholder' : result.provider || 'model';
      triggerToast(`3D character ready (${label}) — showing in your pet!`, 'info');
    } catch {
      triggerToast('Could not import the model into your Partner.', 'error');
    }
  };

  const generated = Boolean(result?.ok && result?.path);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-5 md:px-8 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[var(--brand-accent-tint)] border border-[var(--brand-accent-border)]/50 flex items-center justify-center">
          <Box size={20} className="text-[var(--brand-accent)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-brand-textMain">3D Studio</h1>
          <p className="text-[11px] text-brand-textMuted">
            Concept → geometry → texture → rig → animation. Tripo3D / Meshy comparable.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Stepper */}
        <div className="space-y-1.5">
          {STEPS.map((s) => {
            const isActive = activeStep === s.id;
            const isDone = generated && s.id < 6;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-white/5 border-brand-border/50 text-brand-textMain'
                    : 'border-transparent text-brand-textMuted hover:bg-white/5 hover:text-brand-textMain'
                }`}
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${
                    isActive
                      ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent)]'
                      : 'bg-white/5 text-brand-textMuted'
                  }`}
                >
                  {isDone ? <CheckCircle2 size={15} /> : <s.Icon size={15} />}
                </span>
                <span className="text-xs font-semibold">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active step panel */}
        <div className="glass-card rounded-xl border border-brand-border/60 p-5 space-y-5">
          {STEPS.filter((s) => s.id === activeStep).map((s) => (
            <div key={s.id} className="space-y-5">
              <div className="flex items-center gap-2.5">
                <s.Icon size={18} className="text-[var(--brand-accent)]" />
                <h2 className="text-sm font-bold text-brand-textMain">{s.label}</h2>
              </div>
              <p className="text-xs text-brand-textMuted leading-relaxed">{s.desc}</p>

              {/* Step 1 — Concept Design */}
              {s.id === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
                      Character name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Luna"
                      className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
                      Describe the character (concept prompt)
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      placeholder="A friendly robot with a rounded body, pastel-blue plating, and a glowing chest core."
                      className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePickImage}
                      className="ui-btn-ghost text-xs flex items-center gap-1.5"
                    >
                      <Upload size={14} />
                      <span>{conceptImage ? 'Change concept image' : 'Upload concept image'}</span>
                    </button>
                    {conceptImage && (
                      <span className="text-[10px] text-brand-textMuted truncate max-w-[180px]">
                        {conceptImage.split(/[\\/]/).pop()}
                      </span>
                    )}
                  </div>
                  {conceptPreview && (
                    <div className="w-32 h-32 rounded-lg border border-brand-border/60 overflow-hidden bg-black/20">
                      <img src={conceptPreview} alt="concept" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <button
                    onClick={() => setActiveStep(2)}
                    className="ui-btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Sparkles size={14} />
                    <span>Continue to generation</span>
                  </button>
                </div>
              )}

              {/* Step 2 — Geometric Generation */}
              {s.id === 2 && (
                <div className="space-y-4">
                  <div className="text-[11px] text-brand-textMuted rounded-lg bg-white/5 border border-brand-border/40 p-3">
                    <div><span className="text-brand-textMain font-semibold">Name:</span> {name || '—'}</div>
                    <div className="mt-1"><span className="text-brand-textMain font-semibold">Prompt:</span> {prompt || '—'}</div>
                    <div className="mt-1">
                      <span className="text-brand-textMain font-semibold">Concept image:</span>{' '}
                      {conceptImage ? conceptImage.split(/[\\/]/).pop() : 'none'}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="ui-btn-primary text-xs flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Wand2 size={14} />
                    <span>{generating ? 'Generating…' : 'Generate 3D character'}</span>
                  </button>

                  {result && (
                    <div
                      className={`p-3 rounded-lg flex items-start gap-2.5 text-xs ${
                        result.ok
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      }`}
                    >
                      {result.ok ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertCircle size={15} className="mt-0.5" />}
                      <div className="space-y-1">
                        <div>{result.message}</div>
                        {result.path && (
                          <div className="text-brand-textMuted break-all">
                            {result.format?.toUpperCase()} → <code>{result.path}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {generated && (
                    <button
                      onClick={handleShowInPet}
                      className="ui-btn-ghost text-xs flex items-center gap-1.5"
                    >
                      <Play size={14} />
                      <span>Show in pet now</span>
                    </button>
                  )}
                </div>
              )}

              {/* Steps 3–5 — pipeline descriptions */}
              {s.id >= 3 && s.id <= 5 && (
                <div className="flex items-start gap-2 rounded-lg bg-[var(--brand-accent-tint)]/30 border border-[var(--brand-accent-border)]/30 p-3 text-[11px] text-brand-textMuted">
                  <Info size={14} className="mt-0.5 text-[var(--brand-accent)] flex-shrink-0" />
                  <span>
                    {s.id === 3
                      ? 'Today the generator returns one unified mesh. Auto-splitting into body / clothes / hair / accessories is a planned mesh-segmentation step.'
                      : s.id === 4
                      ? 'PBR textures arrive with the generated model — no extra step needed for cloud generation. The local placeholder is untextured.'
                      : 'Rigging (bone binding + skinning) is included in cloud-generated output so the pet can move the character at its joints.'}
                  </span>
                </div>
              )}

              {/* Step 6 — Animation / show in pet */}
              {s.id === 6 && (
                <div className="space-y-4">
                  {generated ? (
                    <>
                      <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-[11px] text-emerald-400">
                        <CheckCircle2 size={14} className="mt-0.5" />
                        <span>
                          Your character is ready ({result?.format?.toUpperCase()}). Import it into your active
                          Partner and launch the pet to show + animate it.
                        </span>
                      </div>
                      <button
                        onClick={handleShowInPet}
                        className="ui-btn-primary text-xs flex items-center gap-1.5"
                      >
                        <Play size={14} />
                        <span>Show in pet</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg bg-white/5 border border-brand-border/40 p-3 text-[11px] text-brand-textMuted">
                      <Info size={14} className="mt-0.5 text-[var(--brand-accent)] flex-shrink-0" />
                      <span>
                        Generate a character in step 2 first. Once it is ready, the pet will load the rigged,
                        textured model and animate it (idle / interact) in real time.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudioView;
