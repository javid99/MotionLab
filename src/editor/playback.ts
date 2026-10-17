/**
 * Playback controller (T10) — transport timing and state transitions only.
 * Plain TypeScript: no React, no Zustand, no direct DOM usage. All side
 * effects are injected through the `PlaybackHost` (transient playhead +
 * duration) and `FrameScheduler` (frame clock) abstractions, per the
 * contract in ARCHITECTURE.md ("Animation Evaluation & Playback Contract").
 *
 * ## Behavior (ADR-009, accepted)
 *
 * - **Play** starts (or resumes) from the current playhead and loops:
 *   when the playhead reaches `durationMs` it wraps to 0 and playback
 *   continues until paused or stopped.
 * - **Pause** cancels the pending frame; the playhead keeps its value.
 * - **Stop** cancels the pending frame and resets the playhead to 0.
 * - **Scrub** sets the playhead directly (clamped to `[0, durationMs]`) and
 *   pauses active playback; the user resumes with Play.
 * - **Dispose** cancels the pending frame and permanently disables the
 *   controller; it is idempotent.
 *
 * Each frame advances the playhead by the *elapsed* time reported by the
 * injected scheduler clock (never a fixed per-frame duration) and writes it
 * through `host.setPlayhead` only — the persistent project store is never
 * written during playback. At most one frame is scheduled at any time.
 * All timing derives from the injected `FrameScheduler.now()`, so playback
 * is fully deterministic under mocked schedulers (see TESTING.md,
 * "Determinism").
 */

export interface PlaybackHost {
  /** Current transient playhead in milliseconds. */
  getPlayhead(): number;
  /** Writes the transient playhead; must not touch persistent state. */
  setPlayhead(timeMs: number): void;
  /** Project duration in milliseconds. */
  getDurationMs(): number;
}

export interface FrameScheduler {
  /** Monotonic-ish wall clock in milliseconds (e.g. performance.now()). */
  now(): number;
  /** Requests the next frame; returns a handle for cancellation. */
  schedule(callback: (now: number) => void): number;
  /** Cancels a previously scheduled frame by handle. */
  cancel(handle: number): void;
}

export class PlaybackController {
  private readonly host: PlaybackHost;
  private readonly scheduler: FrameScheduler;
  private playing = false;
  private disposed = false;
  private frameHandle: number | null = null;
  private lastNow = 0;

  constructor(host: PlaybackHost, scheduler: FrameScheduler) {
    this.host = host;
    this.scheduler = scheduler;
  }

  /** Whether the transport is actively playing. */
  isPlaying(): boolean {
    return this.playing;
  }

  /** Starts or resumes looping playback from the current playhead. */
  play(): void {
    if (this.disposed || this.playing) {
      return;
    }
    if (!(this.host.getDurationMs() > 0)) {
      // Nothing to play; matches the model invariant durationMs > 0.
      return;
    }
    this.playing = true;
    this.lastNow = this.scheduler.now();
    this.scheduleFrame();
  }

  /** Cancels the pending frame; the playhead keeps its current value. */
  pause(): void {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.cancelPendingFrame();
  }

  /** Cancels the pending frame and resets the playhead to 0. */
  stop(): void {
    if (this.disposed) {
      return;
    }
    this.playing = false;
    this.cancelPendingFrame();
    this.host.setPlayhead(0);
  }

  /**
   * Sets the playhead directly (clamped to `[0, durationMs]`). Scrubbing
   * pauses active playback; the user resumes with Play.
   */
  scrub(timeMs: number): void {
    if (this.disposed) {
      return;
    }
    if (this.playing) {
      this.pause();
    }
    const duration = Math.max(0, this.host.getDurationMs());
    this.host.setPlayhead(Math.min(Math.max(timeMs, 0), duration));
  }

  /** Cancels the pending frame and disables the controller. Idempotent. */
  dispose(): void {
    this.disposed = true;
    this.playing = false;
    this.cancelPendingFrame();
  }

  private scheduleFrame(): void {
    if (this.frameHandle !== null) {
      // At most one pending frame at any time.
      return;
    }
    this.frameHandle = this.scheduler.schedule((now) => this.frame(now));
  }

  private cancelPendingFrame(): void {
    if (this.frameHandle !== null) {
      this.scheduler.cancel(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private frame(now: number): void {
    this.frameHandle = null;
    if (!this.playing || this.disposed) {
      return;
    }
    const elapsed = now - this.lastNow;
    this.lastNow = now;
    if (elapsed > 0) {
      const duration = this.host.getDurationMs();
      if (duration > 0) {
        let timeMs = this.host.getPlayhead() + elapsed;
        if (timeMs >= duration) {
          // ADR-009: wrap to 0 and keep playing (looping).
          timeMs = timeMs % duration;
        }
        this.host.setPlayhead(timeMs);
      }
    }
    this.scheduleFrame();
  }
}
