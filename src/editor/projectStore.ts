import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createElement, createProject } from "@/project/defaults";
import type {
  EllipseElement,
  Keyframe,
  Project,
  RectElement,
  SceneElement,
  TextElement,
} from "@/project/model";

/**
 * Union of per-type partial updates, excluding `keyframes`: track changes
 * must go through `addKeyframe`/`removeKeyframe` so the documented ordering
 * and duplicate-time invariants cannot be bypassed. Note: TypeScript does
 * not flag object literals that mix fields from different constituents of a
 * union (e.g. `width` and `rx`), so the store additionally enforces
 * element-type integrity at runtime via a key guard in `updateElement`.
 */
type ElementUpdateOverrides<T extends SceneElement> = Partial<
  Omit<T, "type" | "id" | "keyframes">
>;

export type ElementUpdates =
  | ElementUpdateOverrides<RectElement>
  | ElementUpdateOverrides<EllipseElement>
  | ElementUpdateOverrides<TextElement>;

// Valid update keys per element type, derived from the model factories so
// they stay in sync with the discriminated union automatically. `keyframes`
// is excluded: track edits are only possible via addKeyframe/removeKeyframe.
const ALLOWED_UPDATE_KEYS: Record<SceneElement["type"], ReadonlySet<string>> = {
  rect: updateKeysOf(createElement("rect")),
  ellipse: updateKeysOf(createElement("ellipse")),
  text: updateKeysOf(createElement("text")),
};

function updateKeysOf(element: SceneElement): ReadonlySet<string> {
  return new Set(
    Object.keys(element).filter(
      (key) => key !== "id" && key !== "type" && key !== "keyframes",
    ),
  );
}

/**
 * Transient-independent persistent state: holds the current Project document
 * and its mutations (docs/ARCHITECTURE.md, "State Ownership"). No selection,
 * zoom, tool, or playhead state lives here; the engine never imports this
 * module.
 *
 * All mutations are immutable: inputs (project, elements, keyframes) are never
 * modified; a failed mutation leaves the project reference untouched.
 */
export interface ProjectStoreState {
  project: Project;
  /** Replaces the document wholesale (trusted input; validation is T13). */
  setProject: (project: Project) => void;
  /**
   * Appends a factory-created element. Returns false (no change) if an
   * element with the same id already exists.
   */
  addElement: (element: SceneElement) => boolean;
  /** Removes an element; returns false (no change) for unknown ids. */
  removeElement: (elementId: string) => boolean;
  /**
   * Merges `updates` into the element with `elementId`. `id`, `type`, and
   * `keyframes` are not updatable here (keyframe edits go through
   * `addKeyframe`/`removeKeyframe`); `updates` is a union of per-type
   * partials (see `ElementUpdates`), and a runtime key guard rejects
   * updates containing keys foreign to the target element's type. Returns
   * false (no change) for unknown ids, foreign keys, or `keyframes` input.
   */
  updateElement: (elementId: string, updates: ElementUpdates) => boolean;
  /**
   * Inserts a keyframe keeping every `(elementId, property)` track sorted
   * ascending by `timeMs`. Rejects (returns false, no change): unknown
   * element ids, non-integer `timeMs`, `timeMs` outside
   * `[0, project.durationMs]`, and duplicate `timeMs` on the same
   * element/property track (identical times on different tracks are allowed).
   */
  addKeyframe: (elementId: string, keyframe: Keyframe) => boolean;
  /** Removes a keyframe; returns false (no change) for unknown ids. */
  removeKeyframe: (elementId: string, keyframeId: string) => boolean;
  /** Replaces the canvas; rejects non-finite or non-positive `fps`. */
  setCanvas: (canvas: Project["canvas"]) => boolean;
}

export type ProjectStore = UseBoundStore<StoreApi<ProjectStoreState>>;

function nowIso(): string {
  return new Date().toISOString();
}

export function createProjectStore(
  initialProject: Project = createProject(),
): ProjectStore {
  return create<ProjectStoreState>()((set, get) => ({
    project: initialProject,

    setProject: (project) => {
      set({ project });
    },

    addElement: (element) => {
      const { project } = get();
      if (project.elements.some((el) => el.id === element.id)) {
        return false;
      }
      set({
        project: {
          ...project,
          elements: [...project.elements, element],
          updatedAt: nowIso(),
        },
      });
      return true;
    },

    removeElement: (elementId) => {
      const { project } = get();
      if (!project.elements.some((el) => el.id === elementId)) {
        return false;
      }
      set({
        project: {
          ...project,
          elements: project.elements.filter((el) => el.id !== elementId),
          updatedAt: nowIso(),
        },
      });
      return true;
    },

    updateElement: (elementId, updates) => {
      const { project } = get();
      const element = project.elements.find((el) => el.id === elementId);
      if (!element) {
        return false;
      }
      const allowedKeys = ALLOWED_UPDATE_KEYS[element.type];
      const keys = Object.keys(updates);
      if (keys.some((key) => !allowedKeys.has(key))) {
        return false;
      }
      const nextElement: SceneElement = Object.assign({}, element, updates);
      set({
        project: {
          ...project,
          elements: project.elements.map((el) =>
            el.id === elementId ? nextElement : el,
          ),
          updatedAt: nowIso(),
        },
      });
      return true;
    },

    addKeyframe: (elementId, keyframe) => {
      const { project } = get();
      const element = project.elements.find((el) => el.id === elementId);
      if (!element) {
        return false;
      }
      if (
        !Number.isInteger(keyframe.timeMs) ||
        keyframe.timeMs < 0 ||
        keyframe.timeMs > project.durationMs
      ) {
        return false;
      }
      const duplicateTime = element.keyframes.some(
        (k) => k.property === keyframe.property && k.timeMs === keyframe.timeMs,
      );
      if (duplicateTime) {
        return false;
      }
      const nextElement: SceneElement = {
        ...element,
        // Stable sort: per-track ascending order; same-time keyframes on
        // different tracks keep their relative order.
        keyframes: [...element.keyframes, keyframe].sort(
          (a, b) => a.timeMs - b.timeMs,
        ),
      };
      set({
        project: {
          ...project,
          elements: project.elements.map((el) =>
            el.id === elementId ? nextElement : el,
          ),
          updatedAt: nowIso(),
        },
      });
      return true;
    },

    removeKeyframe: (elementId, keyframeId) => {
      const { project } = get();
      const element = project.elements.find((el) => el.id === elementId);
      if (!element) {
        return false;
      }
      if (!element.keyframes.some((k) => k.id === keyframeId)) {
        return false;
      }
      const nextElement: SceneElement = {
        ...element,
        keyframes: element.keyframes.filter((k) => k.id !== keyframeId),
      };
      set({
        project: {
          ...project,
          elements: project.elements.map((el) =>
            el.id === elementId ? nextElement : el,
          ),
          updatedAt: nowIso(),
        },
      });
      return true;
    },

    setCanvas: (canvas) => {
      const { project } = get();
      if (!Number.isFinite(canvas.fps) || !(canvas.fps > 0)) {
        return false;
      }
      set({
        project: { ...project, canvas: { ...canvas }, updatedAt: nowIso() },
      });
      return true;
    },
  }));
}

/** Application-wide singleton store. */
export const useProjectStore: ProjectStore = createProjectStore();
