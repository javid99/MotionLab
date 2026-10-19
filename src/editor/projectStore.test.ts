import { describe, it, expect } from "vitest";
import {
  createProjectStore,
  type ElementUpdates,
  type ProjectStore,
} from "./projectStore";
import { createKeyframe, createElement, createProject } from "@/project/defaults";
import type {
  EllipseElement,
  Keyframe,
  Project,
  RectElement,
  SceneElement,
  TextElement,
} from "@/project/model";

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function makeFixture(): Project {
  return createProject({
    name: "Store fixture",
    durationMs: 5000,
    elements: [
      createElement("rect", { name: "Box" }),
      createElement("ellipse", { name: "Dot" }),
    ],
  });
}

function makeStore(): { store: ProjectStore; project: Project } {
  const project = makeFixture();
  return { store: createProjectStore(project), project };
}

function getTrack(
  element: SceneElement,
  property: Keyframe["property"],
): Keyframe[] {
  return element.keyframes.filter((k) => k.property === property);
}

describe("projectStore — initial state and setProject", () => {
  it("starts with the given project document", () => {
    const { store, project } = makeStore();
    expect(store.getState().project).toBe(project);
    expect(store.getState().project.name).toBe("Store fixture");
  });

  it("setProject replaces the document wholesale", () => {
    const { store } = makeStore();
    const next = createProject({ name: "Replaced" });
    store.getState().setProject(next);
    expect(store.getState().project).toBe(next);
  });

  it("setProject does not mutate the input document", () => {
    const { store } = makeStore();
    const next = createProject({ name: "Replaced" });
    const snapshot = structuredClone(next);
    store.getState().setProject(next);
    store.getState().setCanvas({ width: 1, height: 1, fps: 1 });
    expect(next).toEqual(snapshot);
  });
});

describe("projectStore — updateElement", () => {
  it("updates an existing element immutably", () => {
    const { store, project } = makeStore();
    const [rect] = project.elements;
    const originalElement = project.elements[0];
    const originalProject = project;

    const result = store.getState().updateElement(rect.id, {
      name: "Renamed",
      transform: { x: 5, y: 6, rotation: 0, scaleX: 1, scaleY: 1 },
    });

    expect(result).toBe(true);
    const state = store.getState().project;
    expect(state).not.toBe(originalProject);
    expect(state.elements[0]).not.toBe(originalElement);
    expect(state.elements[0].name).toBe("Renamed");
    // The input fixture is untouched.
    expect(originalElement.name).toBe("Box");
    expect(originalProject.elements[0].name).toBe("Box");
  });

  it("returns false and changes nothing for an unknown element id", () => {
    const { store } = makeStore();
    const before = store.getState().project;

    const result = store.getState().updateElement("no-such-id", {
      name: "Ghost",
    });

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(before.elements[0].name).toBe("Box");
  });

  it("bumps updatedAt to a valid ISO timestamp on success", () => {
    const { store, project } = makeStore();
    const beforeMs = new Date(project.updatedAt).getTime();
    store.getState().updateElement(project.elements[0].id, { name: "New" });
    const after = store.getState().project.updatedAt;
    expect(after).toMatch(ISO_8601_REGEX);
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(beforeMs);
  });
});

