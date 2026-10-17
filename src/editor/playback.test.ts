import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  PlaybackController,
  type FrameScheduler,
  type PlaybackHost,
} from "./playback";
import { useEditorStore } from "./editorStore";
import { useProjectStore } from "./projectStore";
import { createProject } from "@/project/defaults";

/**
 * Deterministic frame scheduler: timestamps advance only when the test
 * calls `advance`, and the single pending frame fires then. Scheduling a
 * second frame while one is pending throws, proving the "at most one frame"
 * invariant.
 */
class FakeScheduler implements FrameScheduler {
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

function makeHost(durationMs = 5000): PlaybackHost {
  return {
    getPlayhead: () => useEditorStore.getState().playheadMs,
    setPlayhead: (timeMs) => useEditorStore.getState().setPlayhead(timeMs),
    getDurationMs: () => durationMs,
  };
}

/**
 * Host wired to the real singleton stores — used to prove the controller
 * never writes the persistent project store during playback frames.
 */
function makeLinkedHost(): PlaybackHost {
  return {
    getPlayhead: () => useEditorStore.getState().playheadMs,
    setPlayhead: (timeMs) => useEditorStore.getState().setPlayhead(timeMs),
    getDurationMs: () => useProjectStore.getState().project.durationMs,
  };
}

let scheduler: FakeScheduler;

beforeEach(() => {
  scheduler = new FakeScheduler();
  useProjectStore.setState({ project: createProject({ durationMs: 5000 }) });
  useEditorStore.setState({ playheadMs: 0, selectedElementId: null });
});

describe("PlaybackController — start and progression", () => {
  it("starts playing and schedules exactly one frame", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();

    expect(controller.isPlaying()).toBe(true);
    expect(scheduler.hasPendingFrame).toBe(true);
    expect(scheduler.scheduledHandles).toHaveLength(1);
  });

  it("advances the playhead by exactly the injected elapsed deltas", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();

    scheduler.advance(100);
    expect(useEditorStore.getState().playheadMs).toBe(100);
    scheduler.advance(50);
    expect(useEditorStore.getState().playheadMs).toBe(150);
    scheduler.advance(25);
    expect(useEditorStore.getState().playheadMs).toBe(175);
  });

  it("is deterministic — the same sequence yields the same playhead", () => {
    const run = (): number => {
      useEditorStore.setState({ playheadMs: 0 });
      const controller = new PlaybackController(makeHost(), scheduler);
      controller.play();
      for (const delta of [100, 200, 300, 400]) {
        scheduler.advance(delta);
      }
      controller.pause();
      return useEditorStore.getState().playheadMs;
    };
    expect(run()).toBe(run());
  });

  it("ignores non-monotonic scheduler time (negative elapsed)", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(100);
    scheduler.advance(-500);

    expect(useEditorStore.getState().playheadMs).toBe(100);
    expect(controller.isPlaying()).toBe(true);
  });
});

describe("PlaybackController — looping (ADR-009)", () => {
  it("wraps to 0 and keeps playing when reaching the duration", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(5000);

    expect(useEditorStore.getState().playheadMs).toBe(0);
    expect(controller.isPlaying()).toBe(true);
    expect(scheduler.hasPendingFrame).toBe(true);
  });

  it("wraps with overshoot, carrying the remainder", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.scrub(4900);
    controller.play();
    scheduler.advance(300);

    expect(useEditorStore.getState().playheadMs).toBe(200); // 4900 + 300 − 5000
    expect(controller.isPlaying()).toBe(true);
  });

  it("handles multiple wraps across long advances", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();

    scheduler.advance(5200); // 5000 + 200 → wraps once
    expect(useEditorStore.getState().playheadMs).toBe(200);

    scheduler.advance(14800); // three more full loops + 4800
    expect(useEditorStore.getState().playheadMs).toBe(0); // 200 + 14800 = 15000 ≡ 0
  });
});

describe("PlaybackController — pause and resume", () => {
  it("pause retains the playhead and cancels the pending frame once", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(1200); // frame fires → controller re-schedules
    controller.pause();

    expect(controller.isPlaying()).toBe(false);
    expect(scheduler.hasPendingFrame).toBe(false);
    // Exactly one cancellation: the frame pending at pause time.
    expect(scheduler.cancelledHandles).toEqual([scheduler.scheduledHandles[1]]);
    expect(useEditorStore.getState().playheadMs).toBe(1200);
  });

  it("resume continues from the retained playhead", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(1000);
    controller.pause();
    controller.play();
    scheduler.advance(500);

    expect(useEditorStore.getState().playheadMs).toBe(1500);
  });

  it("repeated pause calls are safe", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(100);
    controller.pause();
    controller.pause();
    controller.pause();

    expect(scheduler.cancelledHandles).toHaveLength(1);
    expect(controller.isPlaying()).toBe(false);
  });
});

