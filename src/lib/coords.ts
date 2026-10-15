/**
 * Coordinate conversion between screen, canvas, and scene space (T4).
 *
 * This is the single place where view-transform math lives: no other module
 * may do pointer/coordinate math (ARCHITECTURE.md Principle 4). Pure
 * TypeScript — no React, no DOM, no store, no engine imports.
 *
 * ## Coordinate spaces
 *
 * - **Scene space** — the project's logical units (origin: top-left of
 *   `Project.canvas`; element anchors follow the element anchor convention
 *   in ARCHITECTURE.md). This is where `Transform` values live.
 * - **Canvas space** — scene coordinates multiplied by the zoom scale
 *   (origin: top-left). This is the zoomed world before panning:
 *   `canvas = scene * scale`.
 * - **Screen space** — viewport pixels relative to the canvas viewport
 *   element's top-left (obtaining that origin from a DOM rect is the
 *   caller's job; this module never touches the DOM):
 *   `screen = canvas + offset`.
 *
 * Composed: `screen = scene * scale + offset`.
 *
 * ## Validation and numeric behavior
 *
 * - `ViewTransform` inputs are validated: `scale` must be finite and > 0,
 *   offsets must be finite; violations throw `RangeError`.
 * - Point arguments are not validated: conversion functions are pure
 *   arithmetic and non-finite inputs propagate deterministically (no silent
 *   clamping, rounding, or normalization anywhere).
 * - Round trips are inverses up to floating-point precision
 *   (asserted in tests with 1e-9 tolerance).
 */

export interface Point {
  x: number;
  y: number;
}

/** The view transform: `screen = scene * scale + offset`. */
export interface ViewTransform {
  /** Zoom factor; finite and > 0. */
  scale: number;
  /** Pan offset applied in screen space (canvas-space origin displacement). */
  offsetX: number;
  offsetY: number;
}

function validateView(view: ViewTransform): void {
  if (!Number.isFinite(view.scale) || view.scale <= 0) {
    throw new RangeError(`Invalid view scale: ${view.scale}`);
  }
  if (!Number.isFinite(view.offsetX) || !Number.isFinite(view.offsetY)) {
    throw new RangeError(
      `Invalid view offset: (${view.offsetX}, ${view.offsetY})`,
    );
  }
}

/** Creates a view transform, validating the documented invariants. */
export function createViewTransform(
  scale: number,
  offsetX = 0,
  offsetY = 0,
): ViewTransform {
  const view: ViewTransform = { scale, offsetX, offsetY };
  validateView(view);
  return view;
}

/** scene → canvas: `canvas = scene * scale`. */
export function sceneToCanvas(point: Point, scale: number): Point {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`Invalid scale: ${scale}`);
  }
  return { x: point.x * scale, y: point.y * scale };
}

/** canvas → scene: the inverse of sceneToCanvas. */
export function canvasToScene(point: Point, scale: number): Point {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`Invalid scale: ${scale}`);
  }
  return { x: point.x / scale, y: point.y / scale };
}

/** canvas → screen: `screen = canvas + offset`. */
export function canvasToScreen(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

/** screen → canvas: the inverse of canvasToScreen. */
export function screenToCanvas(point: Point, offset: Point): Point {
  return { x: point.x - offset.x, y: point.y - offset.y };
}

/** scene → screen through the full view transform. */
export function sceneToScreen(point: Point, view: ViewTransform): Point {
  validateView(view);
  return canvasToScreen(sceneToCanvas(point, view.scale), {
    x: view.offsetX,
    y: view.offsetY,
  });
}

/** screen → scene through the full inverse view transform. */
export function screenToScene(point: Point, view: ViewTransform): Point {
  validateView(view);
  return canvasToScene(screenToCanvas(point, {
    x: view.offsetX,
    y: view.offsetY,
  }), view.scale);
}

/**
 * Returns a new view with `nextScale` such that the scene point currently
 * under `focalScreen` stays fixed on screen (zoom around a focal point).
 * `focalScreen` must be finite; `nextScale` must be finite and > 0.
 */
export function zoomAtScreen(
  view: ViewTransform,
  focalScreen: Point,
  nextScale: number,
): ViewTransform {
  validateView(view);
  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    throw new RangeError(`Invalid next scale: ${nextScale}`);
  }
  if (
    !Number.isFinite(focalScreen.x) ||
    !Number.isFinite(focalScreen.y)
  ) {
    throw new RangeError(
      `Invalid focal point: (${focalScreen.x}, ${focalScreen.y})`,
    );
  }
  const focalScene = screenToScene(focalScreen, view);
  return {
    scale: nextScale,
    offsetX: focalScreen.x - focalScene.x * nextScale,
    offsetY: focalScreen.y - focalScene.y * nextScale,
  };
}