describe("projectStore — updateElement type-specific updates", () => {
  it("updates rect geometry while preserving the element type", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;

    const result = store.getState().updateElement(rectId, {
      width: 320,
      height: 240,
      cornerRadius: 8,
    });

    expect(result).toBe(true);
    const element = store.getState().project.elements[0];
    expect(element.type).toBe("rect");
    expect((element as RectElement).width).toBe(320);
    expect((element as RectElement).height).toBe(240);
    expect((element as RectElement).cornerRadius).toBe(8);
    expect(element.name).toBe("Box");
  });

  it("updates ellipse radii while preserving the element type", () => {
    const { store, project } = makeStore();
    const dotId = project.elements[1].id;

    const result = store.getState().updateElement(dotId, { rx: 30, ry: 40 });

    expect(result).toBe(true);
    const element = store.getState().project.elements[1];
    expect(element.type).toBe("ellipse");
    expect((element as EllipseElement).rx).toBe(30);
    expect((element as EllipseElement).ry).toBe(40);
  });

  it("updates text fields while preserving the element type", () => {
    const store = createProjectStore(
      createProject({ elements: [createElement("text")] }),
    );
    const textId = store.getState().project.elements[0].id;

    const result = store.getState().updateElement(textId, {
      text: "Hello",
      fontSize: 24,
    });

    expect(result).toBe(true);
    const element = store.getState().project.elements[0];
    expect(element.type).toBe("text");
    expect((element as TextElement).text).toBe("Hello");
    expect((element as TextElement).fontSize).toBe(24);
  });

  it("rejects at runtime updates containing keys foreign to the element type", () => {
    const { store, project } = makeStore();
    const dotId = project.elements[1].id; // ellipse
    // Simulate a caller bypassing the typed API (e.g. plain JS): a rect-only
    // field aimed at an ellipse element.
    const foreignUpdates = { width: 100 } as ElementUpdates;

    const before = store.getState().project;
    const result = store.getState().updateElement(dotId, foreignUpdates);

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(before.elements[1]).not.toHaveProperty("width");
  });

  it("rejects mixed-type updates at runtime (the type union alone does not)", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const before = store.getState().project;

    // Note: TypeScript does not flag `{ width, rx }` against a union of
    // per-type partials, so the store's runtime key guard is the real
    // enforcement point for mixed updates.
    const result = store.getState().updateElement(rectId, {
      width: 10,
      rx: 20,
    });

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
  });

  it("does not mutate the updates object", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const updates = { name: "Renamed", width: 50 };
    const snapshot = { ...updates };

    store.getState().updateElement(rectId, updates);

    expect(updates).toEqual(snapshot);
  });

  it("rejects keyframes through updateElement at compile time and runtime", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const keyframe = createKeyframe("x", 0, 0);
    store.getState().addKeyframe(rectId, keyframe);
    const before = store.getState().project;

    const result = store.getState().updateElement(rectId, {
      // @ts-expect-error -- keyframes must only change via addKeyframe/removeKeyframe
      keyframes: [],
    });

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().project.elements[0].keyframes).toEqual([keyframe]);
  });
});

describe("projectStore — addKeyframe", () => {
  it("adds a keyframe to an empty track", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const keyframe = createKeyframe("x", 1000, 42);

    const result = store.getState().addKeyframe(rectId, keyframe);

    expect(result).toBe(true);
    const track = getTrack(store.getState().project.elements[0], "x");
    expect(track).toEqual([keyframe]);
  });

  it("keeps each track sorted when inserting out of chronological order", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const kf = (timeMs: number) => createKeyframe("x", timeMs, timeMs);

    store.getState().addKeyframe(rectId, kf(3000));
    store.getState().addKeyframe(rectId, kf(1000));
    store.getState().addKeyframe(rectId, kf(2000));

    const times = getTrack(store.getState().project.elements[0], "x").map(
      (k) => k.timeMs,
    );
    expect(times).toEqual([1000, 2000, 3000]);
  });

  it("allows identical times on different property tracks", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const at = (property: Keyframe["property"]) =>
      createKeyframe(property, 1500, 7);

    expect(store.getState().addKeyframe(rectId, at("x"))).toBe(true);
    expect(store.getState().addKeyframe(rectId, at("y"))).toBe(true);
    expect(store.getState().addKeyframe(rectId, at("rotation"))).toBe(true);

    const element = store.getState().project.elements[0];
    expect(getTrack(element, "x").map((k) => k.timeMs)).toEqual([1500]);
    expect(getTrack(element, "y").map((k) => k.timeMs)).toEqual([1500]);
    expect(getTrack(element, "rotation").map((k) => k.timeMs)).toEqual([1500]);
  });

  it("rejects duplicate times on the same property track", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const keyframe = createKeyframe("x", 1000, 1);
    store.getState().addKeyframe(rectId, keyframe);
    const before = store.getState().project;

    const result = store.getState().addKeyframe(rectId, createKeyframe("x", 1000, 2));

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(getTrack(before.elements[0], "x")).toHaveLength(1);
  });

  it("rejects invalid keyframe times per the documented contract", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const invalidTimes = [-1, -0.5, 100.5, 5001, Number.NaN, Number.POSITIVE_INFINITY];

    for (const timeMs of invalidTimes) {
      const before = store.getState().project;
      const result = store
        .getState()
        .addKeyframe(rectId, createKeyframe("x", timeMs, 0));
      expect(result).toBe(false);
      expect(store.getState().project).toBe(before);
    }
  });

  it("accepts boundary times 0 and durationMs (integer)", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;

    expect(store.getState().addKeyframe(rectId, createKeyframe("x", 0, 0))).toBe(true);
    expect(
      store.getState().addKeyframe(rectId, createKeyframe("y", 5000, 10)),
    ).toBe(true);
    expect(getTrack(store.getState().project.elements[0], "x")).toHaveLength(1);
    expect(getTrack(store.getState().project.elements[0], "y")).toHaveLength(1);
  });

  it("returns false for an unknown element id", () => {
    const { store } = makeStore();
    const result = store
      .getState()
      .addKeyframe("no-such-id", createKeyframe("x", 0, 0));
    expect(result).toBe(false);
  });

  it("does not mutate the passed-in keyframe or other elements", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const keyframe = createKeyframe("x", 100, 1);
    const dotBefore = project.elements[1];

    store.getState().addKeyframe(rectId, keyframe);

    expect(keyframe).toEqual({
      id: keyframe.id,
      property: "x",
      timeMs: 100,
      value: 1,
      easing: "linear",
    });
    expect(store.getState().project.elements[1]).toBe(dotBefore);
  });
});

