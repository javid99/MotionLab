"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { exportProjectCss } from "@/export/cssExporter";
import { useProjectStore } from "@/editor/projectStore";
import {
  copyTextToClipboard,
  cssDownloadFilename,
  downloadTextFile,
} from "./exportActions";

/**
 * Export dialog (T16): previews the CSS produced by the pure T15 exporter
 * for the current project, with Copy and Download actions.
 *
 * - The CSS is computed synchronously during render from the current project
 *   store state (a pure string build — no worker), so the preview can never
 *   show stale CSS: any project change re-renders with fresh output. Export
 *   or validation failures render an error state instead of stale CSS.
 * - Dismissal: Escape, the Close button, or a backdrop click.
 * - Clipboard/download side effects live in `exportActions.ts`.
 */

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const project = useProjectStore((s) => s.project);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  // Reset the copy feedback when the dialog reopens (state adjustment
  // during render for a prop change — the React-recommended pattern).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCopyState("idle");
    }
  }

  const exportResult = useMemo<{ css?: string; error?: string }>(() => {
    try {
      return { css: exportProjectCss(project) };
    } catch (cause) {
      return {
        error:
          cause instanceof Error
            ? cause.message
            : "Failed to generate the CSS export",
      };
    }
  }, [project]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function handleCopy(): Promise<void> {
    if (exportResult.css === undefined) {
      return;
    }
    try {
      await copyTextToClipboard(exportResult.css);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function handleDownload(): void {
    if (exportResult.css === undefined) {
      return;
    }
    downloadTextFile(
      cssDownloadFilename(project.name),
      exportResult.css,
    );
  }

  return (
    <div
      data-testid="export-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export CSS"
        tabIndex={-1}
        data-testid="export-dialog"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-neutral-100">
            Export CSS
          </h2>
          <button
            type="button"
            aria-label="Close export dialog"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            Close
          </button>
        </div>

        {exportResult.error !== undefined ? (
          <div
            role="alert"
            data-testid="export-error"
            className="m-4 rounded-lg border border-red-900/60 bg-red-950/30 p-4"
          >
            <p className="text-sm text-red-300">
              Failed to generate the CSS export
            </p>
            <p className="mt-1 text-xs text-red-400/80">{exportResult.error}</p>
          </div>
        ) : (
          <>
            <pre
              data-testid="export-preview"
              aria-label="CSS export preview"
              className="m-4 min-h-0 flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs leading-5 text-neutral-300"
            >
              {exportResult.css}
            </pre>
            <div className="flex items-center gap-2 border-t border-neutral-800 px-4 py-3">
              <button
                type="button"
                aria-label="Copy CSS to clipboard"
                onClick={() => {
                  void handleCopy();
                }}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
              >
                Copy CSS
              </button>
              <button
                type="button"
                aria-label="Download CSS file"
                onClick={handleDownload}
                className="rounded-md bg-sky-500/90 px-2.5 py-1 text-xs font-medium text-neutral-950 hover:bg-sky-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
              >
                Download CSS
              </button>
              <span aria-live="polite" data-testid="copy-state" className="ml-auto text-xs">
                {copyState === "copied" ? (
                  <span className="text-sky-300">Copied to clipboard</span>
                ) : copyState === "failed" ? (
                  <span className="text-red-400">Copy failed</span>
                ) : null}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
