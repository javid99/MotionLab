import { describe, it, expect } from "vitest";
import {
  createProject,
  createElement,
  createKeyframe,
} from "./defaults";
import type {
  EllipseElement,
  RectElement,
  SceneElement,
  TextElement,
} from "./model";

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Compile-time completeness check (T1 AC): this switch has no default branch;
 * it only compiles while every `SceneElement` variant is handled, because a
 * missing case would make the end of the function reachable (TS2366 under
 * strictNullChecks).
 */
function describeElementType(type: SceneElement["type"]): string {
  switch (type) {
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    case "text":
      return "text";
  }
}

describe("createProject", () => {
  it("produces valid documented defaults", () => {
    const project = createProject();

    expect(project.name).toBe("Untitled project");
    expect(project.canvas).toEqual({ width: 1280, height: 720, fps: 30 });
    expect(project.durationMs).toBe(5000);
    expect(Number.isInteger(project.durationMs)).toBe(true);
    expect(project.durationMs).toBeGreaterThan(0);
    expect(project.canvas.fps).toBeGreaterThan(0);
    expect(project.elements).toEqual([]);
  });

  it("generates ISO 8601 timestamps for createdAt and updatedAt", () => {
    const project = createProject();

    expect(project.createdAt).toMatch(ISO_8601_REGEX);
    expect(project.updatedAt).toMatch(ISO_8601_REGEX);
    expect(project.createdAt).toBe(project.updatedAt);
    expect(() => new Date(project.createdAt).toISOString()).not.toThrow();
  });

  it("generates a unique id per project", () => {
    const ids = new Set([createProject().id, createProject().id]);
    expect(ids.size).toBe(2);
  });

  it("applies overrides while keeping generated identity and timestamps", () => {
    const element = createElement("rect");
    const project = createProject({
      name: "Intro",
      canvas: { width: 640, height: 480, fps: 60 },
      durationMs: 2000,
      elements: [element],
    });

    expect(project.name).toBe("Intro");
    expect(project.canvas).toEqual({ width: 640, height: 480, fps: 60 });
    expect(project.durationMs).toBe(2000);
    expect(project.elements).toEqual([element]);
    expect(project.createdAt).toMatch(ISO_8601_REGEX);
    expect(project.updatedAt).toBe(project.createdAt);
  });
});

describe("createElement", () => {
  it("creates a rect with documented defaults", () => {
    const rect: RectElement = createElement("rect");

    expect(rect.type).toBe("rect");
    expect(rect.name).toBe("Rect");
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(100);
    expect(rect.cornerRadius).toBe(0);
    expect(rect.locked).toBe(false);
    expect(rect.visible).toBe(true);
    expect(rect.keyframes).toEqual([]);
    expect(rect.transform).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(rect.style).toEqual({ fill: "#808080", opacity: 1 });
  });

  it("creates an ellipse with documented defaults", () => {
    const ellipse: EllipseElement = createElement("ellipse");

    expect(ellipse.type).toBe("ellipse");
    expect(ellipse.name).toBe("Ellipse");
    expect(ellipse.rx).toBe(50);
    expect(ellipse.ry).toBe(50);
    expect(ellipse.transform).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(ellipse.keyframes).toEqual([]);
  });

  it("creates a text element with documented defaults", () => {
    const text: TextElement = createElement("text");

    expect(text.type).toBe("text");
    expect(text.name).toBe("Text");
    expect(text.text).toBe("Text");
    expect(text.fontSize).toBe(16);
    expect(text.fontFamily).toBe("sans-serif");
    expect(text.fontWeight).toBe("400");
  });

  it("applies overrides on top of defaults", () => {
    const rect = createElement("rect", {
      name: "Hero box",
      width: 320,
      transform: { x: 10, y: 20, rotation: 45, scaleX: 2, scaleY: 1 },
      style: { fill: "#ff0000", opacity: 0.5 },
    });

    expect(rect.name).toBe("Hero box");
    expect(rect.width).toBe(320);
    expect(rect.height).toBe(100);
    expect(rect.transform).toEqual({
      x: 10,
      y: 20,
      rotation: 45,
      scaleX: 2,
      scaleY: 1,
    });
    expect(rect.style).toEqual({ fill: "#ff0000", opacity: 0.5 });
  });

  it("generates unique ids across repeated factory calls", () => {
    const elements = [
      ...Array.from({ length: 100 }, () => createElement("rect")),
      ...Array.from({ length: 100 }, () => createElement("ellipse")),
      ...Array.from({ length: 100 }, () => createElement("text")),
    ];
    const ids = new Set(elements.map((e) => e.id));
    expect(ids.size).toBe(elements.length);
  });

  it("handles the SceneElement union exhaustively (compile-time check)", () => {
    const elements: SceneElement[] = [
      createElement("rect"),
      createElement("ellipse"),
      createElement("text"),
    ];

    expect(elements.map((e) => describeElementType(e.type))).toEqual([
      "rect",
      "ellipse",
      "text",
    ]);
  });
});

describe("createKeyframe", () => {
  it("defaults easing to linear and preserves the given values", () => {
    const keyframe = createKeyframe("x", 0, 120);

    expect(keyframe.property).toBe("x");
    expect(keyframe.timeMs).toBe(0);
    expect(keyframe.value).toBe(120);
    expect(keyframe.easing).toBe("linear");
    expect(Number.isInteger(keyframe.timeMs)).toBe(true);
  });

  it("accepts every documented easing and animatable property", () => {
    const easings = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
    const properties = [
      "x",
      "y",
      "rotation",
      "scaleX",
      "scaleY",
      "opacity",
    ] as const;

    for (const property of properties) {
      for (const easing of easings) {
        const keyframe = createKeyframe(property, 1000, 5, easing);
        expect(keyframe.property).toBe(property);
        expect(keyframe.easing).toBe(easing);
      }
    }
  });

  it("generates a unique id per keyframe", () => {
    const ids = new Set([
      createKeyframe("x", 0, 0).id,
      createKeyframe("x", 0, 0).id,
    ]);
    expect(ids.size).toBe(2);
  });
});

describe("Project JSON round-trip", () => {
  it("round-trips a project with all element types and keyframes unchanged", () => {
    const project = createProject({
      name: "Round trip",
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0),
            createKeyframe("x", 1000, 200, "ease-in"),
          ],
        }),
        createElement("ellipse", {
          keyframes: [createKeyframe("opacity", 500, 0.5, "ease-out")],
          style: { fill: "#00ff00", opacity: 0.8 },
        }),
        createElement("text", { text: "Hello MotionLab" }),
      ],
    });

    const serialized = JSON.stringify(project);
    const parsed: unknown = JSON.parse(serialized);

    expect(parsed).toEqual(project);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(project);
  });

  it("serializes without losing or adding fields", () => {
    const project = createProject();
    const parsed = JSON.parse(JSON.stringify(project)) as typeof project;

    expect(Object.keys(parsed).sort()).toEqual(
      Object.keys(project).sort(),
    );
  });
});
