import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import EditorShell from "./EditorShell";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { createProject } from "@/project/defaults";

beforeEach(() => {
  useProjectStore.setState({ project: createProject() });
  useEditorStore.setState({ playheadMs: 0, selectedElementId: null });
});

describe("EditorShell", () => {
  it("renders the top toolbar with the app name and project label", () => {
    render(<EditorShell />);

    expect(screen.getByRole("banner")).toHaveTextContent("MotionLab");
    expect(screen.getByText("Untitled project")).toBeInTheDocument();
  });

  it("renders tool placeholders and functional add buttons (T6)", () => {
    render(<EditorShell />);

    const tools = screen.getByRole("group", { name: "Editor tools" });
    // Select/Move remain structural placeholders.
    for (const tool of ["Select", "Move"]) {
      expect(within(tools).getByText(tool).tagName).not.toBe("BUTTON");
    }
    // Rect/Ellipse/Text are functional add buttons since T6.
    for (const label of ["rect", "ellipse", "text"]) {
      expect(
        within(tools).getByRole("button", {
          name: `Add ${label} element`,
        }),
      ).toBeInTheDocument();
    }
  });

  it("renders the canvas placeholder inside the workspace", () => {
    render(<EditorShell />);

    const workspace = screen.getByRole("main", { name: "Editor workspace" });
    expect(
      within(workspace).getByText("Add elements to start composing your scene."),
    ).toBeInTheDocument();
    expect(
      within(workspace).getByRole("region", { name: "Canvas" }),
    ).toBeInTheDocument();
  });

  it("renders the properties panel as an empty state", () => {
    render(<EditorShell />);

    const panel = screen.getByRole("complementary", { name: "Properties" });
    expect(
      within(panel).getByText(/Nothing selected/i),
    ).toBeInTheDocument();
  });

  it("renders the timeline strip with an empty state", () => {
    render(<EditorShell />);

    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(timeline).getByText("No keyframes yet.")).toBeInTheDocument();
  });

  it("limits interactive controls to toolbar actions and timeline transport (T14)", () => {
    const { container } = render(<EditorShell />);

    const buttons = [...container.querySelectorAll("button")];
    // Toolbar: 3 add buttons + Save. Timeline: Play/Pause/Stop transport.
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.getAttribute("aria-label")).toMatch(
        /^(Add \w+ element|Play|Pause|Stop|Save project)$/,
      );
    }
    // No interactive controls in the workspace or properties panel.
    expect(
      container.querySelectorAll(
        "main button, main a, main input, aside button, aside input",
      ),
    ).toHaveLength(0);
  });
});