describe("projectStore — removeKeyframe", () => {
  it("removes an existing keyframe and keeps other tracks intact", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const first = createKeyframe("x", 0, 0);
    const second = createKeyframe("x", 1000, 5);
    const opacity = createKeyframe("opacity", 1000, 0.5);
    store.getState().addKeyframe(rectId, first);
    store.getState().addKeyframe(rectId, second);
    store.getState().addKeyframe(rectId, opacity);

    const result = store.getState().removeKeyframe(rectId, second.id);

    expect(result).toBe(true);
    const element = store.getState().project.elements[0];
    expect(getTrack(element, "x")).toEqual([first]);
    expect(getTrack(element, "opacity")).toEqual([opacity]);
  });

  it("returns false and changes nothing for unknown keyframe or element ids", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    store.getState().addKeyframe(rectId, createKeyframe("x", 0, 0));
    const before = store.getState().project;

    expect(store.getState().removeKeyframe(rectId, "no-such-kf")).toBe(false);
    expect(store.getState().removeKeyframe("no-such-el", "no-such-kf")).toBe(
      false,
    );
    expect(store.getState().project).toBe(before);
  });
});

describe("projectStore — setCanvas", () => {
  it("updates canvas dimensions and fps", () => {
    const { store } = makeStore();

    const result = store
      .getState()
      .setCanvas({ width: 800, height: 600, fps: 60 });

    expect(result).toBe(true);
    expect(store.getState().project.canvas).toEqual({
      width: 800,
      height: 600,
      fps: 60,
    });
  });

  it("rejects non-finite and non-positive fps values", () => {
    const { store } = makeStore();
    const before = store.getState().project;

    expect(store.getState().setCanvas({ width: 800, height: 600, fps: 0 })).toBe(
      false,
    );
    expect(
      store.getState().setCanvas({ width: 800, height: 600, fps: -30 }),
    ).toBe(false);
    expect(
      store.getState().setCanvas({ width: 800, height: 600, fps: Number.NaN }),
    ).toBe(false);
    expect(
      store
        .getState()
        .setCanvas({ width: 800, height: 600, fps: Number.POSITIVE_INFINITY }),
    ).toBe(false);
    expect(
      store
        .getState()
        .setCanvas({ width: 800, height: 600, fps: Number.NEGATIVE_INFINITY }),
    ).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(before.canvas.fps).toBe(30);
  });

  it("accepts fractional fps (the docs do not require integer fps)", () => {
    const { store } = makeStore();

    const result = store
      .getState()
      .setCanvas({ width: 1280, height: 720, fps: 29.97 });

    expect(result).toBe(true);
    expect(store.getState().project.canvas.fps).toBe(29.97);
  });
});

describe("projectStore — failed mutations leave state untouched", () => {
  it("keeps the exact same project reference across failed mutations", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    store.getState().addKeyframe(rectId, createKeyframe("x", 0, 0));
    const before = store.getState().project;

    store.getState().updateElement("no-such-id", { name: "X" });
    store.getState().addKeyframe("no-such-id", createKeyframe("x", 1, 1));
    store
      .getState()
      .addKeyframe(rectId, createKeyframe("x", 0, 9)); // duplicate
    store
      .getState()
      .addKeyframe(rectId, createKeyframe("x", 1.5, 9)); // non-integer
    store.getState().removeKeyframe(rectId, "no-such-kf");
    store.getState().setCanvas({ width: 1, height: 1, fps: 0 });

    expect(store.getState().project).toBe(before);
  });
});

describe("projectStore — isolation of unrelated state", () => {
  it("leaves unrelated elements untouched (reference and value)", () => {
    const { store, project } = makeStore();
    const [rect, dot] = project.elements;

    store.getState().updateElement(rect.id, { name: "Changed" });

    const state = store.getState().project;
    expect(state.elements[1]).toBe(dot);
    expect(state.elements[1].name).toBe("Dot");
  });

  it("leaves unrelated property tracks unchanged after a keyframe edit", () => {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const yKeyframe = createKeyframe("y", 2000, 3);
    store.getState().addKeyframe(rectId, yKeyframe);
    const yTrackBefore = getTrack(
      store.getState().project.elements[0],
      "y",
    );

    store.getState().addKeyframe(rectId, createKeyframe("x", 1000, 1));
    store.getState().addKeyframe(rectId, createKeyframe("x", 500, 2));

    const element = store.getState().project.elements[0];
    expect(getTrack(element, "y")).toEqual(yTrackBefore);
    expect(getTrack(element, "y")).toEqual([yKeyframe]);
    expect(getTrack(element, "x").map((k) => k.timeMs)).toEqual([500, 1000]);
  });
});

