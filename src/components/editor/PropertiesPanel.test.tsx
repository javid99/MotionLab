import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PropertiesPanel from "./PropertiesPanel";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import type { Project } from "@/project/model";

function makeProject(): Project {
  return createProject({
    elements: [
      createElement("rect", {
        name: "Box",
        style: { fill: "#ff0000", opacity: 1 },
        transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
      createElement("ellipse", { name: "Dot" }),
      createElement("text", {
        name: "Label",
        text: "Hello",
        transform: { x: 20, y: 30, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    ],
  });
}

function resetStores(): void {
  const project = makeProject();
  useProjectStore.setState({ project });
  useEditorStore.setState({
    selectedElementId: project.elements[0].id,
    playheadMs: 0,
  });
}

beforeEach(resetStores);

describe("PropertiesPanel — selection", () => {
  it("shows the empty state when nothing is selected", () => {
    useEditorStore.setState({ selectedElementId: null });
    render(<PropertiesPanel />);

    expect(screen.getByText(/Nothing selected/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("shows the inspector for the selected element", () => {
    render(<PropertiesPanel />);

    const { project } = useProjectStore.getState();
    expect(screen.getByLabelText("Name")).toHaveValue("Box");
    expect(screen.getByLabelText("Fill")).toHaveValue("#ff0000");
    expect(screen.getByLabelText("X")).toHaveValue(100);
    expect(screen.getByLabelText("Y")).toHaveValue(50);
    expect(screen.getByText("rect")).toBeInTheDocument();
    expect(
      screen.queryByText(project.elements[1].name ?? "Dot"),
    ).toBeNull();
  });

  it("falls back to the empty state for a stale selection id", () => {
    useEditorStore.setState({ selectedElementId: "missing-id" });
    render(<PropertiesPanel />);

    expect(screen.getByText(/Nothing selected/i)).toBeInTheDocument();
  });
});

describe("PropertiesPanel — edits commit through the project store", () => {
  it("commits name edits", () => {
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    });

    const element = useProjectStore.getState().project.elements[0];
    expect(element.name).toBe("Renamed");
    expect(element.id).toBe(useEditorStore.getState().selectedElementId);
  });

  it("commits fill edits without touching other style fields", () => {
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("Fill"), {
      target: { value: "#00ff00" },
    });

    const element = useProjectStore.getState().project.elements[0];
    expect(element.style).toEqual({ fill: "#00ff00", opacity: 1 });
  });

  it("commits position edits per axis", () => {
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("X"), {
      target: { value: "250" },
    });

    let element = useProjectStore.getState().project.elements[0];
    expect(element.transform).toMatchObject({ x: 250, y: 50 });

    fireEvent.change(screen.getByLabelText("Y"), {
      target: { value: "75" },
    });

    element = useProjectStore.getState().project.elements[0];
    expect(element.transform).toMatchObject({ x: 250, y: 75 });
  });

  it("ignores non-numeric position input", () => {
    render(<PropertiesPanel />);
    const before = useProjectStore.getState().project;

    fireEvent.change(screen.getByLabelText("X"), {
      target: { value: "not-a-number" },
    });

    expect(useProjectStore.getState().project).toBe(before);
  });
});

describe("PropertiesPanel — delete", () => {
  it("removes the element and clears the selection", () => {
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Delete element" }));

    const { project } = useProjectStore.getState();
    expect(project.elements).toHaveLength(2);
    expect(project.elements[0].name).toBe("Dot");
    expect(useEditorStore.getState().selectedElementId).toBeNull();
  });
});

function selectElement(type: "rect" | "ellipse" | "text"): void {
  const element = useProjectStore
    .getState()
    .project.elements.find((el) => el.type === type);
  if (!element) throw new Error(`no ${type} element in fixture`);
  useEditorStore.setState({ selectedElementId: element.id });
}

describe("PropertiesPanel — text content", () => {
  it("does not show a content input for rect or ellipse elements", () => {
    render(<PropertiesPanel />);
    expect(screen.queryByLabelText("Content")).toBeNull();

    selectElement("ellipse");
    expect(screen.queryByLabelText("Content")).toBeNull();
  });

  it("shows the selected text element's content and commits edits", () => {
    selectElement("text");
    render(<PropertiesPanel />);

    const content = screen.getByLabelText("Content");
    expect(content).toHaveValue("Hello");

    fireEvent.change(content, { target: { value: "Hello world" } });

    const element = useProjectStore
      .getState()
      .project.elements.find((el) => el.type === "text");
    expect(element).toMatchObject({ text: "Hello world" });
    // Content edits leave geometry and text style untouched.
    expect(element).toMatchObject({ fontSize: 16, fontFamily: "sans-serif" });
  });

  it("accepts empty text", () => {
    selectElement("text");
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("Content"), {
      target: { value: "" },
    });

    const element = useProjectStore
      .getState()
      .project.elements.find((el) => el.type === "text");
    expect(element).toMatchObject({ text: "" });
  });

  it("preserves reasonable multiline input in the model", () => {
    selectElement("text");
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("Content"), {
      target: { value: "First line\nSecond line" },
    });

    const element = useProjectStore
      .getState()
      .project.elements.find((el) => el.type === "text");
    expect(element).toMatchObject({ text: "First line\nSecond line" });
  });
});

describe("PropertiesPanel — animation controls", () => {
  it("shows evaluated property values at the playhead", () => {
    const project = useProjectStore.getState().project;
    const rect = project.elements[0];
    useProjectStore.setState({
      project: {
        ...project,
        elements: project.elements.map((el) =>
          el.id === rect.id
            ? {
                ...el,
                keyframes: [
                  createKeyframe("x", 0, 100),
                  createKeyframe("x", 1000, 300),
                ],
              }
            : el,
        ),
      },
    });
    useEditorStore.setState({ playheadMs: 500 });
    render(<PropertiesPanel />);

    expect(screen.getByLabelText("X")).toHaveValue(200);
    expect(screen.getByTestId("property-playhead")).toHaveTextContent(
      "playhead 500 ms",
    );
  });

  it("adds a property-specific keyframe at the playhead with the evaluated value", () => {
    useEditorStore.setState({ playheadMs: 2500 });
    render(<PropertiesPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Rotation keyframe at playhead",
      }),
    );

    const element = useProjectStore.getState().project.elements[0];
    const rotation = element.keyframes.filter((k) => k.property === "rotation");
    expect(rotation).toHaveLength(1);
    expect(rotation[0]).toMatchObject({ timeMs: 2500, value: 0 });
    // Only the chosen property track is touched.
    expect(element.keyframes.filter((k) => k.property === "x")).toHaveLength(0);
    expect(
      screen.getByRole("button", {
        name: "Remove Rotation keyframe at playhead",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("removes the keyframe at the playhead on a second click", () => {
    useEditorStore.setState({ playheadMs: 1000 });
    const project = useProjectStore.getState().project;
    const rect = project.elements[0];
    const existing = createKeyframe("opacity", 1000, 0.5);
    useProjectStore.setState({
      project: {
        ...project,
        elements: project.elements.map((el) =>
          el.id === rect.id ? { ...el, keyframes: [existing] } : el,
        ),
      },
    });
    render(<PropertiesPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Opacity keyframe at playhead",
      }),
    );

    expect(
      useProjectStore.getState().project.elements[0].keyframes,
    ).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Add Opacity keyframe at playhead" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("writes a keyframe at the playhead when editing an animated property", () => {
    const project = useProjectStore.getState().project;
    const rect = project.elements[0];
    useProjectStore.setState({
      project: {
        ...project,
        elements: project.elements.map((el) =>
          el.id === rect.id
            ? { ...el, keyframes: [createKeyframe("x", 0, 0)] }
            : el,
        ),
      },
    });
    useEditorStore.setState({ playheadMs: 2000 });
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("X"), {
      target: { value: "300" },
    });

    const element = useProjectStore.getState().project.elements[0];
    const xTrack = element.keyframes.filter((k) => k.property === "x");
    expect(xTrack.map((k) => [k.timeMs, k.value])).toEqual([
      [0, 0],
      [2000, 300],
    ]);
    // The masked base value is not changed once the property is animated.
    expect(element.transform.x).toBe(100);
  });

  it("updates the existing keyframe when editing at its exact time", () => {
    const project = useProjectStore.getState().project;
    const rect = project.elements[0];
    useProjectStore.setState({
      project: {
        ...project,
        elements: project.elements.map((el) =>
          el.id === rect.id
            ? { ...el, keyframes: [createKeyframe("scaleY", 1000, 1)] }
            : el,
        ),
      },
    });
    useEditorStore.setState({ playheadMs: 1000 });
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByLabelText("Scale Y"), {
      target: { value: "2" },
    });

    const scaleY = useProjectStore
      .getState()
      .project.elements[0].keyframes.filter((k) => k.property === "scaleY");
    expect(scaleY).toHaveLength(1);
    expect(scaleY[0]).toMatchObject({ timeMs: 1000, value: 2 });
  });

  it("supports keyframes for every animatable property", () => {
    useEditorStore.setState({ playheadMs: 1500 });
    render(<PropertiesPanel />);

    for (const label of ["X", "Y", "Rotation", "Scale X", "Scale Y", "Opacity"]) {
      fireEvent.click(
        screen.getByRole("button", { name: `Add ${label} keyframe at playhead` }),
      );
    }

    const element = useProjectStore.getState().project.elements[0];
    expect(element.keyframes.map((k) => k.property).sort()).toEqual(
      ["opacity", "rotation", "scaleX", "scaleY", "x", "y"].sort(),
    );
    expect(element.keyframes.every((k) => k.timeMs === 1500)).toBe(true);
  });
});
