import {
  type AnimatableProperty,
  type ElementBase,
  type Easing,
  type EllipseElement,
  type Keyframe,
  type Project,
  type RectElement,
  type SceneElement,
  type TextElement,
} from "./model";
import { createId } from "@/lib/id";

/** Everything except `type` and `id` can be overridden; `id` is always generated. */
export type ElementOverrides<T extends SceneElement> = Partial<Omit<T, "type" | "id">>;

const DEFAULT_ELEMENT_NAMES: Record<SceneElement["type"], string> = {
  rect: "Rect",
  ellipse: "Ellipse",
  text: "Text",
};

const DEFAULT_FILL = "#808080";

function createBaseElement(name: string): ElementBase {
  return {
    id: createId(),
    name,
    locked: false,
    visible: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    style: { fill: DEFAULT_FILL, opacity: 1 },
    keyframes: [],
  };
}

export function createElement(
  type: "rect",
  overrides?: ElementOverrides<RectElement>,
): RectElement;
export function createElement(
  type: "ellipse",
  overrides?: ElementOverrides<EllipseElement>,
): EllipseElement;
export function createElement(
  type: "text",
  overrides?: ElementOverrides<TextElement>,
): TextElement;
export function createElement(
  type: SceneElement["type"],
  overrides?: ElementOverrides<RectElement> &
    ElementOverrides<EllipseElement> &
    ElementOverrides<TextElement>,
): SceneElement {
  const base = createBaseElement(DEFAULT_ELEMENT_NAMES[type]);
  if (type === "rect") {
    return {
      ...base,
      type: "rect",
      width: 100,
      height: 100,
      cornerRadius: 0,
      ...overrides,
    };
  }
  if (type === "ellipse") {
    return { ...base, type: "ellipse", rx: 50, ry: 50, ...overrides };
  }
  return {
    ...base,
    type: "text",
    text: "Text",
    fontSize: 16,
    fontFamily: "sans-serif",
    fontWeight: "400",
    ...overrides,
  };
}

export interface ProjectOverrides {
  name?: string;
  canvas?: { width: number; height: number; fps: number };
  durationMs?: number;
  elements?: SceneElement[];
}

export function createProject(overrides: ProjectOverrides = {}): Project {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: "Untitled project",
    canvas: { width: 1280, height: 720, fps: 30 },
    durationMs: 5000,
    elements: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates a keyframe. Callers must pass an integer `timeMs` within
 * `[0, project.durationMs]`; runtime enforcement lives in the store
 * mutation (T2) and the validation module (T13).
 */
export function createKeyframe(
  property: AnimatableProperty,
  timeMs: number,
  value: number,
  easing: Easing = "linear",
): Keyframe {
  return { id: createId(), property, timeMs, value, easing };
}
