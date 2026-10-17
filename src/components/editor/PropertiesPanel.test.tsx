import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PropertiesPanel from "./PropertiesPanel";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { createElement, createProject } from "@/project/defaults";
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
    ],
  });
}

function resetStores(): void {
  const project = makeProject();
  useProjectStore.setState({ project });
  useEditorStore.setState({
    selectedElementId: project.elements[0].id,
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
    expect(project.elements).toHaveLength(1);
    expect(project.elements[0].name).toBe("Dot");
    expect(useEditorStore.getState().selectedElementId).toBeNull();
  });
});