describe("PlaybackController — stop", () => {
  it("stop resets the playhead to zero and cancels the frame", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(3000);
    controller.stop();

    expect(controller.isPlaying()).toBe(false);
    expect(scheduler.hasPendingFrame).toBe(false);
    expect(useEditorStore.getState().playheadMs).toBe(0);
  });

  it("stop while idle resets a scrubbed playhead and is safe to repeat", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.scrub(2500);
    controller.stop();
    controller.stop();

    expect(useEditorStore.getState().playheadMs).toBe(0);
    expect(scheduler.scheduledHandles).toHaveLength(0);
  });
});

describe("PlaybackController — scrubbing", () => {
  it("scrub sets the playhead directly while paused", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.scrub(2500);

    expect(useEditorStore.getState().playheadMs).toBe(2500);
    expect(scheduler.scheduledHandles).toHaveLength(0);
  });

  it("scrub pauses active playback and clamps to [0, durationMs]", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    scheduler.advance(500);
    controller.scrub(-5);

    expect(controller.isPlaying()).toBe(false);
    expect(useEditorStore.getState().playheadMs).toBe(0);

    controller.play();
    controller.scrub(9999);
    expect(useEditorStore.getState().playheadMs).toBe(5000);
  });

  it("play after scrub resumes from the scrubbed position", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.scrub(2500);
    controller.play();
    scheduler.advance(500);

    expect(useEditorStore.getState().playheadMs).toBe(3000);
  });
});

describe("PlaybackController — scheduling invariants", () => {
  it("prevents duplicate loops when play is called repeatedly", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    const schedulesAfterFirstPlay = scheduler.scheduledHandles.length;

    controller.play();
    controller.play();

    expect(scheduler.scheduledHandles).toHaveLength(schedulesAfterFirstPlay);
    scheduler.advance(100);
    expect(scheduler.scheduledHandles).toHaveLength(schedulesAfterFirstPlay + 1);
    expect(useEditorStore.getState().playheadMs).toBe(100);
  });

  it("refuses to play a zero or negative duration", () => {
    useProjectStore.setState({ project: createProject({ durationMs: 0 }) });
    const controller = new PlaybackController(makeLinkedHost(), scheduler);
    controller.play();

    expect(controller.isPlaying()).toBe(false);
    expect(scheduler.scheduledHandles).toHaveLength(0);
  });
});

describe("PlaybackController — dispose", () => {
  it("cancels the pending frame exactly once and is idempotent", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.play();
    const handle = scheduler.pendingFrameHandle as number;
    controller.dispose();
    controller.dispose();

    expect(scheduler.cancelledHandles).toEqual([handle]);
    expect(controller.isPlaying()).toBe(false);
  });

  it("makes play, scrub, and stop no-ops after disposal", () => {
    const controller = new PlaybackController(makeHost(), scheduler);
    controller.dispose();

    controller.play();
    controller.scrub(1000);
    controller.stop();

    expect(scheduler.scheduledHandles).toHaveLength(0);
    expect(useEditorStore.getState().playheadMs).toBe(0);
  });
});

describe("PlaybackController — project store isolation", () => {
  it("never writes the persistent project store during playback frames", () => {
    const project = useProjectStore.getState().project;
    const controller = new PlaybackController(makeLinkedHost(), scheduler);
    controller.play();

    for (const delta of [100, 250, 333, 421, 5000]) {
      scheduler.advance(delta);
    }

    expect(useProjectStore.getState().project).toBe(project);
    expect(useEditorStore.getState().playheadMs).toBe(
      (100 + 250 + 333 + 421 + 5000) % 5000,
    );
  });
});

describe("PlaybackController — import hygiene (architecture constraint)", () => {
  it("contains no imports and never uses React, Zustand, or the DOM", () => {
    // The controller is deliberately import-free: all side effects are
    // injected via PlaybackHost + FrameScheduler. Comments are stripped
    // before scanning so prose mentions don't count as usage.
    const source = readFileSync("src/editor/playback.ts", "utf8");
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source.match(/^import /gm)).toBeNull();
    expect(withoutComments).not.toMatch(/react|zustand/i);
    expect(withoutComments).not.toMatch(
      /window\.|document\.|requestAnimationFrame|performance\./,
    );
  });
});
