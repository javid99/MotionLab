import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import EditorToolbar from "./EditorToolbar";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import { exportProjectCss } from "@/export/cssExporter";
import { createMemoryProjectRepository } from "../../../tests/helpers/memoryProjectRepository";

beforeEach(() => {
  vi.stubGlobal(
    "navigator",
    {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Navigator,
  );
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

function resetStores(): void {
  useProjectStore.setState({ project: createProject() });
  useEditorStore.setState({ selectedElementId: null });
}

beforeEach(resetStores);

describe("EditorToolbar — add element actions", () => {
  it("adds a rect element and selects it", () => {
    render(<EditorToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Add rect element" }));

    const { project } = useProjectStore.getState();
    expect(project.elements).toHaveLength(1);
    expect(project.elements[0].type).toBe("rect");
    expect(useEditorStore.getState().selectedElementId).toBe(
      project.elements[0].id,
    );
  });

  it("adds an ellipse element and selects it", () => {
    render(<EditorToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Add ellipse element" }));

    const { project } = useProjectStore.getState();
    expect(project.elements).toHaveLength(1);
    expect(project.elements[0].type).toBe("ellipse");
    expect(useEditorStore.getState().selectedElementId).toBe(
      project.elements[0].id,
    );
  });

  it("adds a text element and selects it", () => {
    render(<EditorToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Add text element" }));

    const { project } = useProjectStore.getState();
    expect(project.elements).toHaveLength(1);
    expect(project.elements[0].type).toBe("text");
    expect(useEditorStore.getState().selectedElementId).toBe(
      project.elements[0].id,
    );
  });

  it("adds each element with a unique id across repeated clicks", () => {
    render(<EditorToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Add rect element" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rect element" }));

    const { project } = useProjectStore.getState();
    expect(project.elements).toHaveLength(2);
    expect(project.elements[0].id).not.toBe(project.elements[1].id);
  });
  it("displays the project name from the store", () => {
    useProjectStore.setState({ project: createProject({ name: "Intro" }) });
    render(<EditorToolbar />);

    expect(screen.getByText("Intro")).toBeInTheDocument();
  });
});

describe("EditorToolbar — save project (T14)", () => {
  it("persists the current project through the repository", async () => {
    const repository = createMemoryProjectRepository();
    useProjectStore.setState({ project: createProject({ name: "To save" }) });
    render(<EditorToolbar repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    expect(await screen.findByTestId("save-state")).toHaveTextContent("Saved");
    const [stored] = repository.projects.values();
    expect(stored?.name).toBe("To save");
    expect(stored).toEqual(useProjectStore.getState().project);
  });

  it("shows an error state when saving fails", async () => {
    const repository = createMemoryProjectRepository();
    repository.put = async () => {
      throw new Error("db unavailable");
    };
    render(<EditorToolbar repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    expect(await screen.findByTestId("save-state")).toHaveTextContent(
      "Save failed",
    );
  });
});

describe("EditorToolbar — export dialog integration (T16)", () => {
  it("opens the export dialog from the toolbar and closes it via Escape", () => {
    render(<EditorToolbar />);

    expect(screen.queryByRole("dialog", { name: "Export CSS" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export CSS" }));
    expect(
      screen.getByRole("dialog", { name: "Export CSS" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Export CSS" })).toBeNull();
  });

  it("previews the current project's exact exporter output", () => {
    const project = createProject({
      name: "Preview",
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0, "linear"),
            createKeyframe("x", 1000, 5, "ease-out"),
          ],
        }),
      ],
    });
    useProjectStore.setState({ project });
    render(<EditorToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSS" }));

    expect(screen.getByTestId("export-preview").textContent).toBe(
      exportProjectCss(project),
    );
  });
});
