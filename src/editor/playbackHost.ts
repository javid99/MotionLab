import type { FrameScheduler, PlaybackHost } from "./playback";
import { useEditorStore } from "./editorStore";
import { useProjectStore } from "./projectStore";

/**
 * Editor-layer playback adapter (T11): wires the T10 `PlaybackController` to
 * the documented host and frame-scheduler interfaces. This is the only
 * module coupling playback to the stores and browser scheduling — the
 * controller itself stays import-free.
 */

/** Host reading/writing the transient playhead and the project duration. */
export function createEditorPlaybackHost(): PlaybackHost {
  return {
    getPlayhead: () => useEditorStore.getState().playheadMs,
    setPlayhead: (timeMs) => useEditorStore.getState().setPlayhead(timeMs),
    getDurationMs: () => useProjectStore.getState().project.durationMs,
  };
}

/**
 * Default `FrameScheduler` backed by `requestAnimationFrame` with a
 * `setTimeout` fallback (e.g. non-visual test environments). Time comes
 * from `performance.now()`.
 */
export function createRafScheduler(): FrameScheduler {
  const hasRaf =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function";

  return {
    now: () => performance.now(),
    schedule: (callback) => {
      if (hasRaf) {
        return window.requestAnimationFrame((now) => callback(now));
      }
      return window.setTimeout(() => callback(performance.now()), 16);
    },
    cancel: (handle) => {
      if (hasRaf) {
        window.cancelAnimationFrame(handle);
        return;
      }
      window.clearTimeout(handle);
    },
  };
}
