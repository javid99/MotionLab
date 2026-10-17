import { describe, it, expect } from "vitest";
import { createEditorStore } from "./editorStore";
import { createViewTransform } from "@/lib/coords";

describe("editorStore", () => {
  it("starts with no selection and an identity view", () => {
    const store = createEditorStore();
    expect(store.getState().selectedElementId).toBeNull();
    expect(store.getState().view).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("select sets and replaces the selection", () => {
    const store = createEditorStore();
    store.getState().select("el-1");
    expect(store.getState().selectedElementId).toBe("el-1");
    store.getState().select("el-2");
    expect(store.getState().selectedElementId).toBe("el-2");
  });

  it("select(null) clears the selection", () => {
    const store = createEditorStore();
    store.getState().select("el-1");
    store.getState().select(null);
    expect(store.getState().selectedElementId).toBeNull();
  });

  it("setView stores a validated view transform", () => {
    const store = createEditorStore();
    const view = createViewTransform(1.5, 10, -20);
    store.getState().setView(view);
    expect(store.getState().view).toBe(view);
    expect(() => store.getState().setView(createViewTransform(0))).toThrow(
      RangeError,
    );
  });

  it("keeps editor state transient — no project document lives here", () => {
    const store = createEditorStore();
    expect("project" in store.getState()).toBe(false);
  });
});
