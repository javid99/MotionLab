import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TimelineStrip from "./TimelineStrip";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import { FakeScheduler } from "../../../tests/helpers/fakeScheduler";
import type { Project } from "@/project/model";

function makeProject(): Project {
  return createProject({
    durationMs: 5000,
    elements: [
      createElement("rect", {
        name: "Box",
        transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 },
        keyframes: [
          createKeyframe("x", 1000, 10),
          createKeyframe("x", 3000, 30),
          createKeyframe("opacity", 2000, 0.5),
        ],
      }),
    ],
  });
}

function resetStores(project: Project = makeProject()): void {
  useProjectStore.setState({ project });
  useEditorStore.setState({ playheadMs: 0, selectedElementId: null });
}

beforeEach(() => resetStores());

function pointer(
  type: "pointerdown" | "pointermove" | "pointerup",
  target: Element,
  x: number,
  y = 0,
): void {
  fireEvent(target, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

/** jsdom rects are all-zero; mock a 1000px-wide lane for deterministic mapping. */
function mockLaneRects(container: HTMLElement, width = 1000, left = 0): void {
  const targets = [
    container.querySelector('[data-testid="time-ruler"]'),
    ...container.querySelectorAll("[data-lane]"),
  ].filter((el): el is Element => el !== null);
  for (const el of targets) {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left,
      top: 0,
      right: left + width,
      bottom: 20,
      width,
      height: 20,
      x: left,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }
}

function xLane(container: HTMLElement): Element {
  const lane = container.querySelector(
    '[data-lane][data-property="x"]',
  );
  if (!lane) throw new Error("x lane not rendered");
  return lane;
}

describe("TimelineStrip — static structure", () => {
  it("renders the ruler, readout, and playback controls", () => {
    render(<TimelineStrip />);

    expect(screen.getByTestId("time-ruler")).toBeInTheDocument();
    expect(screen.getByTestId("playhead-readout")).toHaveTextContent(
      "0 / 5000 ms",
    );
    for (const label of ["Play", "Pause", "Stop"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders a lane per animatable property with keyframe diamonds positioned by time", () => {
    const { container } = render(<TimelineStrip />);

    const lanes = container.querySelectorAll("[data-lane]");
    expect(lanes).toHaveLength(6); // ANIMATABLE_PROPERTIES per element

    const rect = container.querySelector('[data-testid="playhead-readout"]');
    expect(rect).toBeInTheDocument();
    // x@1000/5000 → 20%, x@3000/5000 → 60%, opacity@2000/5000 → 40%.
    const diamonds = [...container.querySelectorAll("[data-keyframe-id]")];
    const lefts = diamonds.map((d) => (d as HTMLElement).style.left);
    expect(lefts).toEqual(["20%", "60%", "40%"]);
  });

  it("renders the empty state for a project without elements", () => {
    resetStores(createProject());
    render(<TimelineStrip />);

    expect(screen.getByText("No keyframes yet.")).toBeInTheDocument();
    expect(screen.getByTestId("playhead-readout")).toHaveTextContent(
      "0 / 5000 ms",
    );
  });

  it("reflects the current playhead position and value", () => {
    useEditorStore.setState({ playheadMs: 1250 });
    render(<TimelineStrip />);

    expect(screen.getByTestId("playhead-readout")).toHaveTextContent(
      "1250 / 5000 ms",
    );
    expect(screen.getByTestId("playhead-line").style.left).toBe("25%");
  });
});

describe("TimelineStrip — scrubbing", () => {
  it("scrubs via pointer down and drag on the ruler (Scrub semantics)", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const ruler = screen.getByTestId("time-ruler");
    const project = useProjectStore.getState().project;

    pointer("pointerdown", ruler, 250); // 0.25 → 1250 ms
    expect(useEditorStore.getState().playheadMs).toBe(1250);

    pointer("pointermove", ruler, 500); // 0.5 → 2500 ms
    expect(useEditorStore.getState().playheadMs).toBe(2500);

    pointer("pointerup", ruler, 0);
    pointer("pointermove", ruler, 999); // scrub drag ended → no further updates
    expect(useEditorStore.getState().playheadMs).toBe(2500);
    // Persistent project data untouched by scrubbing.
    expect(useProjectStore.getState().project).toBe(project);
  });

  it("clamps scrubbing to [0, durationMs]", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const ruler = screen.getByTestId("time-ruler");

    pointer("pointerdown", ruler, -100);
    expect(useEditorStore.getState().playheadMs).toBe(0);

    pointer("pointermove", ruler, 5000);
    expect(useEditorStore.getState().playheadMs).toBe(5000);
  });

  it("scrubbing pauses active playback", () => {
    const scheduler = new FakeScheduler();
    const { container } = render(<TimelineStrip scheduler={scheduler} />);
    mockLaneRects(container);
    const ruler = screen.getByTestId("time-ruler");

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(scheduler.hasPendingFrame).toBe(true);
    pointer("pointerdown", ruler, 250);

    expect(scheduler.hasPendingFrame).toBe(false);
    expect(useEditorStore.getState().playheadMs).toBe(1250);
  });
});

describe("TimelineStrip — transport controls", () => {
  it("play schedules frames and advances the playhead; pause and stop work", () => {
    const scheduler = new FakeScheduler();
    const project = useProjectStore.getState().project;
    render(<TimelineStrip scheduler={scheduler} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(scheduler.hasPendingFrame).toBe(true);
    scheduler.advance(1000);
    expect(useEditorStore.getState().playheadMs).toBe(1000);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(scheduler.hasPendingFrame).toBe(false);
    expect(useEditorStore.getState().playheadMs).toBe(1000);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    scheduler.advance(500);
    expect(useEditorStore.getState().playheadMs).toBe(1500);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(useEditorStore.getState().playheadMs).toBe(0);
    // Playback frames never write the persistent project document.
    expect(useProjectStore.getState().project).toBe(project);
  });

  it("repeated play does not create concurrent loops", () => {
    const scheduler = new FakeScheduler();
    render(<TimelineStrip scheduler={scheduler} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const scheduled = scheduler.scheduledHandles.length;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(scheduler.scheduledHandles).toHaveLength(scheduled);
  });

  it("disposes the controller on unmount, cancelling the pending frame", () => {
    const scheduler = new FakeScheduler();
    const { unmount } = render(<TimelineStrip scheduler={scheduler} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    unmount();

    expect(scheduler.hasPendingFrame).toBe(false);
    expect(scheduler.cancelledHandles).toHaveLength(1);
  });
});

describe("TimelineStrip — keyframe editing", () => {
  it("adds a keyframe on lane click with the current evaluated value", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const before = useProjectStore.getState().project;
    const lane = xLane(container);

    // x track has keyframes at 1000 and 3000; click the empty area at 0.5.
    pointer("pointerdown", lane, 500);

    const track = useProjectStore
      .getState()
      .project.elements[0].keyframes.filter((k) => k.property === "x");
    expect(track).toHaveLength(3);
    const added = track.find((k) => k.timeMs === 2500);
    expect(added).toBeDefined();
    expect(added?.value).toBe(25); // x at 2500 ms: 10 + (30−10)·0.75
    // One committed change: one new keyframe on top of the previous document.
    expect(
      useProjectStore.getState().project.elements[0].keyframes,
    ).toHaveLength(before.elements[0].keyframes.length + 1);
  });

  it("does not duplicate a keyframe when clicking an occupied time", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const lane = xLane(container);

    pointer("pointerdown", lane, 100); // 0.1 → 500 ms (empty) → added
    pointer("pointerdown", lane, 100); // 500 ms now occupied → rejected

    const track = useProjectStore
      .getState()
      .project.elements[0].keyframes.filter((k) => k.property === "x");
    expect(track.map((k) => k.timeMs)).toEqual([500, 1000, 3000]);
  });

  it("moves a keyframe on drag and commits once on pointer up", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const lane = xLane(container);
    const diamond = container.querySelector(
      '[data-testid^="keyframe-"]',
    ) as HTMLElement;
    const keyframeId = diamond.dataset.keyframeId as string;
    const storeKeyframe = () =>
      useProjectStore
        .getState()
        .project.elements[0].keyframes.find((k) => k.id === keyframeId);

    pointer("pointerdown", diamond, 100); // grab the keyframe at 1000 ms
    pointer("pointermove", lane, 400); // drag to 0.4 → 2000 ms

    // In-flight: store untouched until commit.
    expect(storeKeyframe()?.timeMs).toBe(1000);
    // Visual preview follows the drag.
    expect(diamond.style.left).toBe("40%");

    pointer("pointerup", lane, 0);

    expect(storeKeyframe()?.timeMs).toBe(2000);
    expect(storeKeyframe()?.value).toBe(10);
    const track = useProjectStore
      .getState()
      .project.elements[0].keyframes.filter((k) => k.property === "x");
    expect(track.map((k) => k.timeMs)).toEqual([2000, 3000]);
  });

  it("rejects moves onto occupied times without changing the store", () => {
    const { container } = render(<TimelineStrip />);
    mockLaneRects(container);
    const lane = xLane(container);
    const diamonds = [
      ...container.querySelectorAll("[data-keyframe-id]"),
    ] as HTMLElement[];
    const first = diamonds[0]; // x @ 1000
    const before = useProjectStore.getState().project;

    pointer("pointerdown", first, 100);
    pointer("pointermove", lane, 600); // 0.6 → 3000 ms — occupied by the other x keyframe
    pointer("pointerup", lane, 0);

    expect(useProjectStore.getState().project).toBe(before);
  });
});
