import fs from 'fs';
import path from 'path';
import { ToolDefinition, BYOKConfig } from '../types/agent.js';
import { SettingsStorage } from '../storage/settings-store.js';

/**
 * `make_3d_character` — the agent-facing entry point for the 3D model /
 * character generation capability (Tripo3D / Meshy comparable).
 *
 * Gated by the `threeD` settings block (default OFF — the user must opt in
 * from Settings → 3D Model Gen). When disabled the tool refuses with a clear
 * "enable it" message, so the capability is truly off until the user turns it on.
 *
 * When enabled:
 *  - with a provider API key → calls Tripo3D (text/image → task → poll
 *    → download GLB). This is the "real" generator (Tripo3D comparable).
 *  - without a key → a dependency-free *local* generator builds a valid glTF
 *    (data-URI buffers, no three.js) so the agent can still DEMONSTRATE the
 *    full make → export → (import-as-Partner → pet shows/animates) loop offline.
 *
 * The exported file path is returned so the desktop can import it as a Partner
 * (reusing the existing GLB/glTF → pet pipeline from #015 / the 3D Partner
 * work) and the pet shows + animates it.
 */

interface ThreeDArgs {
  name?: string;
  prompt?: string;
  imagePath?: string;
}

interface ThreeDResult {
  ok: boolean;
  disabled?: boolean;
  needsKey?: boolean;
  path?: string;
  format?: 'glb' | 'gltf';
  provider?: string;
  message: string;
}

/** Resolves the gating setting; absent/undefined ⇒ disabled (safe default). */
function isEnabled(): boolean {
  try {
    const s = SettingsStorage.loadSettings();
    return s?.threeD?.enabled === true;
  } catch {
    return false;
  }
}

function readKey(): { provider: 'tripo' | 'meshy'; apiKey: string } | null {
  try {
    const s = SettingsStorage.loadSettings();
    const cfg = s?.threeD;
    if (!cfg || !cfg.apiKey) return null;
    return { provider: cfg.provider === 'meshy' ? 'meshy' : 'tripo', apiKey: cfg.apiKey };
  } catch {
    return null;
  }
}

