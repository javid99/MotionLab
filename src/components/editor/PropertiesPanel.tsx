"use client";

import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { evaluate } from "@/engine/evaluator";
import { keyframesForProperty } from "@/engine/timeline";
import { createKeyframe } from "@/project/defaults";
import {
  ANIMATABLE_PROPERTIES,
  type AnimatableProperty,
} from "@/project/model";

/**
 * Right properties/inspector panel (T6): edits the selected element through
 * project store mutations — name, fill, and the full animatable property set,
 * plus the text content of Text elements. Deleting removes the element and
 * clears the (transient) selection.
 *
 * Animation authoring (discoverability follow-up): each animatable property
 * row carries a diamond button that adds/removes a keyframe at the current
 * playhead. Property inputs display the *evaluated* value at the playhead and
 * write through `setAnimatableValue`, which updates the base value for an
 * un-keyframed property and writes a keyframe at the playhead once the
 * property has a track. Without that rule, editing a value after keyframing
 * only changed the (masked) base value and produced no animation.
 */

const EMPTY_SECTIONS = ["Transform", "Appearance"] as const;

const inputClassName =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-sky-400 focus:outline-none";
const labelClassName = "block text-xs font-medium text-neutral-400";

const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: "X",
  y: "Y",
  rotation: "Rotation",
  scaleX: "Scale X",
  scaleY: "Scale Y",
  opacity: "Opacity",
};

const PROPERTY_STEPS: Record<AnimatableProperty, number> = {
  x: 1,
  y: 1,
  rotation: 1,
  scaleX: 0.1,
  scaleY: 0.1,
  opacity: 0.05,
};

function displayNumber(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toFixed(3));
}

export default function PropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedElementId);
  const playheadMs = useEditorStore((s) => s.playheadMs);
  const updateElement = useProjectStore((s) => s.updateElement);
  const setAnimatableValue = useProjectStore((s) => s.setAnimatableValue);
  const addKeyframe = useProjectStore((s) => s.addKeyframe);
  const removeKeyframe = useProjectStore((s) => s.removeKeyframe);
  const removeElement = useProjectStore((s) => s.removeElement);
  const select = useEditorStore((s) => s.select);

  const element = selectedId
    ? project.elements.find((el) => el.id === selectedId)
    : undefined;
  const evaluated = selectedId
    ? evaluate(project, playheadMs).elements.find((el) => el.id === selectedId)
    : undefined;
  // Keyframe times are integers (model invariant); the playhead may be
  // fractional during playback, so all keyframe authoring is rounded.
  const editTimeMs = Math.round(playheadMs);

  function valueAtPlayhead(property: AnimatableProperty): number {
    if (!evaluated) {
      return 0;
    }
    return property === "opacity"
      ? evaluated.opacity
      : evaluated.transform[property];
  }

  function commitProperty(property: AnimatableProperty, raw: string): void {
    if (!element || raw.trim() === "") {
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    setAnimatableValue(element.id, property, next, editTimeMs);
  }

  function keyframeAtPlayhead(property: AnimatableProperty) {
    if (!element) {
      return undefined;
    }
    return keyframesForProperty(element, property).find(
      (keyframe) => keyframe.timeMs === editTimeMs,
    );
  }

  function toggleKeyframe(property: AnimatableProperty): void {
    if (!element) {
      return;
    }
    const existing = keyframeAtPlayhead(property);
    if (existing) {
      removeKeyframe(element.id, existing.id);
      return;
    }
    addKeyframe(
      element.id,
      createKeyframe(property, editTimeMs, valueAtPlayhead(property)),
    );
  }

  const textElement = element?.type === "text" ? element : undefined;

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
              {textElement ? (
                <div className="space-y-1">
                  <label htmlFor="property-text" className={labelClassName}>
                    Content
                  </label>
                  <textarea
                    id="property-text"
                    rows={3}
                    value={textElement.text}
                    onChange={(e) =>
                      updateElement(textElement.id, { text: e.target.value })
                    }
                    className={`${inputClassName} resize-y`}
                  />
                  <p className="text-[11px] leading-4 text-neutral-500">
                    Line breaks are kept in the project; the v1 canvas renders
                    one line of text.
                  </p>
                </div>
              ) : null}
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

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-medium text-neutral-400">
                    Animation
                  </h3>
                  <span
                    data-testid="property-playhead"
                    className="text-[10px] text-neutral-500"
                  >
                    playhead {editTimeMs} ms
                  </span>
                </div>
                <p className="text-[11px] leading-4 text-neutral-500">
                  <span aria-hidden="true">&#9671;</span> adds a keyframe at the
                  playhead. Editing a property that already has keyframes writes
                  a keyframe at the playhead.
                </p>
                {ANIMATABLE_PROPERTIES.map((property) => {
                  const label = PROPERTY_LABELS[property];
                  const hasKeyframe = keyframeAtPlayhead(property) !== undefined;
                  return (
                    <div key={property} className="flex items-end gap-1.5">
                      <div className="min-w-0 flex-1 space-y-1">
                        <label
                          htmlFor={`property-${property}`}
                          className={labelClassName}
                        >
                          {label}
                        </label>
                        <input
                          id={`property-${property}`}
                          type="number"
                          step={PROPERTY_STEPS[property]}
                          value={displayNumber(valueAtPlayhead(property))}
                          onChange={(e) =>
                            commitProperty(property, e.target.value)
                          }
                          className={inputClassName}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={
                          hasKeyframe
                            ? `Remove ${label} keyframe at playhead`
                            : `Add ${label} keyframe at playhead`
                        }
                        aria-pressed={hasKeyframe}
                        title={
                          hasKeyframe
                            ? `Remove ${label} keyframe at ${editTimeMs} ms`
                            : `Add ${label} keyframe at ${editTimeMs} ms`
                        }
                        onClick={() => toggleKeyframe(property)}
                        className={`mb-0.5 h-8 w-8 shrink-0 rounded-md border text-sm leading-none focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
                          hasKeyframe
                            ? "border-sky-400 bg-sky-950/60 text-sky-300"
                            : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                        }`}
                      >
                        <span aria-hidden="true">
                          {hasKeyframe ? "\u25c6" : "\u25c7"}
                        </span>
                      </button>
                    </div>
                  );
                })}
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