describe("projectStore — addElement / removeElement", () => {
  it("appends an element and bumps updatedAt", () => {
    const { store, project } = makeStore();
    const element = createElement("text", { name: "New" });

    const result = store.getState().addElement(element);

    expect(result).toBe(true);
    const state = store.getState().project;
    expect(state.elements).toHaveLength(3);
    expect(state.elements[2]).toBe(element);
    expect(state.elements[0]).toBe(project.elements[0]);
    expect(state.updatedAt).toMatch(ISO_8601_REGEX);
  });

  it("rejects duplicate element ids without changing state", () => {
    const { store, project } = makeStore();
    const before = store.getState().project;

    const result = store.getState().addElement(project.elements[0]);

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
  });

  it("removes an element while leaving others untouched", () => {
    const { store, project } = makeStore();
    const [, dot] = project.elements;

    const result = store.getState().removeElement(project.elements[0].id);

    expect(result).toBe(true);
    const state = store.getState().project;
    expect(state.elements).toEqual([dot]);
    expect(state.elements[0]).toBe(dot);
  });

  it("returns false and changes nothing for an unknown element id on remove", () => {
    const { store } = makeStore();
    const before = store.getState().project;

    const result = store.getState().removeElement("no-such-id");

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
  });
});

describe("projectStore — moveKeyframe", () => {
  function withKeyframes() {
    const { store, project } = makeStore();
    const rectId = project.elements[0].id;
    const first = createKeyframe("x", 1000, 10);
    const second = createKeyframe("x", 3000, 30);
    store.getState().addKeyframe(rectId, first);
    store.getState().addKeyframe(rectId, second);
    return { store, rectId, first, second };
  }

  it("moves a keyframe and keeps the track sorted, preserving other fields", () => {
    const { store, rectId, first } = withKeyframes();

    const result = store.getState().moveKeyframe(rectId, first.id, 2500);

    expect(result).toBe(true);
    const track = store
      .getState()
      .project.elements[0].keyframes.filter((k) => k.property === "x");
    expect(track.map((k) => k.timeMs)).toEqual([2500, 3000]);
    expect(track[0].value).toBe(10);
    expect(track[0].id).toBe(first.id);
    expect(store.getState().project.updatedAt).toMatch(ISO_8601_REGEX);
  });

  it("allows moving a keyframe onto its own current time", () => {
    const { store, rectId, first } = withKeyframes();

    expect(store.getState().moveKeyframe(rectId, first.id, 1000)).toBe(true);
    expect(
      store.getState().project.elements[0].keyframes.filter((k) => k.property === "x"),
    ).toHaveLength(2);
  });

  it("rejects a target time occupied by another keyframe on the same track", () => {
    const { store, rectId, first } = withKeyframes();
    const before = store.getState().project;

    const result = store.getState().moveKeyframe(rectId, first.id, 3000);

    expect(result).toBe(false);
    expect(store.getState().project).toBe(before);
  });

  it("allows identical times on different property tracks", () => {
    const { store, rectId, first } = withKeyframes();
    // y track has a keyframe at 1000; the x track does not.
    store.getState().addKeyframe(rectId, createKeyframe("y", 1000, 5));

    const result = store.getState().moveKeyframe(rectId, first.id, 1000);

    expect(result).toBe(true);
    const element = store.getState().project.elements[0];
    expect(getTrack(element, "x").map((k) => k.timeMs)).toEqual([1000, 3000]);
    expect(getTrack(element, "y").map((k) => k.timeMs)).toEqual([1000]);
  });

  it("rejects non-integer, negative, and beyond-duration times", () => {
    const { store, rectId, first } = withKeyframes();
    const invalidTimes = [-1, 12.5, 5001, Number.NaN];

    for (const timeMs of invalidTimes) {
      const before = store.getState().project;
      expect(store.getState().moveKeyframe(rectId, first.id, timeMs)).toBe(
        false,
      );
      expect(store.getState().project).toBe(before);
    }
  });

  it("returns false and changes nothing for unknown element or keyframe ids", () => {
    const { store, rectId, first } = withKeyframes();
    const before = store.getState().project;

    expect(store.getState().moveKeyframe("no-such-el", first.id, 2000)).toBe(false);
    expect(store.getState().moveKeyframe(rectId, "no-such-kf", 2000)).toBe(false);
    expect(store.getState().project).toBe(before);
  });
});
