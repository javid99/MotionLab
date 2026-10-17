import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createViewTransform, type ViewTransform } from "@/lib/coords";

/**
 * Transient editor state (docs/ARCHITECTURE.md, "State Ownership"):
 * selection, and the canvas view transform. Never persisted; kept strictly
 * separate from the persistent project document in `projectStore`.
 */
export interface EditorStoreState {
  /** Currently selected element id, or null when nothing is selected. */
  selectedElementId: string | null;
  /** Selects an element; pass null to clear the selection. */
  select: (elementId: string | null) => void;
  /** Canvas view transform (zoom/pan). Identity until zoom UI exists. */
  view: ViewTransform;
  setView: (view: ViewTransform) => void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorStoreState>>;

export function createEditorStore(): EditorStore {
  return create<EditorStoreState>()((set) => ({
    selectedElementId: null,
    select: (elementId) => set({ selectedElementId: elementId }),
    view: createViewTransform(1, 0, 0),
    setView: (view) => set({ view }),
  }));
}

/** Application-wide singleton editor store. */
export const useEditorStore: EditorStore = createEditorStore();
