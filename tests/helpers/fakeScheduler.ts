import type { FrameScheduler } from "@/editor/playback";

/**
 * Deterministic frame scheduler shared by playback tests: timestamps
 * advance only when the test calls `advance`, and the single pending frame
 * fires then. Scheduling a second frame while one is pending throws,
 * proving the "at most one frame" invariant.
 */
export class FakeScheduler implements FrameScheduler {
  private currentNow = 0;
  private pendingCallback: ((now: number) => void) | null = null;
  private pendingHandle: number | null = null;
  private nextHandle = 1;

  readonly scheduledHandles: number[] = [];
  readonly cancelledHandles: number[] = [];

  now(): number {
    return this.currentNow;
  }

  schedule(callback: (now: number) => void): number {
    if (this.pendingCallback) {
      throw new Error("a frame is already scheduled");
    }
    this.pendingCallback = callback;
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.pendingHandle = handle;
    this.scheduledHandles.push(handle);
    return handle;
  }

  cancel(handle: number): void {
    this.cancelledHandles.push(handle);
    if (this.pendingHandle === handle) {
      this.pendingCallback = null;
      this.pendingHandle = null;
    }
  }

  get hasPendingFrame(): boolean {
    return this.pendingCallback !== null;
  }

  get pendingFrameHandle(): number | null {
    return this.pendingHandle;
  }

  /** Advances the clock by deltaMs and fires the pending frame, if any. */
  advance(deltaMs: number): void {
    this.currentNow += deltaMs;
    const callback = this.pendingCallback;
    this.pendingCallback = null;
    this.pendingHandle = null;
    if (callback) {
      callback(this.currentNow);
    }
  }
}
