"use client";

import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";

/**
 * Right properties/inspector panel (T6): edits name, fill, and position of
 * the selected element through project store mutations; deleting removes the
 * element and clears the (transient) selection.
 */

const EMPTY_SECTIONS = ["Transform", "Appearance"] as const;

const inputClassName =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-sky-400 focus:outline-none";
const labelClassName = "block text-xs font-medium text-neutral-400";

export default function PropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedElementId);
  const updateElement = useProjectStore((s) => s.updateElement);
  const removeElement = useProjectStore((s) => s.removeElement);
  const select = useEditorStore((s) => s.select);

  const element = selectedId
    ? project.elements.find((el) => el.id === selectedId)
    : undefined;

  function updatePosition(axis: "x" | "y", raw: string): void {
    if (!element || raw.trim() === "") {
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    updateElement(element.id, {
      transform: { ...element.transform, [axis]: next },
    });
  }

  return (
    <aside
      aria-label="Properties"
      className="w-full shrink-0 border-t border-neutral-800 bg-neutral-900 lg:w-72 lg:border-l lg:border-t-0"
    >
      <div className="flex h-full flex-col">
        <h2 className="border-b border-neutral-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Properties
        </h2>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!element ? (
            <>
              <p className="text-xs leading-5 text-neutral-500">
                Nothing selected. Add an element to inspect its properties.
              </p>
              {/* Structural placeholder sections; real fields appear on selection. */}
              {EMPTY_SECTIONS.map((section) => (
                <div key={section} className="space-y-1">
                  <h3 className="text-xs font-medium text-neutral-400">
                    {section}
                  </h3>
                  <p className="text-xs text-neutral-600">&mdash;</p>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                Type:{" "}
                <span className="font-medium text-neutral-300">
                  {element.type}
                </span>
              </p>
              <div className="space-y-1">
                <label htmlFor="property-name" className={labelClassName}>
                  Name
                </label>
                <input
                  id="property-name"
                  value={element.name}
                  onChange={(e) =>
                    updateElement(element.id, { name: e.target.value })
                  }
                  className={inputClassName}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="property-fill" className={labelClassName}>
                  Fill
                </label>
                <input
                  id="property-fill"
                  type="color"
                  value={element.style.fill}
                  onChange={(e) =>
                    updateElement(element.id, {
                      style: { ...element.style, fill: e.target.value },
                    })
                  }
                  className="h-8 w-full rounded-md border border-neutral-700 bg-neutral-950 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="property-x" className={labelClassName}>
                    X
                  </label>
                  <input
                    id="property-x"
                    type="number"
                    value={element.transform.x}
                    onChange={(e) => updatePosition("x", e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="property-y" className={labelClassName}>
                    Y
                  </label>
                  <input
                    id="property-y"
                    type="number"
                    value={element.transform.y}
                    onChange={(e) => updatePosition("y", e.target.value)}
                    className={inputClassName}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  removeElement(element.id);
                  select(null);
                }}
                className="mt-2 rounded-md border border-red-900/60 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
              >
                Delete element
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
