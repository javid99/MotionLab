"use client";

import { useState } from "react";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import {
  createProjectRepository,
  type ProjectRepository,
} from "@/persistence/projectRepository";
import { createElement } from "@/project/defaults";
import type { SceneElement } from "@/project/model";

/**
 * Top toolbar strip: the rect/ellipse/text chips are functional add buttons
 * wired to the project store and selection; "Select"/"Move" remain
 * structural placeholders (plain spans) until tool modes exist. The Save
 * button (T14) persists the current project through the repository so a
 * saved project survives a full reload.
 */

const TOOLS = ["Select", "Move"] as const;

const ADDABLE: Array<{ type: SceneElement["type"]; label: string }> = [
  { type: "rect", label: "Rect" },
  { type: "ellipse", label: "Ellipse" },
  { type: "text", label: "Text" },
];

const defaultRepository = createProjectRepository();

function LogoMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="3"
        className="fill-neutral-700"
      />
      <circle cx="5.5" cy="10.5" r="2" className="fill-neutral-300" />
      <path
        d="M7.5 8.5 L11 5"
        stroke="#d4d4d4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function EditorToolbar({
  repository: repositoryProp,
}: {
  /** Test injection point; defaults to the real IndexedDB repository. */
  repository?: ProjectRepository;
} = {}) {
  const repository = repositoryProp ?? defaultRepository;
  const projectName = useProjectStore((s) => s.project.name);
  const addElement = useProjectStore((s) => s.addElement);
  const select = useEditorStore((s) => s.select);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  function handleAdd(type: SceneElement["type"]): void {
    // Narrow the type literal so the overloaded factory resolves per type.
    const element =
      type === "rect"
        ? createElement("rect")
        : type === "ellipse"
          ? createElement("ellipse")
          : createElement("text");
    if (addElement(element)) {
      select(element.id);
    }
  }

  async function handleSave(): Promise<void> {
    try {
      await repository.put(useProjectStore.getState().project);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          MotionLab
        </span>
      </div>
      <div
        role="group"
        aria-label="Editor tools"
        className="flex flex-wrap items-center gap-1"
      >
        {TOOLS.map((tool) => (
          <span
            key={tool}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400"
          >
            {tool}
          </span>
        ))}
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-neutral-700" />
        {ADDABLE.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            aria-label={`Add ${label.toLowerCase()} element`}
            onClick={() => handleAdd(type)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Save project"
        onClick={() => {
          void handleSave();
        }}
        className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
      >
        Save
      </button>
      {saveState === "saved" ? (
        <span
          aria-live="polite"
          data-testid="save-state"
          className="text-xs text-sky-300"
        >
          Saved
        </span>
      ) : saveState === "error" ? (
        <span
          aria-live="polite"
          data-testid="save-state"
          className="text-xs text-red-400"
        >
          Save failed
        </span>
      ) : null}
      <span className="ml-auto text-xs text-neutral-500">{projectName}</span>
    </header>
  );
}
