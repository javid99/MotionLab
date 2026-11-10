import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CanvasPlaceholder from "./CanvasPlaceholder";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import {
  createElement,
  createKeyframe,
  createProject,
} from "@/project/defaults";
import type { Project } from "@/project/model";

function makeProject(): Project {
  return createProject({
    elements: [
      createElement("rect", {
        name: "Box",
        transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
      createElement("ellipse", {
        name: "Dot",
        rx: 30,
        ry: 45,
        transform: { x: 400, y: 300, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    ],
  });
}

function resetStores(project: Project = makeProject()): void {
  useProjectStore.setState({ project });
  useEditorStore.setState({ selectedElementId: null });
}

beforeEach(() => resetStores());

function elementNode(id: string): Element {
  const el = document.querySelector(`[data-element-id="${id}"]`);
  if (!el) throw new Error(`element ${id} not rendered`);
  return el;
}

function surface(): HTMLElement {
  return screen.getByTestId("canvas-surface");
}

/**
 * Dispatches a pointer event carrying real client coordinates. jsdom's
 * PointerEvent constructor does not accept MouseEvent init properties, so we
 * build a MouseEvent with a pointer-event type instead.
 */
function pointer(
  type: "pointerdown" | "pointermove" | "pointerup",
  target: Element,
  x: number,
  y: number,
): void {
  fireEvent(target, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

describe("CanvasPlaceholder — empty state and rendering", () => {
  it("shows the empty state for an empty project", () => {
    resetStores(createProject());
    render(<CanvasPlaceholder />);

    expect(
      screen.getByText(
        "Use the Rect, Ellipse, or Text buttons in the toolbar above to add your first element.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-surface")).toBeNull();
  });

  it("renders the scene through the prop-driven renderer", () => {
    const project = makeProject();
    resetStores(project);
    render(<CanvasPlaceholder />);

    expect(elementNode(project.elements[0].id)).toBeTruthy();
    expect(elementNode(project.elements[1].id)).toBeTruthy();
  });
});

describe("CanvasPlaceholder — click selection", () => {
  it("selects an element on pointer down", () => {
    const project = makeProject();
    resetStores(project);
    render(<CanvasPlaceholder />);

    pointer("pointerdown", elementNode(project.elements[0].id), 120, 60);

    expect(useEditorStore.getState().selectedElementId).toBe(
      project.elements[0].id,
    );
  });

  it("clears the selection when clicking the canvas background", () => {
    const project = makeProject();
    resetStores(project);
    useEditorStore.setState({ selectedElementId: project.elements[0].id });
    render(<CanvasPlaceholder />);

    pointer("pointerdown", surface(), 5, 5);

    expect(useEditorStore.getState().selectedElementId).toBeNull();
  });

  it("keeps the project document untouched by selection changes", () => {
    const project = makeProject();
    resetStores(project);
    render(<CanvasPlaceholder />);

    const before = useProjectStore.getState().project;
    pointer("pointerdown", elementNode(project.elements[0].id), 120, 60);

    expect(useProjectStore.getState().project).toBe(before);
  });
});

describe("CanvasPlaceholder — drag move", () => {
  it("commits the moved position once on pointer up", () => {
    const project = makeProject();
    resetStores(project);
    render(<CanvasPlaceholder />);

    pointer("pointerdown", elementNode(project.elements[0].id), 120, 60);
    pointer("pointermove", surface(), 170, 100);

    // In-flight: the project document must not be written during the drag.
    expect(useProjectStore.getState().project.elements[0].transform.x).toBe(100);

    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    expect(element.transform.x).toBe(150); // 100 + (170 - 120)
    expect(element.transform.y).toBe(90); // 50 + (100 - 60)
  });

  it("does not commit when the pointer never moves", () => {
    const project = makeProject();
    resetStores(project);
    render(<CanvasPlaceholder />);

    const before = useProjectStore.getState().project;
    pointer("pointerdown", elementNode(project.elements[0].id), 120, 60);
    pointer("pointerup", surface(), 0, 0);

    expect(useProjectStore.getState().project.elements[0].transform).toEqual(
      before.elements[0].transform,
    );
  });
});

describe("CanvasPlaceholder — resize handles", () => {
  it("resizes the selected rect via the corner handle", () => {
    const project = makeProject();
    resetStores(project);
    const [rect] = project.elements;
    useEditorStore.setState({ selectedElementId: rect.id });
    render(<CanvasPlaceholder />);

    // Corner handle sits at the bottom-right: (100 + 100, 50 + 100).
    pointer(
      "pointerdown",
      document.querySelector(`[data-resize-handle="${rect.id}"]`) as Element,
      200,
      150,
    );
    pointer("pointermove", surface(), 260, 190);
    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    expect(element.type).toBe("rect");
    expect(element).toMatchObject({ width: 160, height: 140 });
  });

  it("maps rect resize onto ellipse radii", () => {
    const project = makeProject();
    resetStores(project);
    const [, dot] = project.elements;
    useEditorStore.setState({ selectedElementId: dot.id });
    render(<CanvasPlaceholder />);

    // Corner handle at (400 + 60, 300 + 90); drag by (+20, +10).
    pointer(
      "pointerdown",
      document.querySelector(`[data-resize-handle="${dot.id}"]`) as Element,
      460,
      390,
    );
    pointer("pointermove", surface(), 480, 400);
    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[1];
    expect(element).toMatchObject({ rx: 40, ry: 50 });
  });

  it("scales text font size from the resized height", () => {
    const text = createElement("text", {
      name: "Label",
      text: "Hi",
      fontSize: 20,
    });
    const project = createProject({ elements: [text] });
    resetStores(project);
    useEditorStore.setState({ selectedElementId: text.id });
    render(<CanvasPlaceholder />);

    // Text box: 24 × 24 at fontSize 20; handle at (24, 24). Drag +24 in y.
    pointer(
      "pointerdown",
      document.querySelector(`[data-resize-handle="${text.id}"]`) as Element,
      24,
      24,
    );
    pointer("pointermove", surface(), 24, 48);
    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    expect(element).toMatchObject({ fontSize: 40 }); // height 48 / 1.2
  });

  it("does not shrink elements below the minimum size", () => {
    const project = makeProject();
    resetStores(project);
    const [rect] = project.elements;
    useEditorStore.setState({ selectedElementId: rect.id });
    render(<CanvasPlaceholder />);

    pointer(
      "pointerdown",
      document.querySelector(`[data-resize-handle="${rect.id}"]`) as Element,
      200,
      150,
    );
    pointer("pointermove", surface(), -500, -500);
    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    expect(element).toMatchObject({ width: 1, height: 1 });
  });
});

describe("CanvasPlaceholder — stale and edge cases", () => {
  it("handles a stale selection id without crashing", () => {
    resetStores();
    useEditorStore.setState({ selectedElementId: "missing-id" });
    render(<CanvasPlaceholder />);

    expect(screen.getByTestId("canvas-surface")).toBeInTheDocument();
    expect(document.querySelector("[data-resize-handle]")).toBeNull();
  });
});

describe("CanvasPlaceholder — animation preview", () => {
  function animatedRectProject(): Project {
    return createProject({
      elements: [
        createElement("rect", {
          name: "Box",
          width: 100,
          height: 100,
          transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
          keyframes: [
            createKeyframe("x", 0, 100),
            createKeyframe("x", 1000, 300),
          ],
        }),
      ],
    });
  }

  it("renders the evaluated value at the playhead instead of the base transform", () => {
    const project = animatedRectProject();
    resetStores(project);
    useEditorStore.setState({ playheadMs: 500 });
    render(<CanvasPlaceholder />);

    const el = elementNode(project.elements[0].id);
    // x at 500 ms = 200 → center (250, 100), size 100×100.
    expect(el.getAttribute("transform")).toBe(
      "translate(250 100) rotate(0) scale(1 1) translate(-50 -50)",
    );
  });

  it("updates the canvas when the playhead changes without writing the project", () => {
    const project = animatedRectProject();
    resetStores(project);
    render(<CanvasPlaceholder />);
    const before = useProjectStore.getState().project;

    act(() => {
      useEditorStore.setState({ playheadMs: 1000 });
    });

    expect(elementNode(project.elements[0].id).getAttribute("transform")).toBe(
      "translate(350 100) rotate(0) scale(1 1) translate(-50 -50)",
    );
    expect(useProjectStore.getState().project).toBe(before);
  });

  it("shows text content edits immediately", () => {
    const text = createElement("text", { name: "Label", text: "Hello" });
    const project = createProject({ elements: [text] });
    resetStores(project);
    useEditorStore.setState({ selectedElementId: text.id });
    render(<CanvasPlaceholder />);

    expect(elementNode(text.id).textContent).toBe("Hello");

    act(() => {
      useProjectStore.getState().updateElement(text.id, { text: "Hello world" });
    });

    expect(elementNode(text.id).textContent).toBe("Hello world");
  });

  it("writes a keyframe at the playhead when dragging an animated element", () => {
    const project = animatedRectProject();
    resetStores(project);
    useEditorStore.setState({ playheadMs: 500 });
    render(<CanvasPlaceholder />);
    const rect = project.elements[0];

    // The element is displayed at x = 200, y = 50 at 500 ms.
    pointer("pointerdown", elementNode(rect.id), 250, 100);
    pointer("pointermove", surface(), 300, 100);
    pointer("pointerup", surface(), 0, 0);

    const element = useProjectStore.getState().project.elements[0];
    const xTrack = element.keyframes.filter((k) => k.property === "x");
    expect(xTrack.map((k) => [k.timeMs, k.value])).toEqual([
      [0, 100],
      [500, 250],
      [1000, 300],
    ]);
    expect(element.transform.x).toBe(100);
  });
});
