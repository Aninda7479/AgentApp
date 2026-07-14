/**
 * Partner / Pet — open companion manifest schema.
 *
 * A "Partner" (also called a "Pet") is a small desktop companion that lives in
 * the SuperAgent app and reacts to what the agent is doing — thinking while it
 * plans, working while it runs tools, celebrating on success, sulking on error.
 *
 * The format is fully open: a Partner is just a `partner.json` file (plus
 * optional asset files) describing how it looks and behaves. Anyone can author
 * one, import it into the app, and share it. See docs\Partner-Pet.md for the full
 * creator guide.
 */

/** Emotional states a Partner can express. */
export type PartnerMood =
  | 'idle'        // resting / waiting for you
  | 'thinking'    // the agent is planning or streaming tokens
  | 'working'     // the agent is running a tool
  | 'happy'       // a neutral positive state
  | 'celebrate'   // the agent finished a run successfully
  | 'sad'         // the agent hit an error or was stopped
  | 'sleeping';   // idle for a long time / away

/** Built-in CSS animation names a reaction can request. */
export type PartnerAnimation = 'float' | 'bounce' | 'pulse' | 'wiggle' | 'think' | 'none';

/** How a Partner behaves in a particular mood. */
export interface PartnerReaction {
  /** Emoji shown for this mood (overrides the Partner's default emoji). */
  emoji?: string;
  /** A short line the Partner says in its speech bubble. */
  line?: string;
  /** A CSS animation to play while in this mood. */
  animation?: PartnerAnimation;
  /** Optional asset filename (png/gif/webp) inside the Partner folder. */
  asset?: string;
}

/** Personality metadata used for the creator UI and any future LLM voicing. */
export interface PartnerPersonality {
  /** How the Partner talks, e.g. "quiet and encouraging". */
  voice?: string;
  /** Free-form trait tags, e.g. ["curious", "sleepy"]. */
  traits?: string[];
}

/**
 * The Partner manifest. This is the unit of the open ecosystem — drop a folder
 * containing this file into the app (or paste the JSON) and it becomes a
 * selectable companion.
 */
export interface PartnerManifest {
  /** Marks the file as a SuperAgent Partner manifest. Should equal "superagent-partner". */
  schema: 'superagent-partner';
  /** Stable unique id, e.g. "nova". Used as the install folder name. */
  id: string;
  /** Display name, e.g. "Nova". */
  name: string;
  /** Species / type, e.g. "star", "cat", "robot". Shown as a chip. */
  kind: string;
  /** Semver-ish version string, e.g. "1.0.0". */
  version: string;
  /** One-line description shown on the card. */
  description: string;
  /** Author handle (optional). */
  author?: string;
  /** Accent color (hex) used for the glow ring. Defaults to brand accent. */
  accent?: string;
  /** Default emoji used when a mood has no specific emoji. */
  emoji?: string;
  /** Display picture (can be an emoji or an image file path like dp.png). */
  dp?: string;
  /** Resolved absolute URL of the DP image file. */
  dpUrl?: string;
  /** Optional sprite frames (asset filenames) for frame-by-frame animation. */
  frames?: string[];
  /**
   * Optional 3D glTF model filename inside the Partner folder. When present the
   * 3D desktop pet can load it instead of the built-in procedural creature.
   */
  model?: string;
  /**
   * Optional anime character file (VRM, from VRoid Studio). When present the
   * desktop pet loads it as the 3D character with native facial expressions
   * (talking lip-sync, dark circles, etc.). Falls back to the procedural
   * Lily if the file is missing or fails to load.
   */
  vrm?: string;
  /** Optional custom script filename (index.js) inside the Partner folder. */
  script?: string;
  /** Show the laptop prop (default true). */
  laptop?: boolean;
  /** Show the head pillow prop (default true). */
  pillow?: boolean;
  /** Optional dialogue lines shown in the speech bubble per mood. */
  dialogues?: Partial<Record<PartnerMood, string>>;
  /** Optional named animation clips for a 3D model, by mood. */
  animations?: Partial<Record<PartnerMood, string>>;
  /** Personality metadata (optional). */
  personality?: PartnerPersonality;
  /** Mood → reaction map. Any mood may be omitted (falls back to idle/emoji). */
  reactions: Partial<Record<PartnerMood, PartnerReaction>>;
}

/** Result of validating an unknown value as a Partner manifest. */
export type ValidateResult =
  | { ok: true; manifest: PartnerManifest }
  | { ok: false; error: string };

/** The set of moods a Partner can express, in display order. */
export const PARTNER_MOODS: PartnerMood[] = [
  'idle',
  'thinking',
  'working',
  'happy',
  'celebrate',
  'sad',
  'sleeping'
];

