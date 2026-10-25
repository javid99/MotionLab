/**
 * CSS keyframes exporter (T15) — implements the revised ADR-008 contract
 * (2026-10-21, Option A): each animated MotionLab property becomes its own
 * independently animated registered custom property.
 *
 * ## Output structure
 *
 * 1. One `@property` registration per animated transform component
 *    (`--mlab-x`, `--mlab-y`, `--mlab-rotation`, `--mlab-scale-x`,
 *    `--mlab-scale-y`; syntax `<number>`, `inherits: false`,
 *    `initial-value: 0`), emitted once per used property in documented
 *    property order. `opacity` is a native CSS property — no registration.
 * 2. Per element (project order): one `@keyframes` rule per animated
 *    property (`mlab-<elementId>-x` … `mlab-<elementId>-opacity`) whose
 *    blocks declare `--mlab-*: <value>;` (native `opacity:` for the opacity
 *    rule), followed by the element rule.
 * 3. The element rule composes the canonical transform via
 *    `translate(calc(var(--mlab-x, <bx>) * 1px), …) rotate(…) scale(…)`
 *    with `transform-box: view-box` and the local-center
 *    `transform-origin` from `getCssTransformOrigin` (matrix-equivalent to
 *    the SVG renderer). The var() fallbacks carry the element's base
 *    values. The `animation` shorthand lists one entry per animated
 *    property: `<name> <durationMs>ms linear 0ms 1 normal forwards`.
 *
 * ## Semantics (unchanged ADR-008 rules, applied per property)
 *
 * - Percentages: `timeMs / durationMs × 100`, at most 6 decimal places,
 *   trailing zeros trimmed.
 * - Endpoints: `0%` and `100%` blocks are always emitted per animated
 *   property with values `evaluate(project, 0)` / `evaluate(project,
 *   durationMs)` (hold semantics). Authored keyframes at the endpoints
 *   merge into exactly one block, which carries the authored easing.
 * - Easing: the keyframe's easing shapes the segment starting at its block
 *   (`animation-timing-function` inside that block). Blocks without a
 *   following authored keyframe (generated endpoints, last authored
 *   keyframe) carry no timing declaration — the segment to/from them is a
 *   constant hold, so no timing is needed.
 * - Percentage collisions: two distinct times rounding to the same
 *   percentage merge deterministically; the later keyframe wins.
 * - Per-property independence: each property's rule contains only its own
 *   keyframe times — foreign times can never split or re-time another
 *   property's segments.
 *
 * Pure and deterministic: no React, DOM, Zustand, IndexedDB, or browser
 * APIs; the input project is never mutated; identical input produces
 * identical output.
 */

import { evaluate } from "@/engine/evaluator";
import { keyframesForProperty } from "@/engine/timeline";
import {
  ANIMATABLE_PROPERTIES,
  type AnimatableProperty,
  type EvaluatedElement,
  type Project,
  type SceneElement,
} from "@/project/model";
import { ProjectValidationError, validateProject } from "@/project/validate";
import { getCssTransformOrigin } from "@/lib/elementTransform";

/** Element ids are embedded in selectors and animation names. */
const CSS_ID_SAFE = /^[A-Za-z0-9_-]+$/;

const TRANSFORM_CUSTOM_PROPERTIES = {
  x: "--mlab-x",
  y: "--mlab-y",
  rotation: "--mlab-rotation",
  scaleX: "--mlab-scale-x",
  scaleY: "--mlab-scale-y",
} as const satisfies Record<Exclude<AnimatableProperty, "opacity">, string>;

const ANIMATION_SUFFIXES: Record<AnimatableProperty, string> = {
  x: "x",
  y: "y",
  rotation: "rotation",
  scaleX: "scale-x",
  scaleY: "scale-y",
  opacity: "opacity",
};

/** Documented animation naming: `mlab-<elementId>-<property>`. */
export function animationName(
  elementId: string,
  property: AnimatableProperty,
): string {
  return `mlab-${elementId}-${ANIMATION_SUFFIXES[property]}`;
}

function formatPercentage(timeMs: number, durationMs: number): string {
  return ((timeMs / durationMs) * 100).toFixed(6).replace(/\.?0+$/, "");
}

function isAnimated(element: SceneElement, property: AnimatableProperty): boolean {
  return keyframesForProperty(element, property).length > 0;
}

interface PropertyEntry {
  timeMs: number;
  pct: string;
  value: number;
  /** Easing claimed by this block for the segment starting at it. */
  claim: string | null;
}

function createElementEvaluator(
  project: Project,
  element: SceneElement,
): (timeMs: number) => EvaluatedElement {
  const cache = new Map<number, EvaluatedElement>();
  return (timeMs) => {
    const cached = cache.get(timeMs);
    if (cached) {
      return cached;
    }
    const evaluated = evaluate(project, timeMs).elements.find(
      (candidate) => candidate.id === element.id,
    );
    if (!evaluated) {
      throw new Error(`element "${element.id}" missing from evaluated scene`);
    }
    cache.set(timeMs, evaluated);
    return evaluated;
  };
}

function propertyValue(
  evaluated: EvaluatedElement,
  property: AnimatableProperty,
): number {
  return property === "opacity"
    ? evaluated.opacity
    : evaluated.transform[property];
}

