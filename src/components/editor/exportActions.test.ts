import { afterEach, describe, it, expect, vi } from "vitest";
import {
  copyTextToClipboard,
  cssDownloadFilename,
  downloadTextFile,
  projectFilename,
} from "./exportActions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("projectFilename", () => {
  it("keeps already-safe names (lowercased)", () => {
    expect(projectFilename("Intro Animation")).toBe("intro-animation");
  });

  it("replaces unsafe filesystem characters with dashes", () => {
    expect(projectFilename('a/b\\c:d*e?f"g<h>i|j')).toBe(
      "a-b-c-d-e-f-g-h-i-j",
    );
  });

  it("collapses runs of separators and trims edges", () => {
    expect(projectFilename("  My   Cool__Project!!  ")).toBe(
      "my-cool-project",
    );
  });

  it("falls back for empty or fully unsafe names", () => {
    expect(projectFilename("")).toBe("motionlab-export");
    expect(projectFilename("///")).toBe("motionlab-export");
    expect(projectFilename("   ")).toBe("motionlab-export");
  });

  it("is deterministic for repeated calls", () => {
    expect(projectFilename("Weird // Name")).toBe(
      projectFilename("Weird // Name"),
    );
  });

  it("cssDownloadFilename appends the .css extension", () => {
    expect(cssDownloadFilename("My Project")).toBe("my-project.css");
    expect(cssDownloadFilename("///")).toBe("motionlab-export.css");
  });
});

describe("copyTextToClipboard", () => {
  function stubClipboard(writeText: unknown): void {
    vi.stubGlobal(
      "navigator",
      { clipboard: { writeText } } as unknown as Navigator,
    );
  }

  it("writes the text and resolves on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    await expect(copyTextToClipboard("body { color: red; }")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("body { color: red; }");
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("rejects when the Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {} as Navigator);

    await expect(copyTextToClipboard("x")).rejects.toThrow(
      /Clipboard is not available/,
    );
  });

  it("rejects when writeText itself is missing", async () => {
    vi.stubGlobal("navigator", { clipboard: {} } as unknown as Navigator);

    await expect(copyTextToClipboard("x")).rejects.toThrow(
      /Clipboard is not available/,
    );
  });

  it("rejects with a descriptive error when the write fails", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    await expect(copyTextToClipboard("x")).rejects.toThrow(
      /Failed to copy to the clipboard/,
    );
  });
});

describe("downloadTextFile", () => {
  function stubDownloadApis(): {
    createObjectURL: ReturnType<typeof vi.fn>;
    revokeObjectURL: ReturnType<typeof vi.fn>;
    clicks: HTMLAnchorElement[];
  } {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicks.push(this);
      },
    );
    return { createObjectURL, revokeObjectURL, clicks };
  }

  it("creates a Blob, clicks an anchor with the filename, and revokes the URL", () => {
    const { createObjectURL, revokeObjectURL, clicks } = stubDownloadApis();

    downloadTextFile("my-project.css", "/* css */");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/css");

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("my-project.css");
    expect(clicks[0].href).toBe("blob:mock-url");

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("appends the anchor to the body and removes it after the click", () => {
    const { clicks } = stubDownloadApis();
    const appended: Node[] = [];
    const originalAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation(
      <T extends Node>(node: T): T => {
        appended.push(node);
        return originalAppend(node);
      },
    );

    downloadTextFile("x.css", "x");

    expect(appended).toHaveLength(1);
    expect(appended[0]).toBe(clicks[0]);
    expect(document.body.contains(clicks[0])).toBe(false);
  });

  it("revokes the object URL even when the anchor click throws", () => {
    const { revokeObjectURL } = stubDownloadApis();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("click failed");
    });

    expect(() => downloadTextFile("x.css", "x")).toThrow("click failed");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
