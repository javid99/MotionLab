/**
 * Browser side-effect helpers for the export dialog (T16). Kept out of the
 * pure exporter (`src/export/cssExporter.ts`): clipboard and download
 * belong to the UI layer. Small and directly testable in jsdom with
 * explicitly mocked browser APIs.
 */

/**
 * Deterministic, filesystem-safe base filename for a project name:
 * unsafe characters become `-`, runs collapse, results are trimmed, and
 * an empty/unsafe name falls back to `motionlab-export`.
 */
export function projectFilename(name: string): string {
  const sanitized = name
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "-")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return sanitized.length > 0 ? sanitized : "motionlab-export";
}

/** Full download filename for a project's CSS export. */
export function cssDownloadFilename(projectName: string): string {
  return `${projectFilename(projectName)}.css`;
}

/**
 * Writes text to the clipboard via the browser Clipboard API. Resolves on
 * success; rejects with a descriptive error when the API is unavailable or
 * the write fails (the caller shows the failure feedback).
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") {
    throw new Error("Clipboard is not available in this environment");
  }
  try {
    await clipboard.writeText(text);
  } catch (cause) {
    throw new Error("Failed to copy to the clipboard", { cause });
  }
}

/**
 * Downloads text as a file via a temporary Blob object URL and an anchor
 * click. Revokes the object URL after triggering the download.
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = "text/css",
): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
