import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createEditorPlaybackHost,
  createRafScheduler,
} from "./playbackHost";
import { useEditorStore } from "./editorStore";
import { useProjectStore } from "./projectStore";
import { createProject } from "@/project/defaults";

beforeEach(() => {
  useProjectStore.setState({ project: createProject({ durationMs: 5000 }) });
  useEditorStore.setState({ playheadMs: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createEditorPlaybackHost", () => {
  it("reads the playhead from the editor store", () => {
    const host = createEditorPlaybackHost();
    useEditorStore.getState().setPlayhead(1234);
    expect(host.getPlayhead()).toBe(1234);
  });

  it("writes only the transient playhead — the project store is untouched", () => {
    const host = createEditorPlaybackHost();
    const project = useProjectStore.getState().project;

    host.setPlayhead(500);

    expect(useEditorStore.getState().playheadMs).toBe(500);
    expect(useProjectStore.getState().project).toBe(project);
  });

  it("reads the duration from the project store", () => {
    const host = createEditorPlaybackHost();
    expect(host.getDurationMs()).toBe(5000);
  });
});

describe("createRafScheduler", () => {
  it("returns a finite time from now()", () => {
    const scheduler = createRafScheduler();
    expect(Number.isFinite(scheduler.now())).toBe(true);
  });

  it("fires a scheduled frame exactly once under fake timers", () => {
    vi.useFakeTimers();
    const scheduler = createRafScheduler();
    const frames: number[] = [];

    scheduler.schedule((now) => frames.push(now));
    vi.advanceTimersByTime(20);

    expect(frames).toHaveLength(1);
    expect(Number.isFinite(frames[0])).toBe(true);
  });

  it("cancel prevents the scheduled frame from firing", () => {
    vi.useFakeTimers();
    const scheduler = createRafScheduler();
    const frames: number[] = [];

    const handle = scheduler.schedule((now) => frames.push(now));
    scheduler.cancel(handle);
    vi.advanceTimersByTime(100);

    expect(frames).toHaveLength(0);
  });
});