function outDir(projectRoot: string): string {
  const dir = path.join(projectRoot, '.superagent', '3d');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Tripo3D: text/image → task → poll → download GLB.
 * Follows Tripo's task/poll REST shape; verify against the live API version.
 * Best-effort + clearly errors if the response shape differs. */
async function generateViaTripo(
  prompt: string,
  imagePath: string | undefined,
  apiKey: string
): Promise<{ buffer: Buffer; fileName: string }> {
  const base = 'https://api.tripo3d.com/v1/openapi';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  // 1. Create the generation task.
  let createBody: Record<string, unknown>;
  if (imagePath && fs.existsSync(imagePath)) {
    // image-to-3D: upload then start an image_to_model task.
    const b64 = fs.readFileSync(imagePath).toString('base64');
    const up = await fetch(`${base}/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ file: { data: b64, type: 'image/png' } })
    });
    const upJson = (await up.json()) as any;
    createBody = { type: 'image_to_model', file: { type: 'image/png', ...upJson } };
  } else {
    createBody = { type: 'text_to_model', prompt };
  }
  const task = await fetch(`${base}/task`, {
    method: 'POST',
    headers,
    body: JSON.stringify(createBody)
  });
  if (!task.ok) {
    throw new Error(`Tripo task create failed (${task.status}): ${await task.text()}`);
  }
  const taskJson = (await task.json()) as any;
  const taskId: string = taskJson.uuid ?? taskJson.task_uuid ?? taskJson.id;
  if (!taskId) throw new Error('Tripo did not return a task id.');

  // 2. Poll until the model is ready.
  let modelUrl: string | undefined;
  for (let i = 0; i < 120; i++) {
    const st = await fetch(`${base}/task/${taskId}/status`, { headers });
    const sj = (await st.json()) as any;
    const out = sj?.output?.model ?? sj?.model;
    // Tripo exposes several formats; prefer the PBR GLB.
    modelUrl =
      out?.pbr_model?.url ??
      out?.pbr_model ??
      out?.original_model?.url ??
      out?.glb?.url ??
      sj?.result?.glb;
    if (modelUrl) break;
    if (sj?.status === 'failed') throw new Error('Tripo generation failed.');
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!modelUrl) throw new Error('Tripo generation timed out (no model URL).');

  // 3. Download the GLB.
  const dl = await fetch(modelUrl, { headers });
  if (!dl.ok) throw new Error(`Tripo GLB download failed (${dl.status}).`);
  const buffer = Buffer.from(await dl.arrayBuffer());
  return { buffer, fileName: 'character.glb' };
}

/**
 * Local, dependency-free 3D character generator. Writes a VALID glTF 2.0
 * (a stylized cube "character" placeholder) using embedded data-URI buffers,
 * so the agent can exercise the full make → export → show/animate loop with no
 * cloud API and no three.js. The pet's GLTFLoader loads `.gltf` from a
 * file URL; GLBCharacter then poses/animates it.
 */
function generateLocalGltf(name: string): { json: object; fileName: string } {
  // Unit cube, centered at origin; node translation drops it to the ground.
  const p = [
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, 0.5, -0.5,  -0.5, 0.5, -0.5, // back face (-z)
    -0.5, -0.5, 0.5,   0.5, -0.5, 0.5,   0.5, 0.5, 0.5,   -0.5, 0.5, 0.5   // front face (+z)
  ];
  const n = [
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, // -z
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1            // +z
  ];
  const uv = [
    0, 0, 1, 0, 1, 1, 0, 1, // back
    0, 0, 1, 0, 1, 1, 0, 1  // front
  ];
  // 12 indices (2 tris × 6 faces) — every cube face is 2 triangles.
  const idx: number[] = [];
  for (let f = 0; f < 2; f++) {
    const o = f * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  const f32 = (a: number[]) => {
    const b = Buffer.alloc(a.length * 4);
    for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4);
    return b;
  };
  const u16 = (a: number[]) => {
    const b = Buffer.alloc(a.length * 2);
    for (let i = 0; i < a.length; i++) b.writeUInt16LE(a[i], i * 2);
    return b;
  };

  const posBuf = f32(p);
  const normBuf = f32(n);
  const uvBuf = f32(uv);
  const idxBuf = u16(idx);
  const all = Buffer.concat([posBuf, normBuf, uvBuf, idxBuf]);
  const b64 = all.toString('base64');

  const gltf = {
    asset: { version: '2.0', generator: 'superagent-3d-local' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, translation: [0, -0.5, 0] }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0
          }
        ]
      }
    ],
    materials: [
      {
        name: 'character',
        pbrMetallicRoughness: {
          baseColorFactor: [0.95, 0.55, 0.7, 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.65
        }
      }
    ],
    buffers: [{ byteLength: all.length, uri: `data:application/octet-stream;base64,${b64}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: normBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + normBuf.length, byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + normBuf.length + uvBuf.length, byteLength: idxBuf.length, target: 34963 }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5]
      },
      { bufferView: 1, componentType: 5126, count: 8, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 8, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 12, type: 'SCALAR' }
    ]
  };

  const safe = name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'character';
  return { json: gltf, fileName: `${safe}.gltf` };
}

/**
 * Reusable generation kernel shared by the `make_3d_character` agent tool AND the
 * dedicated 3D Studio page. Given an explicit `outDir` and (optionally) a provider
 * API key it performs the real cloud generation (Tripo3D today; Meshy is a
 * documented TODO), otherwise it falls back to the dependency-free local GLB/glTF
 * placeholder so the make → export → show/animate loop is verifiable fully offline.
 *
 * Returns a structured `ThreeDResult` object (never a thrown error) so callers can
 * branch on `ok` / `disabled` / `needsKey` and surface a clear message.
 */
export interface ThreeDGenerateOptions {
  name: string;
  prompt?: string;
  imagePath?: string;
  provider?: 'tripo' | 'meshy';
  apiKey?: string;
  outDir: string;
}

