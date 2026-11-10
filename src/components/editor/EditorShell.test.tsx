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
      within(workspace).getByText(
        "Use the Rect, Ellipse, or Text buttons in the toolbar above to add your first element.",
      ),
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
    expect(within(timeline).getByText(/No keyframes yet/)).toBeInTheDocument();
  });

  it("height-bounds the timeline so it cannot overlap the workspace", () => {
    // jsdom performs no layout, so this asserts the sizing contract behind
    // the real-browser regression: a full-height (`h-full`) timeline root
    // collapsed the `flex-1` workspace region and made the panels overlap,
    // so canvas clicks hit the timeline and transport buttons hit the
    // canvas. The root must use a max-height bound instead.
    render(<EditorShell />);

    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline.className).toContain("max-h-[45dvh]");
    expect(timeline.className).not.toContain("h-full");
  });

  it("limits interactive controls to toolbar actions and timeline transport (T16)", () => {
    const { container } = render(<EditorShell />);

    const buttons = [...container.querySelectorAll("button")];
    // Toolbar: 3 add buttons + Save + Export CSS. Timeline: transport.
    expect(buttons).toHaveLength(8);
    for (const button of buttons) {
      expect(button.getAttribute("aria-label")).toMatch(
        /^(Add \w+ element|Play|Pause|Stop|Save project|Export CSS)$/,
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
