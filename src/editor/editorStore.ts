import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createViewTransform, type ViewTransform } from "@/lib/coords";

/**
 * Transient editor state (docs/ARCHITECTURE.md, "State Ownership"):
 * selection, the playhead, and the canvas view transform. Never persisted;
 * kept strictly separate from the persistent project document in
 * `projectStore`. The playhead is written by the playback host adapter
 * (see `src/editor/playback.ts`) — never by the project store.
 */
export interface EditorStoreState {
  /** Currently selected element id, or null when nothing is selected. */
  selectedElementId: string | null;
  /** Selects an element; pass null to clear the selection. */
  select: (elementId: string | null) => void;
  /** Transient playhead in milliseconds; never persisted. */
  playheadMs: number;
  /** Writes the transient playhead (playback host adapter + scrubbing). */
  setPlayhead: (timeMs: number) => void;
  /** Canvas view transform (zoom/pan). Identity until zoom UI exists. */
  view: ViewTransform;
  setView: (view: ViewTransform) => void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorStoreState>>;

export function createEditorStore(): EditorStore {
  return create<EditorStoreState>()((set) => ({
    selectedElementId: null,
    select: (elementId) => set({ selectedElementId: elementId }),
    playheadMs: 0,
    setPlayhead: (timeMs) => set({ playheadMs: timeMs }),
    view: createViewTransform(1, 0, 0),
    setView: (view) => set({ view }),
  }));
}

/** Application-wide singleton editor store. */
export const useEditorStore: EditorStore = createEditorStore();
