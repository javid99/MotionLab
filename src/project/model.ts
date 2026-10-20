/**
 * Persistent project data model — the unit of persistence (see
 * docs/ARCHITECTURE.md, "Project Data Model"). Types plus the runtime list
 * of animatable properties; factories live in `defaults.ts`, runtime
 * validation of untrusted data in `validate.ts` (T13).
 */

export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/** Runtime list of the easing names (type-checked against the union). */
export const EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const satisfies readonly Easing[];

/** Numeric properties the engine can animate. */
export type AnimatableProperty =
  | "x"
  | "y"
  | "rotation"
  | "scaleX"
  | "scaleY"
  | "opacity";

/** Runtime list of the animatable properties (type-checked against the union). */
export const ANIMATABLE_PROPERTIES = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "opacity",
] as const satisfies readonly AnimatableProperty[];

/** Base (rest) transform; the single source of truth for x/y/rotation/scale. */
export interface Transform {
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface Keyframe {
  id: string;
  property: AnimatableProperty;
  /** Integer, `0 <= timeMs <= project.durationMs`. */
  timeMs: number;
  value: number;
  /**
   * Easing applied to the segment that STARTS at this keyframe (the segment
   * ending at the next keyframe; on the last keyframe it is inert).
   */
  easing: Easing;
}

/**
 * Shared element fields. `transform` holds the base values for the animatable
 * transform properties; `style.opacity` is the base value for the `opacity`
 * property. There is deliberately no separate `base` record — transform/style
 * ARE the base values.
 */
export interface ElementBase {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  transform: Transform;
  style: { fill: string; opacity: number };
  keyframes: Keyframe[];
}

export interface RectElement extends ElementBase {
  type: "rect";
  /** Static geometry, not animatable in v1. */
  width: number;
  height: number;
  cornerRadius: number;
}

export interface EllipseElement extends ElementBase {
  type: "ellipse";
  rx: number;
  ry: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  /** Static content, not animatable in v1. */
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}

/** Discriminated union — narrow on `type` (exhaustive switch). */
export type SceneElement = RectElement | EllipseElement | TextElement;

export interface Project {
  id: string;
  name: string;
  canvas: { width: number; height: number; fps: number };
  /** Integer, > 0. */
  durationMs: number;
  elements: SceneElement[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/** Engine output: fully resolved values; no keyframe logic downstream. */
export interface EvaluatedElement {
  id: string;
  type: SceneElement["type"];
  visible: boolean;
  transform: Transform;
  opacity: number;
}

export interface EvaluatedScene {
  timeMs: number;
  elements: EvaluatedElement[];
}
