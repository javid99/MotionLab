import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import EditorShell from "./EditorShell";

describe("EditorShell", () => {
  it("renders the top toolbar with the app name and project label", () => {
    render(<EditorShell />);

    expect(screen.getByRole("banner")).toHaveTextContent("MotionLab");
    expect(screen.getByText("Untitled project")).toBeInTheDocument();
  });

  it("renders the tool strip as non-interactive placeholders", () => {
    render(<EditorShell />);

    const tools = screen.getByRole("group", { name: "Editor tools" });
    for (const tool of ["Select", "Move", "Rect", "Ellipse", "Text"]) {
      const chip = within(tools).getByText(tool);
      expect(chip.tagName).not.toBe("BUTTON");
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

  it("contains no interactive controls (T3 is structural only)", () => {
    const { container } = render(<EditorShell />);

    expect(container.querySelector("button, a, input, select, textarea")).toBeNull();
  });
});
