/**
 * Element transform composition shared by the SVG renderer (T5) and the CSS
 * exporter (T15) — lives in `lib/` so both may import it under the
 * dependency rule. Pure TypeScript; no React/DOM/store/engine imports.
 *
 * ## Contract (ARCHITECTURE.md, "Transform composition")
 *
 * - Composition order: `translate(x, y) → rotate(rotation) → scale(sx, sy)`.
 * - Rotation and scale act about the element's center, derived from static
 *   geometry and the top-left anchor convention: for a rect at (x, y) with
 *   size (w, h) the center is (x + w/2, y + h/2).
 * - Text elements use deterministic bounding-box constants (ADR-008,
 *   owner-approved): width = 0.6 × fontSize × character count, height =
 *   1.2 × fontSize, top-left at (x, y). No font measurement.
 */

import type { SceneElement, Transform } from "@/project/model";
import type { Point } from "@/lib/coords";

/** Confirmed v1 text bounding-box constants (ADR-008). */
export const TEXT_WIDTH_FACTOR = 0.6;
export const TEXT_HEIGHT_FACTOR = 1.2;

export interface Size {
  width: number;
  height: number;
}

/**
 * Deterministic local bounding-box size of an element's static geometry.
 * Geometry is drawn at the local origin, so the local bounding box is
 * [0, width] × [0, height].
 */
export function getElementSize(element: SceneElement): Size {
  switch (element.type) {
    case "rect":
      return { width: element.width, height: element.height };
    case "ellipse":
      return { width: element.rx * 2, height: element.ry * 2 };
    case "text":
      return {
        width: TEXT_WIDTH_FACTOR * element.fontSize * element.text.length,
        height: TEXT_HEIGHT_FACTOR * element.fontSize,
      };
  }
}

/**
 * Center of the element in user units for the given evaluated position:
 * `(transform.x + width/2, transform.y + height/2)`.
 */
export function getElementCenter(
  element: SceneElement,
  transform: Transform,
): Point {
  const size = getElementSize(element);
  return {
    x: transform.x + size.width / 2,
    y: transform.y + size.height / 2,
  };
}

/**
 * Composes the SVG `transform` attribute implementing the canonical
 * composition: the element's local geometry is drawn at the local origin,
 * the local center is moved to the origin, rotated and scaled, then placed
 * at the absolute center. For rotation = 0 and scale = 1 this reduces to
 * `translate(x, y)`.
 */
export function composeElementTransform(
  transform: Transform,
  size: Size,
): string {
  const cx = size.width / 2;
  const cy = size.height / 2;
  return [
    `translate(${transform.x + cx} ${transform.y + cy})`,
    `rotate(${transform.rotation})`,
    `scale(${transform.scaleX} ${transform.scaleY})`,
    `translate(${-cx} ${-cy})`,
  ].join(" ");
}

/**
 * CSS `transform-origin` for the exported element (ADR-008, corrected
 * 2026-10-15): the element's **local** center `(width/2, height/2)` in
 * view-box user units, emitted with `transform-box: view-box`.
 *
 * Rationale: CSS applies the transform list as
 * `M = T(origin) · translate(x, y) · rotate · scale · T(-origin)`. With the
 * translation inside the list, an absolute-center origin `(x + w/2, y + h/2)`
 * yields a matrix whose rotation center drifts with the translation and does
 * not match the renderer. With the local-center origin the CSS matrix is
 * exactly the renderer matrix:
 * `T(g) · T(x,y) · R · S · T(-g) = T(x + g) · R · S · T(-g)`, where
 * `g = (w/2, h/2)` — identical to `composeElementTransform`. Verified by the
 * matrix equivalence tests in `elementTransform.test.ts` and to be asserted
 * end-to-end against emitted CSS in T15.
 */
export function getCssTransformOrigin(element: SceneElement): Point {
  const size = getElementSize(element);
  return { x: size.width / 2, y: size.height / 2 };
}
