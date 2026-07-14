import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PartnerManifest } from '../renderer/components/partner/types';

export type PetMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'happy'
  | 'celebrate'
  | 'sad'
  | 'sleeping';

/**
 * Owns the transparent, always-on-top "Partner" overlay window — a free-roaming
 * 3D desktop pet. The window floats above everything (frameless + transparent)
 * and wanders across the bottom of the screen, bouncing off the edges. The 3D
 * character itself is rendered by src/pet/entry.ts; this class handles the
 * window, its movement, drag, and relays mood/partner state from the app.
 */
export class PetWindowManager {
  private win: BrowserWindow | null = null;
  private partner: PartnerManifest | null = null;
  private modelPath: string | null = null;
  private vrmPath: string | null = null;
  private mood: PetMood = 'idle';
  private pos = { x: 0, y: 0 };
  // The pet can be resized from a small companion up to the full screen.
  private width = 220;
  private height = 320;
  private readonly minWidth = 160;
  private readonly minHeight = 220;
  private readonly velocity = 0.6;
  private vx = 1;
  private vy = 1;
  private dragging = false;
  private wanderTimer: ReturnType<typeof setInterval> | null = null;

  // Idle → sleep → lay state machine.
  private readonly sleepAfterMs = 10 * 60 * 1000; // 10 min idle → sleeping
  private readonly layAfterMs = 30 * 60 * 1000;   // 30 min idle → laying lonely
  private idleSince = Date.now();
  private transientUntil = 0; // hold window for celebrate / sad / talking
  private behaviorState:
    | 'idle' | 'sleeping' | 'laying' | 'working' | 'walk' | 'celebrate' | 'sad' | 'poke' | 'talking'
    = 'idle';

  /** Set SUPERAGENT_DISABLE_PET=1 to turn the desktop pet off entirely. */
  get enabled(): boolean {
    return process.env.SUPERAGENT_DISABLE_PET !== '1';
  }

  /** True while the single pet overlay window is open. Only one may run at a time. */
  isRunning(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  /** Creates (once) and shows the pet overlay window. */
  create(): BrowserWindow | null {
    if (!this.enabled || this.win) return this.win;

    const area = screen.getPrimaryDisplay().workAreaSize;
    this.pos = { x: area.width - this.width - 48, y: area.height - this.height - 48 };

    this.win = new BrowserWindow({
      width: this.width,
      height: this.height,
      x: this.pos.x,
      y: this.pos.y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false, // we resize manually via setBounds from the grip
      hasShadow: false,
      focusable: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: true
      }
    });

    this.win.loadFile(this.resolvePetHtml());

    this.win.once('ready-to-show', () => this.win?.show());
    this.win.on('closed', () => {
      this.win = null;
      this.stopWander();
    });

    this.startWander();
    return this.win;
  }

  /** Tears down the pet window. */
  destroy(): void {
    this.stopWander();
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }

  setVisible(visible: boolean): void {
    if (!this.win) return;
    if (visible) this.win.show();
    else this.win.hide();
  }