function propertyEntries(
  project: Project,
  element: SceneElement,
  property: AnimatableProperty,
  evaluateAt: (timeMs: number) => EvaluatedElement,
): PropertyEntry[] {
  const durationMs = project.durationMs;
  const authored = keyframesForProperty(element, property);
  const times = [
    ...new Set<number>([...authored.map((k) => k.timeMs), 0, durationMs]),
  ].sort((a, b) => a - b);
  const entries: PropertyEntry[] = times.map((timeMs) => {
    const keyframe = authored.find((k) => k.timeMs === timeMs);
    const hasNextAuthored = authored.some((k) => k.timeMs > timeMs);
    return {
      timeMs,
      pct: formatPercentage(timeMs, durationMs),
      value: propertyValue(evaluateAt(timeMs), property),
      claim: keyframe && hasNextAuthored ? keyframe.easing : null,
    };
  });
  // Percentage-collision merge: ascending times, later keyframe wins.
  const merged: PropertyEntry[] = [];
  for (const entry of entries) {
    const previous = merged[merged.length - 1];
    if (previous && previous.pct === entry.pct) {
      merged[merged.length - 1] = entry;
    } else {
      merged.push(entry);
    }
  }
  return merged;
}

function keyframesRule(
  project: Project,
  element: SceneElement,
  property: AnimatableProperty,
  evaluateAt: (timeMs: number) => EvaluatedElement,
): string {
  const entries = propertyEntries(project, element, property, evaluateAt);
  const declaration = (value: number): string =>
    property === "opacity"
      ? `opacity: ${value};`
      : `${TRANSFORM_CUSTOM_PROPERTIES[property]}: ${value};`;
  const blocks = entries.map((entry) =>
    entry.claim
      ? `  ${entry.pct}% {\n    ${declaration(entry.value)}\n    animation-timing-function: ${entry.claim};\n  }`
      : `  ${entry.pct}% {\n    ${declaration(entry.value)}\n  }`,
  );
  return `@keyframes ${animationName(element.id, property)} {\n${blocks.join("\n")}\n}`;
}

function geometryLines(element: SceneElement): string[] {
  switch (element.type) {
    case "rect":
      return [
        `width: ${element.width}px;`,
        `height: ${element.height}px;`,
        `rx: ${element.cornerRadius}px;`,
      ];
    case "ellipse":
      return [`rx: ${element.rx}px;`, `ry: ${element.ry}px;`];
    case "text":
      return [
        `font-family: ${element.fontFamily};`,
        `font-size: ${element.fontSize}px;`,
        `font-weight: ${element.fontWeight};`,
      ];
  }
}

function elementRule(
  project: Project,
  element: SceneElement,
  animated: AnimatableProperty[],
): string {
  const origin = getCssTransformOrigin(element);
  const transform = element.transform;
  const animation =
    animated.length > 0
      ? `\n  animation: ${animated
          .map(
            (property) =>
              `${animationName(element.id, property)} ${project.durationMs}ms linear 0ms 1 normal forwards`,
          )
          .join(", ")};`
      : "";
  return `[data-element-id="${element.id}"] {
  fill: ${element.style.fill};
${geometryLines(element)
  .map((line) => `  ${line}`)
  .join("\n")}
  transform-box: view-box;
  transform-origin: ${origin.x}px ${origin.y}px;
  transform: translate(calc(var(${TRANSFORM_CUSTOM_PROPERTIES.x}, ${transform.x}) * 1px), calc(var(${TRANSFORM_CUSTOM_PROPERTIES.y}, ${transform.y}) * 1px)) rotate(calc(var(${TRANSFORM_CUSTOM_PROPERTIES.rotation}, ${transform.rotation}) * 1deg)) scale(calc(var(${TRANSFORM_CUSTOM_PROPERTIES.scaleX}, ${transform.scaleX})), calc(var(${TRANSFORM_CUSTOM_PROPERTIES.scaleY}, ${transform.scaleY})));
  opacity: ${element.style.opacity};${animation}
}`;
}

function propertyRegistration(property: Exclude<AnimatableProperty, "opacity">): string {
  return `@property ${TRANSFORM_CUSTOM_PROPERTIES[property]} {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}`;
}

/**
 * Exports a project as a CSS keyframes stylesheet per the revised ADR-008
 * contract. Throws `ProjectValidationError` for invalid input (including
 * element ids that cannot be embedded in CSS identifiers).
 */
export function exportProjectCss(data: unknown): string {
  const project = validateProject(data);
  const unsafeIds = project.elements.filter(
    (element) => !CSS_ID_SAFE.test(element.id),
  );
  if (unsafeIds.length > 0) {
    throw new ProjectValidationError(
      unsafeIds.map(
        (element) =>
          `element id "${element.id}" contains characters not allowed in CSS identifiers`,
      ),
    );
  }

  const animatedProperties = new Set<AnimatableProperty>();
  for (const element of project.elements) {
    for (const property of ANIMATABLE_PROPERTIES) {
      if (isAnimated(element, property)) {
        animatedProperties.add(property);
      }
    }
  }

  const parts: string[] = [];
  for (const property of ANIMATABLE_PROPERTIES) {
    if (property !== "opacity" && animatedProperties.has(property)) {
      parts.push(
        propertyRegistration(property as Exclude<AnimatableProperty, "opacity">),
      );
    }
  }
  for (const element of project.elements) {
    const animated = ANIMATABLE_PROPERTIES.filter((property) =>
      isAnimated(element, property),
    );
    const evaluateAt = createElementEvaluator(project, element);
    for (const property of animated) {
      parts.push(keyframesRule(project, element, property, evaluateAt));
    }
    parts.push(elementRule(project, element, animated));
  }
  return parts.length > 0 ? `${parts.join("\n\n")}\n` : "";
}
