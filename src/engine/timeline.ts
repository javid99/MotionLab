/**
 * Timeline utilities (T8) — keyframe lookup, time clamping, and effective
 * duration. Pure TypeScript: no React/DOM/store imports; no mutation of
 * inputs; fully deterministic.
 *
 * ## Contract (ARCHITECTURE.md, "Animation Evaluation & Playback Contract")
 *
 * - Keyframes belong to independent element-property tracks. Track
 *   selection and lookup must never mix keyframes across properties.
 * - Tracks are kept sorted ascending by `timeMs` (the documented store
 *   invariant); duplicate times within a track are rejected upstream by the
 *   store and validation.
 * - Lookup semantics for one track at time `t`:
 *   - no keyframes → `empty` (the evaluator uses the base value);
 *   - `t` ≤ first keyframe time → `hold` at the first keyframe;
 *   - `t` ≥ last keyframe time → `hold` at the last keyframe;
 *   - otherwise the surrounding pair `(a, b)` with
 *     `a.timeMs ≤ t < b.timeMs` forms a `segment`; the easing on `a`
 *     applies to this segment (applied by the evaluator via
 *     `src/engine/interpolation.ts`, not here).
 */

import type {
  AnimatableProperty,
  Keyframe,
  SceneElement,
} from "@/project/model";
import { ANIMATABLE_PROPERTIES } from "@/project/model";

/** The resolved position of `timeMs` within one keyframe track. */
export type KeyframeSpan =
  | { kind: "empty" }
  | { kind: "hold"; keyframe: Keyframe }
  | { kind: "segment"; from: Keyframe; to: Keyframe };

/** Returns the keyframes of one element-property track (new array). */
export function keyframesForProperty(
  element: SceneElement,
  property: AnimatableProperty,
): Keyframe[] {
  return element.keyframes.filter(
    (keyframe) => keyframe.property === property,
  );
}

/**
 * Finds the span for `timeMs` within one property track (sorted ascending,
 * per the store invariant). Never mutates the input.
 */
export function findKeyframeSpan(
  keyframes: readonly Keyframe[],
  timeMs: number,
): KeyframeSpan {
  if (keyframes.length === 0) {
    return { kind: "empty" };
  }
  let from: Keyframe | undefined;
  let to: Keyframe | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.timeMs <= timeMs) {
      from = keyframe;
    } else {
      to = keyframe;
      break;
    }
  }
  if (from === undefined) {
    // t before the first keyframe: hold at the first keyframe.
    return { kind: "hold", keyframe: keyframes[0] };
  }
  if (to === undefined) {
    // t at or after the last keyframe: hold at the last keyframe.
    return { kind: "hold", keyframe: from };
  }
  // Duplicates are rejected upstream; guard against degenerate segments.
  if (from.timeMs === to.timeMs) {
    return { kind: "hold", keyframe: from };
  }
  return { kind: "segment", from, to };
}

/**
 * Normalized progress of `timeMs` within the segment `[from, to]`:
 * `(timeMs − from.timeMs) / (to.timeMs − from.timeMs)`. Requires
 * `from.timeMs < to.timeMs`; throws `RangeError` for degenerate intervals
 * or non-finite `timeMs`.
 */
export function segmentProgress(
  timeMs: number,
  from: Keyframe,
  to: Keyframe,
): number {
  if (!Number.isFinite(timeMs)) {
    throw new RangeError(`Invalid timeMs: ${timeMs}`);
  }
  if (to.timeMs <= from.timeMs) {
    throw new RangeError(
      `Invalid segment: from ${from.timeMs} to ${to.timeMs}`,
    );
  }
  return (timeMs - from.timeMs) / (to.timeMs - from.timeMs);
}

/**
 * Clamps `timeMs` to `[0, durationMs]`. Throws `RangeError` for non-finite
 * `timeMs` or a non-finite/non-positive `durationMs`.
 */
export function clampTime(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs)) {
    throw new RangeError(`Invalid timeMs: ${timeMs}`);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError(`Invalid durationMs: ${durationMs}`);
  }
  return Math.min(Math.max(timeMs, 0), durationMs);
}

/**
 * Effective duration of one keyframe track: the last keyframe's `timeMs`
 * (0 for an empty track). Order-independent.
 */
export function effectiveDurationMs(
  keyframes: readonly Keyframe[],
): number {
  let max = 0;
  for (const keyframe of keyframes) {
    if (keyframe.timeMs > max) {
      max = keyframe.timeMs;
    }
  }
  return max;
}

/**
 * Effective duration of an element: the maximum keyframe time across all of
 * its property tracks (0 when the element has no keyframes).
 */
export function elementEffectiveDurationMs(element: SceneElement): number {
  let max = 0;
  for (const property of ANIMATABLE_PROPERTIES) {
    const duration = effectiveDurationMs(
      keyframesForProperty(element, property),
    );
    if (duration > max) {
      max = duration;
    }
  }
  return max;
}

/**
 * Normalized position of `timeMs` within `[0, durationMs]`, clamped to
 * `[0, 1]` — the deterministic time→position mapping used by the timeline
 * UI. Throws `RangeError` for non-finite inputs or a non-positive duration.
 */
export function timeToFraction(timeMs: number, durationMs: number): number {
  return clampTime(timeMs, durationMs) / durationMs;
}

/**
 * Inverse of `timeToFraction`: the time in milliseconds for a normalized
 * `fraction`, clamped to `[0, durationMs]`. Throws `RangeError` for
 * non-finite inputs or a non-positive duration.
 */
export function fractionToTime(fraction: number, durationMs: number): number {
  if (!Number.isFinite(fraction)) {
    throw new RangeError(`Invalid fraction: ${fraction}`);
  }
  return clampTime(fraction * durationMs, durationMs);
}