  /**
   * Resolves the pet overlay HTML across build layouts. `pet-window.js` runs
   * from `dist/main/`, but the build copies `pet.html` to `dist/pet.html`, so a
   * naive `__dirname/pet.html` misses it. We probe the known candidates and use
   * the first that exists (dynamic so it survives either layout).
   */
  private resolvePetHtml(): string {
    const candidates = [
      path.join(__dirname, '..', 'pet.html'), // dist/pet.html  (current build)
      path.join(__dirname, 'pet.html'),       // dist/main/pet.html (future/co-located)
      path.join(process.cwd(), 'dist', 'pet.html')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    // Fall back to the conventional location; Electron will log if missing.
    return candidates[0];
  }

  /**
   * Stores and forwards the active Partner manifest (plus the resolved absolute
   * paths to its 3D model / VRM, if any) to the renderer. The renderer loads a
   * `.vrm` when present, else falls back to the procedural waifu.
   */
  setPartner(partner: PartnerManifest | null, modelPath: string | null = null, vrmPath: string | null = null): void {
    this.partner = partner || null;
    this.modelPath = modelPath;
    this.vrmPath = vrmPath;
    this.win?.webContents.send('pet-partner', this.buildPayload());
  }

  /** Merges the manifest with the resolved absolute model paths for the renderer. */
  private buildPayload(): Record<string, unknown> | null {
    if (!this.partner) return null;
    return { ...this.partner, modelPath: this.modelPath, vrmPath: this.vrmPath };
  }

  /** Stores and forwards the current mood, driving behavior + idle timers. */
  setMood(mood: PetMood): void {
    this.mood = mood;
    // Renderer only acts on these four; working/thinking share the "working" pose.
    const forward = mood === 'thinking' ? 'working' : mood;
    if (forward === 'working' || forward === 'idle' || forward === 'celebrate' || forward === 'sad') {
      this.win?.webContents.send('pet-mood', forward);
    }
    this.setBehaviorState(forward);
  }

  /** Central place to record a behavior change and keep idle timers coherent. */
  private setBehaviorState(b: string): void {
    this.behaviorState = b as any;
    const now = Date.now();
    if (b === 'working' || b === 'idle') this.idleSince = now;
    if (b === 'sleeping') this.idleSince = now - this.sleepAfterMs - 1;
    if (b === 'laying') this.idleSince = now - this.layAfterMs - 1;
    if (b === 'celebrate' || b === 'sad' || b === 'talking') this.transientUntil = now + 4000;
  }

  /** Maps a raw agent-event type to a pet mood. */
  moodFromAgentEvent(type?: string): PetMood | null {
    switch (type) {
      case 'token':
        return 'thinking';
      case 'tool_call':
      case 'tool_result':
        return 'working';
      case 'done':
        return 'celebrate';
      case 'error':
      case 'abort':
        return 'sad';
      default:
        return null;
    }
  }

  // ── IPC plumbing from the pet renderer ──────────────────────────────────
  handleRendererMessage(channel: string, payload: any): void {
    switch (channel) {
      case 'pet-ready':
        // The renderer just loaded — push current state.
        if (this.partner) this.win?.webContents.send('pet-partner', this.buildPayload());
        this.win?.webContents.send('pet-mood', this.mood);
        break;
      case 'pet-drag-start':
        this.dragging = true;
        break;
      case 'pet-drag-delta':
        this.applyDragDelta(payload?.dx ?? 0, payload?.dy ?? 0);
        break;
      case 'pet-drag-end':
        this.dragging = false;
        break;
      case 'pet-resize-delta':
        // Grip drag: dx = grow right, dy = grow up (renderer flips screen-y).
        this.applyResizeDelta(payload?.dx ?? 0, payload?.dy ?? 0);
        break;
      case 'pet-behavior':
        // Renderer drives walk (right-drag) / talking locally; keep timers coherent.
        this.setBehaviorState(payload);
        break;
      default:
        break;
    }
  }

  /** Called from the app shell to push the active Partner (desktop only). */
  setPartnerFromApp(partner: PartnerManifest | null, modelPath: string | null = null): void {
    this.setPartner(partner, modelPath);
  }

  private applyDragDelta(dx: number, dy: number): void {
    if (!this.win) return;
    const area = screen.getPrimaryDisplay().workAreaSize;
    this.pos.x = Math.max(0, Math.min(area.width - this.width, this.pos.x - dx));
    this.pos.y = Math.max(0, Math.min(area.height - this.height, this.pos.y - dy));
    this.win.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
  }

  /** Resize from the corner grip. Anchors the bottom-left edge; clamps to min..screen. */
  private applyResizeDelta(dx: number, dy: number): void {
    if (!this.win) return;
    const area = screen.getPrimaryDisplay().workAreaSize;
    const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const newW = clampNum(this.width + dx, this.minWidth, area.width);
    const newH = clampNum(this.height + dy, this.minHeight, area.height);
    const growY = newH - this.height;
    this.width = newW;
    this.height = newH;
    // Keep the bottom edge fixed: growing taller moves the top up.
    this.pos.y = clampNum(this.pos.y - growY, 0, area.height - this.height);
    this.win.setBounds({
      x: Math.round(this.pos.x),
      y: Math.round(this.pos.y),
      width: Math.round(newW),
      height: Math.round(newH)
    });
  }

  /** Shows a dialogue + plays a sound (agent "needs input"). */
  say(text: string): void {
    this.win?.webContents.send('pet-say', { text });
    this.setBehaviorState('talking');
  }

  /** Drives the dark-circles look from context-window usage (pct in 0..1). */
  setContext(pct: number): void {
    this.win?.webContents.send('pet-context', { pct });
  }

  private startWander(): void {
    if (this.wanderTimer) return;
    this.wanderTimer = setInterval(() => this.tick(), 33);
  }

  private stopWander(): void {
    if (this.wanderTimer) {
      clearInterval(this.wanderTimer);
      this.wanderTimer = null;
    }
  }

  /**
   * Per-tick: (1) revert transient celebrate/sad/talking; (2) promote idle →
   * sleeping (after 10 min) → laying (after 30 min); (3) gentle roam for active
   * behaviors, stand still otherwise.
   */
  private tick(): void {
    if (!this.win || this.dragging) return;
    const area = screen.getPrimaryDisplay().workAreaSize;
    const now = Date.now();

    // Revert transient behaviors once their hold window elapses.
    if (now > this.transientUntil &&
        (this.behaviorState === 'celebrate' || this.behaviorState === 'sad' || this.behaviorState === 'talking')) {
      this.behaviorState = 'idle';
      this.idleSince = now;
      this.win.webContents.send('pet-behavior', 'idle');
    }

    // Idle family: sleep/lay by elapsed idle time.
    if (this.behaviorState === 'idle' || this.behaviorState === 'sleeping' || this.behaviorState === 'laying') {
      const idle = now - this.idleSince;
      let want: string = 'idle';
      if (idle > this.layAfterMs) want = 'laying';
      else if (idle > this.sleepAfterMs) want = 'sleeping';
      if (want !== this.behaviorState) {
        this.behaviorState = want as any;
        this.win.webContents.send('pet-behavior', want);
      }
    }

    // Roam only for lively behaviors (walk is drag-driven, so it's excluded).
    const minX = 0;
    const maxX = area.width - this.width;
    const minY = 0;
    const maxY = area.height - this.height;
    let speed = 0;
    if (this.behaviorState === 'working') speed = this.velocity * 3.2;
    else if (this.behaviorState === 'idle') speed = this.velocity * 0.8;
    else if (this.behaviorState === 'celebrate') speed = this.velocity * 1.6;

    if (speed > 0) {
      this.pos.x += this.vx * speed;
      this.pos.y += this.vy * speed * 0.6;
      if (this.pos.x <= minX) { this.pos.x = minX; this.vx = 1; }
      else if (this.pos.x >= maxX) { this.pos.x = maxX; this.vx = -1; }
      if (this.pos.y <= minY) { this.pos.y = minY; this.vy = 1; }
      else if (this.pos.y >= maxY) { this.pos.y = maxY; this.vy = -1; }
      this.win.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
    }
  }
}

/** Singleton used by main.ts. */
export const petWindowManager = new PetWindowManager();
