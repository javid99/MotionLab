import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExportDialog from "./ExportDialog";
import { useProjectStore } from "@/editor/projectStore";
import { exportProjectCss } from "@/export/cssExporter";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import type { Project } from "@/project/model";

beforeEach(() => {
  useProjectStore.setState({ project: createProject() });
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
  clickedAnchors.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    },
  );
});

/** The download anchor is removed synchronously; capture clicked ones. */
const clickedAnchors: HTMLAnchorElement[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderOpen(): void {
  render(<ExportDialog open onClose={() => {}} />);
}

describe("ExportDialog — preview", () => {
  it("renders the exact exporter output for the current project", () => {
    const project = createProject({
      durationMs: 2000,
      elements: [
        createElement("rect", {
          keyframes: [createKeyframe("x", 0, 0, "linear"), createKeyframe("x", 1000, 20, "ease-in")],
        }),
      ],
    });
    useProjectStore.setState({ project });
    renderOpen();

    expect(screen.getByTestId("export-preview").textContent).toBe(
      exportProjectCss(project),
    );
  });

  it("reflects the current project — no stale CSS after the project changes", () => {
    const first = createProject({ name: "First" });
    useProjectStore.setState({ project: first });
    const { rerender } = render(<ExportDialog open onClose={() => {}} />);
    expect(screen.getByTestId("export-preview").textContent).toBe(
      exportProjectCss(first),
    );

    const second = createProject({
      name: "Second",
      elements: [createElement("ellipse")],
    });
    useProjectStore.setState({ project: second });
    rerender(<ExportDialog open onClose={() => {}} />);

    expect(screen.getByTestId("export-preview").textContent).toBe(
      exportProjectCss(second),
    );
    expect(screen.getByTestId("export-preview").textContent).not.toBe(
      exportProjectCss(first),
    );
  });

  it("renders the empty string preview for a project without elements", () => {
    renderOpen();
    expect(screen.getByTestId("export-preview").textContent).toBe("");
  });

  it("shows an error state instead of stale CSS when export fails", () => {
    const project = createProject({ elements: [createElement("rect")] });
    (project.elements[0] as { id: string }).id = 'bad" id';
    useProjectStore.setState({ project });
    renderOpen();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain("CSS identifiers");
    expect(screen.queryByTestId("export-preview")).toBeNull();
  });
});

describe("ExportDialog — copy", () => {
  it("copies the generated CSS and shows success feedback", async () => {
    const project = createProject({
      elements: [createElement("rect", { keyframes: [createKeyframe("x", 0, 0, "linear")] })],
    });
    useProjectStore.setState({ project });
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Copy CSS to clipboard" }));

    await waitFor(() => {
      expect(screen.getByTestId("copy-state")).toHaveTextContent(
        "Copied to clipboard",
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      exportProjectCss(project),
    );
  });

  it("shows failure feedback when the clipboard write rejects", async () => {
    vi.stubGlobal(
      "navigator",
      { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } } as unknown as Navigator,
    );
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Copy CSS to clipboard" }));

    expect(await screen.findByTestId("copy-state")).toHaveTextContent(
      "Copy failed",
    );
  });

  it("shows failure feedback when the Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {} as Navigator);
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Copy CSS to clipboard" }));

    expect(await screen.findByTestId("copy-state")).toHaveTextContent(
      "Copy failed",
    );
  });
});

describe("ExportDialog — download", () => {
  it("downloads the generated CSS under the sanitized project filename", () => {
    const project = createProject({
      name: "My Cool Project",
      elements: [createElement("rect", { keyframes: [createKeyframe("x", 0, 0, "linear")] })],
    });
    useProjectStore.setState({ project });
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Download CSS file" }));

    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe("my-cool-project.css");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Blob;
    expect(blob.type).toBe("text/css");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("uses the fallback filename for unsafe project names", () => {
    const project = createProject({
      name: "///",
      elements: [createElement("rect", { keyframes: [createKeyframe("x", 0, 0, "linear")] })],
    });
    useProjectStore.setState({ project });
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Download CSS file" }));

    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe("motionlab-export.css");
  });
});

describe("ExportDialog — dismissal and accessibility", () => {
  it("closes on Escape, the Close button, and a backdrop click", () => {
    const onClose = vi.fn();
    const { rerender } = render(<ExportDialog open onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ExportDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close export dialog" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<ExportDialog open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("export-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
    // Clicks inside the dialog do not dismiss.
    fireEvent.click(screen.getByTestId("export-dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("renders nothing when closed and focuses the dialog when opened", () => {
    const { rerender } = render(<ExportDialog open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("export-dialog")).toBeNull();

    rerender(<ExportDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Export CSS" })).toHaveFocus();
  });

  it("resets the copy feedback when reopened", async () => {
    const { rerender } = render(<ExportDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy CSS to clipboard" }));
    await screen.findByTestId("copy-state");
    expect(screen.getByTestId("copy-state")).toHaveTextContent(
      "Copied to clipboard",
    );

    rerender(<ExportDialog open={false} onClose={() => {}} />);
    rerender(<ExportDialog open onClose={() => {}} />);
    expect(screen.getByTestId("copy-state").textContent).toBe("");
  });
});

describe("ExportDialog — large project export (100+ keyframes)", () => {
  it("exports and renders a 120-keyframe fixture synchronously without timeout", () => {
    // 20 elements × 6 keyframes = 120 keyframes.
    const project: Project = createProject({
      durationMs: 5000,
      elements: Array.from({ length: 20 }, (_, index) =>
        createElement("rect", {
          name: `Box ${index}`,
          keyframes: [
            createKeyframe("x", 0, index, "linear"),
            createKeyframe("x", 1000, index + 10, "ease-in"),
            createKeyframe("y", 2000, index + 20, "ease-out"),
            createKeyframe("rotation", 3000, index * 9, "ease-in-out"),
            createKeyframe("opacity", 4000, 0.5, "linear"),
            createKeyframe("scaleX", 5000, 2, "linear"),
          ],
        }),
      ),
    });
    useProjectStore.setState({ project });

    const start = Date.now();
    renderOpen();
    const elapsed = Date.now() - start;

    expect(screen.getByTestId("export-preview").textContent).toBe(
      exportProjectCss(project),
    );
    expect(elapsed).toBeLessThan(5000); // vitest default timeout; sync render
  });
});