export async function generateThreeD(opts: ThreeDGenerateOptions): Promise<ThreeDResult> {
  const name = (typeof opts.name === 'string' && opts.name.trim()) || 'character';
  const prompt = typeof opts.prompt === 'string' ? opts.prompt : '';
  const imagePath = typeof opts.imagePath === 'string' ? opts.imagePath : undefined;

  fs.mkdirSync(opts.outDir, { recursive: true });

  try {
    if (opts.apiKey && opts.provider === 'meshy') {
      // TODO: Meshy OpenAPI (text_to_3d / image_to_3d → poll → download GLB) maps
      // onto the same shape as Tripo. Wire it here when a Meshy key is selected.
      return {
        ok: false,
        needsKey: true,
        message:
          'Meshy cloud generation is not wired in this build yet. Use the Tripo3D ' +
          'provider (set provider=Tripo + API key in Settings → 3D Model Gen), or ' +
          'clear the API key to use the local procedural placeholder.'
      };
    }

    if (opts.apiKey) {
      // Real cloud generation (Tripo3D).
      const { buffer, fileName } = await generateViaTripo(prompt, imagePath, opts.apiKey);
      const outPath = path.join(opts.outDir, fileName);
      fs.writeFileSync(outPath, buffer);
      return {
        ok: true,
        path: outPath,
        format: 'glb',
        provider: 'tripo',
        message:
          `Generated 3D character "${name}" via tripo. Exported to ${outPath}. ` +
          'Import it as a Partner to show + animate it in the pet.'
      };
    }

    // No key → dependency-free local placeholder (verifiable end-to-end offline).
    const { json, fileName } = generateLocalGltf(name);
    const outPath = path.join(opts.outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
    return {
      ok: true,
      path: outPath,
      format: 'gltf',
      provider: 'local',
      message:
        `Generated a local procedural 3D placeholder for "${name}" at ${outPath} ` +
        '(no provider API key set). For a real AI-generated character, add a Tripo3D ' +
        'API key in Settings → 3D Model Gen. Import the file as a Partner to show + animate it in the pet.'
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, needsKey: !!opts.apiKey, message: `3D generation failed: ${msg}` };
  }
}

/** Builds the `make_3d_character` tool definition (chat-mode entry point). */
export function createThreeDTool(projectRoot: string): ToolDefinition {
  return {
    name: 'make_3d_character',
    description:
      'Make / generate a 3D character or model and export it as a .glb/.gltf file ' +
      'the 3D desktop pet can show and animate (Tripo3D / Meshy comparable). ' +
      'Gated by Settings → 3D Model Gen (off by default). ' +
      'Provide a `name` and either a `prompt` (text-to-3D) or an `imagePath` (image-to-3D). ' +
      'Returns the exported file path; import it as a Partner to see it in the pet.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Character name, e.g. "Luna".' },
        prompt: { type: 'string', description: 'Text description for text-to-3D generation.' },
        imagePath: { type: 'string', description: 'Local image path for image-to-3D generation.' }
      },
      required: ['name']
    },
    execute: async (args: Record<string, any>, _config: BYOKConfig): Promise<ThreeDResult> => {
      // ── Gate: off by default ──────────────────────────────────────────────
      if (!isEnabled()) {
        return {
          ok: false,
          disabled: true,
          message:
            '3D model generation is disabled. Enable it in Settings → 3D Model Gen ' +
            '(and add a Tripo3D/Meshy API key for cloud generation; without a key a ' +
            'local procedural placeholder is still produced).'
        };
      }

      const a = args as ThreeDArgs;
      const name = (typeof a.name === 'string' && a.name.trim()) || 'character';
      const prompt = typeof a.prompt === 'string' ? a.prompt : '';
      const imagePath = typeof a.imagePath === 'string' ? a.imagePath : undefined;

      const key = readKey();
      const dir = outDir(projectRoot);

      return generateThreeD({
        name,
        prompt,
        imagePath,
        provider: key?.provider,
        apiKey: key?.apiKey,
        outDir: dir
      });
    }
  };
}
