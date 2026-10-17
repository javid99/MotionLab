/**
 * Scene evaluator (T9) — resolves every element's animatable properties at a
 * given time. Pure TypeScript: deterministic, no mutation of inputs, no
 * clock/randomness access, no React/DOM/store imports (verified by an
 * import-scan test).
 *
 * ## Contract (ARCHITECTURE.md, "Animation Evaluation & Playback Contract")
 *
 * - `timeMs` is clamped to `[0, project.durationMs]`; the output
 *   `EvaluatedScene.timeMs` reports the clamped time.
 * - Per element-property track (independent per element and per property):
 *   - no keyframes → the base value (`Transform` field or
 *     `style.opacity`);
 *   - `t` ≤ first keyframe → the first keyframe's value (hold);
 *   - `t` ≥ last keyframe → the last keyframe's value (hold);
 *   - otherwise `from + (to − from) · easing(u)` on the surrounding pair,
 *     where the easing stored on the segment's starting keyframe applies
 *     (via `segmentProgress` + `interpolate` — no formulas duplicated here).
 */

import { interpolate } from "@/engine/interpolation";
import {
  clampTime,
  findKeyframeSpan,
  keyframesForProperty,
  segmentProgress,
} from "@/engine/timeline";
import {
  ANIMATABLE_PROPERTIES,
  type AnimatableProperty,
  type EvaluatedElement,
  type EvaluatedScene,
  type Project,
  type SceneElement,
  type Transform,
} from "@/project/model";

/** Transform properties (the animatable list minus opacity, which lives in style). */
const TRANSFORM_PROPERTIES = ANIMATABLE_PROPERTIES.filter(
  (property): property is Exclude<AnimatableProperty, "opacity"> =>
    property !== "opacity",
);

export function evaluate(project: Project, timeMs: number): EvaluatedScene {
  const clampedTimeMs = clampTime(timeMs, project.durationMs);
  return {
    timeMs: clampedTimeMs,
    elements: project.elements.map((element) =>
      evaluateElement(element, clampedTimeMs),
    ),
  };
}

function evaluateElement(
  element: SceneElement,
  timeMs: number,
): EvaluatedElement {
  return {
    id: element.id,
    type: element.type,
    visible: element.visible,
    transform: evaluateTransform(element, timeMs),
    opacity: evaluateProperty(element.style.opacity, element, "opacity", timeMs),
  };
}

function evaluateTransform(
  element: SceneElement,
  timeMs: number,
): Transform {
  const transform: Transform = { ...element.transform };
  for (const property of TRANSFORM_PROPERTIES) {
    transform[property] = evaluateProperty(
      element.transform[property],
      element,
      property,
      timeMs,
    );
  }
  return transform;
}

function evaluateProperty(
  baseValue: number,
  element: SceneElement,
  property: AnimatableProperty,
  timeMs: number,
): number {
  const span = findKeyframeSpan(
    keyframesForProperty(element, property),
    timeMs,
  );
  switch (span.kind) {
    case "empty":
      return baseValue;
    case "hold":
      return span.keyframe.value;
    case "segment": {
      const progress = segmentProgress(timeMs, span.from, span.to);
      return interpolate(
        span.from.value,
        span.to.value,
        progress,
        span.from.easing,
      );
    }
  }
}
