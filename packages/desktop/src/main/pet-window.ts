import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PartnerManifest } from '../renderer/components/partner/types';
import {
  computeCenterPos,
  computeHomePos,
  computePetSize,
  lerpPos,
  type PetPos,
  type PetSize
} from './pet-geometry';

export type PetMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'happy'
  | 'celebrate'
  | 'sad'
  | 'sleeping';

/**
 * Owns the transparent, always-on-top "Partner" overlay window — a 3D desktop
 * pet. The window floats above everything (frameless + transparent). On launch
 * it appears centered, plays a one-time "hello" wave, then glides to the
 * top-right corner and rests there (it does NOT wander). The 3D character itself
 * is rendered by src/pet/entry.ts; this class handles the window, its intro
 * glide, drag, and relays mood/partner state from the app.
 */
export class PetWindowManager {
  private win: BrowserWindow | null = null;
  private partner: PartnerManifest | null = null;
  private modelPath: string | null = null;
  private vrmPath: string | null = null;
  private mood: PetMood = 'idle';
  private pos: PetPos = { x: 0, y: 0 };
  private size: PetSize = { width: 220, height: 320 };
  private homePos: PetPos = { x: 0, y: 0 };
  // The pet can be resized from a small companion up to the full screen.
  private readonly minWidth = 160;
  private readonly minHeight = 220;
  private dragging = false;

  // Intro choreography: the pet starts centered, waves "hello", then glides to
  // its docked home in the top-right corner and stays put.
  private introPhase: 'centered' | 'gliding' | 'home' = 'centered';
  private introFrom: PetPos = { x: 0, y: 0 };
  private introTo: PetPos = { x: 0, y: 0 };
  private introStart = 0;
  private introDurationMs = 1100;
  // Used to delay the glide until the "hello" has had a moment to play.
  private readonly helloHoldMs = 900;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private glideTimer: ReturnType<typeof setInterval> | null = null;

  // Idle → sleep → lay state machine (character poses; the window stays put).
  private readonly sleepAfterMs = 10 * 60 * 1000; // 10 min idle → sleeping
  private readonly layAfterMs = 30 * 60 * 1000;   // 30 min idle → laying lonely
  private idleSince = Date.now();
  private transientUntil = 0; // hold window for celebrate / sad / talking
  private behaviorState:
    | 'idle' | 'sleeping' | 'laying' | 'working' | 'walk' | 'celebrate' | 'sad' | 'poke' | 'talking' | 'hello'
    = 'idle';

  /** Set SUPERAGENT_DISABLE_PET=1 to turn the desktop pet off entirely. */
  get enabled(): boolean {
    return process.env.SUPERAGENT_DISABLE_PET !== '1';
  }