const ACCENT_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ANIMATIONS: PartnerAnimation[] = ['float', 'bounce', 'pulse', 'wiggle', 'think', 'none'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates an arbitrary parsed JSON value as a PartnerManifest.
 * Returns a typed error (never throws) so the UI can surface it cleanly.
 */
export function validatePartnerManifest(raw: unknown): ValidateResult {
  if (!isObject(raw)) {
    return { ok: false, error: 'Partner manifest must be a JSON object.' };
  }
  if (raw.schema !== 'superagent-partner') {
    return { ok: false, error: 'Missing "schema": "superagent-partner".' };
  }
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    return { ok: false, error: 'Field "id" must be a non-empty string.' };
  }
  if (!/^[a-z0-9_-]+$/i.test(raw.id)) {
    return { ok: false, error: 'Field "id" may only contain letters, numbers, "-" and "_".' };
  }
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return { ok: false, error: 'Field "name" must be a non-empty string.' };
  }
  if (typeof raw.kind !== 'string' || raw.kind.trim().length === 0) {
    return { ok: false, error: 'Field "kind" must be a non-empty string.' };
  }
  if (typeof raw.description !== 'string' || raw.description.trim().length === 0) {
    return { ok: false, error: 'Field "description" must be a non-empty string.' };
  }
  if (raw.accent !== undefined && (typeof raw.accent !== 'string' || !ACCENT_RE.test(raw.accent))) {
    return { ok: false, error: 'Field "accent" must be a hex color like "#7c83ff".' };
  }
  if (raw.reactions !== undefined && !isObject(raw.reactions)) {
    return { ok: false, error: 'Field "reactions" must be an object of mood → reaction.' };
  }

  const reactions = (raw.reactions ?? {}) as Record<string, unknown>;
  for (const [mood, value] of Object.entries(reactions)) {
    if (!PARTNER_MOODS.includes(mood as PartnerMood)) {
      return { ok: false, error: `Unknown mood "${mood}" in reactions.` };
    }
    if (value !== undefined && !isObject(value)) {
      return { ok: false, error: `Reaction "${mood}" must be an object.` };
    }
    const r = value as Record<string, unknown>;
    if (r.animation !== undefined && !ANIMATIONS.includes(r.animation as PartnerAnimation)) {
      return { ok: false, error: `Reaction "${mood}".animation must be one of: ${ANIMATIONS.join(', ')}.` };
    }
  }

  return { ok: true, manifest: normalizeManifest(raw) };
}

/**
 * Fills in defaults so downstream code can always read a complete manifest.
 * Accepts the already-validated raw object (or a partial) and returns a
 * complete PartnerManifest.
 */
export function normalizeManifest(raw: Record<string, unknown>): PartnerManifest {
  const reactionsRaw = (raw.reactions ?? {}) as Record<string, Record<string, unknown>>;
  const reactions: PartnerManifest['reactions'] = {};
  for (const mood of PARTNER_MOODS) {
    const r = reactionsRaw[mood];
    reactions[mood] = {
      emoji: r && typeof r.emoji === 'string' ? r.emoji : undefined,
      line: r && typeof r.line === 'string' ? r.line : undefined,
      animation: (r && (r.animation as PartnerAnimation)) ?? 'none',
      asset: r && typeof r.asset === 'string' ? r.asset : undefined
    };
  }

  return {
    schema: 'superagent-partner',
    id: String(raw.id),
    name: String(raw.name),
    kind: String(raw.kind),
    version: typeof raw.version === 'string' && raw.version ? raw.version : '1.0.0',
    description: String(raw.description),
    author: typeof raw.author === 'string' ? raw.author : undefined,
    accent: typeof raw.accent === 'string' ? raw.accent : '#7c83ff',
    emoji: typeof raw.emoji === 'string' ? raw.emoji : '🐾',
    dp: typeof raw.dp === 'string' ? raw.dp : undefined,
    dpUrl: typeof raw.dpUrl === 'string' ? raw.dpUrl : undefined,
    frames: Array.isArray(raw.frames) ? (raw.frames as string[]) : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    vrm: typeof raw.vrm === 'string' ? raw.vrm : undefined,
    script: typeof raw.script === 'string' ? raw.script : undefined,
    laptop: typeof raw.laptop === 'boolean' ? raw.laptop : true,
    pillow: typeof raw.pillow === 'boolean' ? raw.pillow : true,
    dialogues: isObject(raw.dialogues)
      ? (raw.dialogues as PartnerManifest['dialogues'])
      : undefined,
    animations: isObject(raw.animations) ? (raw.animations as PartnerManifest['animations']) : undefined,
    personality: isObject(raw.personality)
      ? {
          voice: typeof (raw.personality as any).voice === 'string' ? (raw.personality as any).voice : undefined,
          traits: Array.isArray((raw.personality as any).traits)
            ? ((raw.personality as any).traits as string[])
            : undefined
        }
      : undefined,
    reactions
  };
}

/**
 * Resolves the reaction for a mood, falling back to idle, then to the
 * Partner's default emoji/line. Guarantees a usable reaction.
 */
export function moodReaction(manifest: PartnerManifest, mood: PartnerMood): PartnerReaction {
  const direct = manifest.reactions[mood];
  if (direct) return direct;
  const idle = manifest.reactions.idle;
  if (idle) return idle;
  return {};
}
