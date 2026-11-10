import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "@/components/editor/EditorPage";
import CanvasPlaceholder from "@/components/editor/CanvasPlaceholder";
import TimelineStrip from "@/components/editor/TimelineStrip";
import EditorToolbar from "@/components/editor/EditorToolbar";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { evaluate } from "@/engine/evaluator";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import type { Project } from "@/project/model";
import { FakeScheduler } from "./helpers/fakeScheduler";

/**
 * Cross-cutting editor workflow (jsdom, not a browser e2e):
 * - Issue A: text content editing → canvas → Save → reload.
 * - Issue B: property keyframe → playhead move → value edit → second
 *   keyframe → interpolation during playback → Save → reload.
 *
 * Persistence goes through the real IndexedDB repository (fake-indexeddb);
 * editor navigation is mocked because Next.js App Router context is not
 * available in jsdom.
 */

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function resetStores(project: Project = createProject()): void {
  useProjectStore.setState({ project });
  useEditorStore.setState({ selectedElementId: null, playheadMs: 0 });
}

function elementNode(id: string): Element {
  // Scope to the rendered SVG: timeline lanes also carry `data-element-id`.
  const el = document.querySelector(
    `[data-testid="scene-svg"] [data-element-id="${id}"]`,
  );
  if (!el) throw new Error(`element ${id} not rendered`);
  return el;
}

beforeEach(() => {
  navigation.search = "";
  resetStores();
});

describe("editor workflow — text content editing and persistence", () => {
  it("edits text, shows it on the canvas, and survives Save + reload", async () => {
    const editor = render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add text element" }));
    fireEvent.change(screen.getByLabelText("Content"), {
      target: { value: "MotionLab intro" },
    });

    const textId = useProjectStore.getState().project.elements[0].id;
    expect(elementNode(textId).textContent).toBe("MotionLab intro");

    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(await screen.findByTestId("save-state")).toHaveTextContent("Saved");
    const projectId = useProjectStore.getState().project.id;
    editor.unmount();

    navigation.search = `id=${projectId}`;
    resetStores(); // simulate a fresh page load before the repository read
    render(<EditorPage />);

    await waitFor(() => {
      expect(useProjectStore.getState().project.id).toBe(projectId);
    });
    const reloaded = useProjectStore.getState().project;
    expect(reloaded.elements[0]).toMatchObject({
      type: "text",
      text: "MotionLab intro",
    });
    expect(elementNode(reloaded.elements[0].id).textContent).toBe(
      "MotionLab intro",
    );
  });
});

describe("editor workflow — animation authoring and persistence", () => {
  it("creates two keyframes, interpolates during playback, and survives reload", async () => {
    const editor = render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add rect element" }));
    const rectId = useProjectStore.getState().project.elements[0].id;

    // 1. Keyframe x at the start of the timeline via the properties panel.
    fireEvent.click(
      screen.getByRole("button", { name: "Add X keyframe at playhead" }),
    );

    // 2. Move the playhead, then change the value: the store writes a
    //    keyframe at the playhead instead of a masked base edit.
    act(() => {
      useEditorStore.setState({ playheadMs: 2000 });
    });
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "300" } });

    const project = useProjectStore.getState().project;
    const xTrack = project.elements[0].keyframes
      .filter((keyframe) => keyframe.property === "x")
      .map((keyframe) => [keyframe.timeMs, keyframe.value]);
    expect(xTrack).toEqual([
      [0, 0],
      [2000, 300],
    ]);
    expect(project.elements[0].transform.x).toBe(0);
    const projectId = useProjectStore.getState().project.id;
    editor.unmount();

    // 3. Playback: the controller moves the playhead and the canvas consumes
    //    the evaluator, so the element visibly interpolates.
    const scheduler = new FakeScheduler();
    const beforePlayback = useProjectStore.getState().project;
    const playbackView = render(
      <>
        <TimelineStrip scheduler={scheduler} />
        <CanvasPlaceholder />
      </>,
    );
    act(() => {
      useEditorStore.setState({ playheadMs: 0 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      scheduler.advance(1000);
    });

    expect(useEditorStore.getState().playheadMs).toBe(1000);
    expect(
      evaluate(useProjectStore.getState().project, 1000).elements[0].transform.x,
    ).toBe(150);
    // width 100 → x 150 places the center at 200.
    expect(elementNode(rectId).getAttribute("transform")).toBe(
      "translate(200 50) rotate(0) scale(1 1) translate(-50 -50)",
    );
    expect(useProjectStore.getState().project).toBe(beforePlayback);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    playbackView.unmount();

    // 4. Save and reload: both keyframes remain and still interpolate.
    const saveView = render(<EditorToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(await screen.findByTestId("save-state")).toHaveTextContent("Saved");
    saveView.unmount();

    navigation.search = `id=${projectId}`;
    resetStores();
    render(<EditorPage />);

    await waitFor(() => {
      expect(useProjectStore.getState().project.id).toBe(projectId);
    });
    const reloaded = useProjectStore.getState().project;
    expect(
      reloaded.elements[0].keyframes
        .filter((keyframe) => keyframe.property === "x")
        .map((keyframe) => [keyframe.timeMs, keyframe.value]),
    ).toEqual([
      [0, 0],
      [2000, 300],
    ]);
    expect(evaluate(reloaded, 1000).elements[0].transform.x).toBe(150);
    expect(document.querySelectorAll("[data-keyframe-id]")).toHaveLength(2);
  });
});

describe("editor workflow — canvas drag on an animated property", () => {
  it("writes a keyframe at the playhead instead of changing the base value", () => {
    const rect = createElement("rect", {
      width: 100,
      height: 100,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      keyframes: [
        createKeyframe("x", 0, 0),
        createKeyframe("x", 1000, 200),
      ],
    });
    resetStores(createProject({ elements: [rect] }));
    useEditorStore.setState({ playheadMs: 500, selectedElementId: rect.id });
    render(<CanvasPlaceholder />);

    const el = elementNode(rect.id);
    const event = (type: string, x: number, y: number) =>
      fireEvent(el, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

    event("pointerdown", 100, 50);
    event("pointermove", 150, 50);
    event("pointerup", 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    expect(
      element.keyframes
        .filter((keyframe) => keyframe.property === "x")
        .map((keyframe) => [keyframe.timeMs, keyframe.value]),
    ).toEqual([
      [0, 0],
      [500, 150],
      [1000, 200],
    ]);
    expect(element.transform.x).toBe(0);
  });
});