  /** True while the single pet overlay window is open. Only one may run at a time. */
  isRunning(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  /** Compute the size + docked home for the current primary display. */
  private measure(): void {
    const area = screen.getPrimaryDisplay().workAreaSize;
    this.size = computePetSize(area, this.minWidth, this.minHeight);
    this.homePos = computeHomePos(area, this.size);
  }

  /** Creates (once) and shows the pet overlay window. */
  create(): BrowserWindow | null {
    if (!this.enabled || this.win) return this.win;

    this.measure();
    const area = screen.getPrimaryDisplay().workAreaSize;
    // Start centered; the intro glide moves it to the top-right home.
    this.pos = computeCenterPos(area, this.size);
    // If the primary display changes later, re-derive the docked home too.
    this.introFrom = { ...this.pos };
    this.introTo = { ...this.homePos };

    this.win = new BrowserWindow({
      width: this.size.width,
      height: this.size.height,
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

    // Debug aid: SUPERAGENT_PET_DEBUG=1 forwards the pet renderer's console and
    // any crash to the main-process log, and opens its devtools. Invaluable when
    // the character fails to render (you'd otherwise only see the resize grip).
    if (process.env.SUPERAGENT_PET_DEBUG === '1') {
      this.win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        console.log(`[pet-renderer:${level}] ${message} (${sourceId}:${line})`);
      });
      this.win.webContents.on('render-process-gone', (_e, details) => {
        console.error('[pet-renderer] process gone:', details);
      });
      this.win.webContents.on('preload-error', (_e, preloadPath, error) => {
        console.error('[pet-renderer] preload error:', preloadPath, error);
      });
      this.win.webContents.openDevTools({ mode: 'detach' });
    }

    this.win.once('ready-to-show', () => this.win?.show());
    if (process.env.SUPERAGENT_PET_DEBUG === '1') {
      // Capture a screenshot of the pet a few seconds in, for visual debugging.
      setTimeout(() => {
        try {
          this.win?.webContents.capturePage().then((img: any) => {
            const out = require('path').join(require('os').tmpdir(), 'pet-screenshot.png');
            require('fs').writeFileSync(out, img.toPNG());
            console.log('[pet-debug] screenshot saved to', out);
          });
        } catch (e) {
          console.error('[pet-debug] screenshot failed', e);
        }
      }, 4000);
    }
    this.win.on('closed', () => {
      this.win = null;
      this.stopIntro();
      this.stopIdleWatch();
    });

    this.win.on('maximize', () => this.refreshHome());

    this.startIntro();
    this.startIdleWatch();
    return this.win;
  }

  /** Tears down the pet window. */
  destroy(): void {
    this.stopIntro();
    this.stopIdleWatch();
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
    if (b === 'celebrate' || b === 'sad' || b === 'talking' || b === 'hello') this.transientUntil = now + 4000;
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
    this.pos.x = Math.max(0, Math.min(area.width - this.size.width, this.pos.x - dx));
    this.pos.y = Math.max(0, Math.min(area.height - this.size.height, this.pos.y - dy));
    this.win.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
  }

  /** Resize from the corner grip. Anchors the bottom-left edge; clamps to min..screen. */
  private applyResizeDelta(dx: number, dy: number): void {
    if (!this.win) return;
    const area = screen.getPrimaryDisplay().workAreaSize;
    const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const newW = clampNum(this.size.width + dx, this.minWidth, area.width);
    const newH = clampNum(this.size.height + dy, this.minHeight, area.height);
    const growY = newH - this.size.height;
    this.size.width = newW;
    this.size.height = newH;
    // Keep the bottom edge fixed: growing taller moves the top up.
    this.pos.y = clampNum(this.pos.y - growY, 0, area.height - this.size.height);
    // Re-derive the docked home so a resize keeps the top-right anchor correct.
    this.homePos = computeHomePos(area, this.size);
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

  // ── Intro choreography ──────────────────────────────────────────────────────
  /**
   * Runs the launch sequence: show the pet centered, play a "hello" wave, then
   * glide to the docked top-right home. The glide is driven by a short interval
   * (it's a one-shot, so a timer — not a perpetual wander loop — is correct).
   */
  private startIntro(): void {
    if (!this.win) return;
    this.introPhase = 'centered';
    this.introFrom = { ...this.pos };
    this.introTo = { ...this.homePos };
    this.introStart = Date.now();

    // Greet immediately, then begin the glide after a short beat.
    this.win.webContents.send('pet-behavior', 'hello');
    this.introTimer = setTimeout(() => this.beginGlide(), this.helloHoldMs);
  }

  private beginGlide(): void {
    if (!this.win) return;
    this.introPhase = 'gliding';
    this.introStart = Date.now();
    this.glideTimer = setInterval(() => this.tickGlide(), 16);
  }

  private tickGlide(): void {
    if (!this.win || this.dragging) return;
    const t = Math.min(1, (Date.now() - this.introStart) / this.introDurationMs);
    this.pos = lerpPos(this.introFrom, this.introTo, t);
    this.win.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
    if (t >= 1) {
      this.stopGlide();
      this.introPhase = 'home';
      this.homePos = { ...this.pos };
      // Settle into a calm idle once the greeting is done.
      if (this.behaviorState === 'hello') {
        this.behaviorState = 'idle';
        this.idleSince = Date.now();
        this.win.webContents.send('pet-behavior', 'idle');
      }
    }
  }

  private stopGlide(): void {
    if (this.glideTimer) {
      clearInterval(this.glideTimer);
      this.glideTimer = null;
    }
  }

  /** Cancels every intro timer. Should be called on destroy/close. */
  private stopIntro(): void {
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
    this.stopGlide();
    this.introPhase = 'home';
  }

  /** Re-measures the docked home if the primary display changes. */
  private refreshHome(): void {
    const area = screen.getPrimaryDisplay().workAreaSize;
    // Recompute home for the current size.
    this.homePos = computeHomePos(area, this.size);
    // If the user hasn't dragged it away, also re-dock the live position.
    this.pos = { ...this.homePos };
    this.win?.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
  }

  // ── Idle → sleep → lay watcher (character poses only; the window stays put) ──
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  private startIdleWatch(): void {
    if (this.idleTimer) return;
    // Check a few times a minute — plenty for 10/30-minute thresholds.
    this.idleTimer = setInterval(() => this.tickIdle(), 15_000);
  }

  private stopIdleWatch(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Promotes idle → sleeping (after 10 min) → laying (after 30 min) and reverts
   * transient celebrate/sad/talking once their hold window elapses. This only
   * drives the character's in-place pose; the window does not move.
   */
  private tickIdle(): void {
    if (!this.win) return;
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
  }
}

/** Singleton used by main.ts. */
export const petWindowManager = new PetWindowManager();
