/**
 * Easing functions and numeric interpolation (T7) — the animation engine's
 * interpolation primitives. Pure TypeScript: no randomness, no clock access,
 * no React/DOM/store imports. Fully deterministic.
 *
 * ## Semantics
 *
 * - The four `Easing` names map to the standard CSS timing-function
   * cubic-bézier curves (linear = identity; the others per CSS Transforms):
 *
 *   | easing       | bézier (x1, y1, x2, y2) |
 *   |--------------|-------------------------|
 *   | linear       | (0, 0, 1, 1)            |
 *   | ease-in      | (0.42, 0, 1, 1)         |
 *   | ease-out     | (0, 0, 0.58, 1)         |
 *   | ease-in-out  | (0.42, 0, 0.58, 1)      |
 *
 * - An easing function maps normalized segment progress `u ∈ [0, 1]` to
 *   eased progress. `u` is clamped to `[0, 1]`; `u = 0` returns exactly `0`
 *   and `u = 1` returns exactly `1`.
 * - `interpolate(from, to, u, easing)` implements the evaluator contract
 *   (ARCHITECTURE.md): `value = from + (to − from) · easing(u)` — the
 *   keyframe's easing shapes the segment that starts at that keyframe; the
 *   last keyframe's easing has no following segment (a timeline concern,
 *   not an interpolation one).
 * - Non-finite inputs propagate (pure arithmetic); there is no other hidden
 *   normalization.
 */

import type { Easing } from "@/project/model";

export type EasingFunction = (u: number) => number;

/** Control points of the cubic-bézier curve for each easing name. */
const EASING_BEZIERS: Record<
  Easing,
  readonly [number, number, number, number]
> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** B(t) along one axis with P0 = 0 and P3 = 1. */
function bezierAxis(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return 3 * oneMinusT * oneMinusT * t * p1 + 3 * oneMinusT * t * t * p2 + t * t * t;
}

/** B'(t) along one axis with P0 = 0 and P3 = 1. */
function bezierAxisDerivative(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return (
    3 * oneMinusT * oneMinusT * p1 +
    6 * oneMinusT * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  );
}

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_EPSILON = 1e-7;
const BISECTION_ITERATIONS = 32;

/**
 * Solves B_x(t) = u for t given the x control points. Newton-Raphson with a
 * bisection fallback (deterministic; converged |B_x(t) − u| < 1e-7).
 */
function solveBezierT(u: number, x1: number, x2: number): number {
  let t = u;
  for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
    const error = bezierAxis(t, x1, x2) - u;
    if (Math.abs(error) < NEWTON_MIN_EPSILON) {
      return t;
    }
    const derivative = bezierAxisDerivative(t, x1, x2);
    if (Math.abs(derivative) < 1e-6) {
      break;
    }
    t -= error / derivative;
  }
  // Bisection fallback for regions where Newton stalls (e.g. x' ≈ 0).
  let low = 0;
  let high = 1;
  t = u;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const x = bezierAxis(t, x1, x2);
    if (Math.abs(x - u) < NEWTON_MIN_EPSILON) {
      return t;
    }
    if (x < u) {
      low = t;
    } else {
      high = t;
    }
    t = (low + high) / 2;
  }
  return t;
}

/**
 * Returns the easing function for `easing`: maps `u ∈ [0, 1]` (clamped) to
 * eased progress, with exact boundary values 0 and 1.
 */
export function getEasingFunction(easing: Easing): EasingFunction {
  const [x1, y1, x2, y2] = EASING_BEZIERS[easing];
  if (easing === "linear") {
    return (u) => clampUnit(u);
  }
  return (u: number): number => {
    const clamped = clampUnit(u);
    if (clamped === 0) {
      return 0;
    }
    if (clamped === 1) {
      return 1;
    }
    const t = solveBezierT(clamped, x1, x2);
    return bezierAxis(t, y1, y2);
  };
}

function clampUnit(u: number): number {
  if (u <= 0) {
    return 0;
  }
  if (u >= 1) {
    return 1;
  }
  return u;
}

/** Linear interpolation: `from + (to − from) · u` (u is not clamped here). */
export function interpolateLinear(from: number, to: number, u: number): number {
  return from + (to - from) * u;
}

/**
 * Interpolates between `from` and `to` at normalized segment progress `u`,
 * applying `easing` to `u` first (the documented evaluator contract).
 */
export function interpolate(
  from: number,
  to: number,
  u: number,
  easing: Easing,
): number {
  return interpolateLinear(from, to, getEasingFunction(easing)(u));
}
