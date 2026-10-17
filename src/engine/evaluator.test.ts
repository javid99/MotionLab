import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { evaluate } from "./evaluator";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import type { Project } from "@/project/model";

function elementWithKeyframes(): Project {
  return createProject({
    durationMs: 5000,
    elements: [
      createElement("rect", {
        keyframes: [
          createKeyframe("x", 0, 0),
          createKeyframe("x", 1000, 100, "ease-in"),
          createKeyframe("y", 0, 50),
          createKeyframe("y", 1000, 150),
        ],
      }),
    ],
  });
}

describe("evaluate — output shape and clamping", () => {
  it("returns an empty element list for an empty project", () => {
    const scene = evaluate(createProject(), 100);
    expect(scene).toEqual({ timeMs: 100, elements: [] });
  });

  it("reports the clamped time in the output", () => {
    const project = elementWithKeyframes();
    expect(evaluate(project, -5).timeMs).toBe(0);
    expect(evaluate(project, 2500).timeMs).toBe(2500);
    expect(evaluate(project, 9999).timeMs).toBe(5000);
  });

  it("produces the exact documented EvaluatedElement shape", () => {
    const scene = evaluate(elementWithKeyframes(), 0);
    expect(Object.keys(scene).sort()).toEqual(["elements", "timeMs"]);
    expect(Object.keys(scene.elements[0]).sort()).toEqual([
      "id",
      "opacity",
      "transform",
      "type",
      "visible",
    ]);
    expect(Object.keys(scene.elements[0].transform).sort()).toEqual([
      "rotation",
      "scaleX",
      "scaleY",
      "x",
      "y",
    ]);
  });
});

describe("evaluate — base values and holds", () => {
  it("uses base transform and style values when there are no keyframes", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          transform: { x: 40, y: 60, rotation: 45, scaleX: 2, scaleY: 0.5 },
          style: { fill: "#ff0000", opacity: 0.4 },
        }),
      ],
    });

    for (const timeMs of [0, 2500, 5000]) {
      const element = evaluate(project, timeMs).elements[0];
      expect(element.transform).toEqual({
        x: 40,
        y: 60,
        rotation: 45,
        scaleX: 2,
        scaleY: 0.5,
      });
      expect(element.opacity).toBe(0.4);
    }
  });

  it("holds a single keyframe before, at, and after its time", () => {
    const project = createProject({
      elements: [createElement("rect", { keyframes: [createKeyframe("x", 2000, 33)] })],
    });

    for (const timeMs of [0, 1999, 2000, 5000]) {
      expect(evaluate(project, timeMs).elements[0].transform.x).toBe(33);
    }
  });

  it("holds the first keyframe before the track starts and the last after it ends", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 1000, 10),
            createKeyframe("x", 3000, 30),
          ],
        }),
      ],
    });

    expect(evaluate(project, 0).elements[0].transform.x).toBe(10);
    expect(evaluate(project, 999).elements[0].transform.x).toBe(10);
    expect(evaluate(project, 3000).elements[0].transform.x).toBe(30);
    expect(evaluate(project, 5000).elements[0].transform.x).toBe(30);
  });
});

describe("evaluate — interpolation and per-segment easing", () => {
  it("interpolates linearly between keyframes, including exact timestamps", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0),
            createKeyframe("x", 1000, 100),
          ],
        }),
      ],
    });

    expect(evaluate(project, 0).elements[0].transform.x).toBe(0);
    expect(evaluate(project, 250).elements[0].transform.x).toBe(25);
    expect(evaluate(project, 500).elements[0].transform.x).toBe(50);
    expect(evaluate(project, 1000).elements[0].transform.x).toBe(100);
  });

  it("applies each keyframe's easing to the segment starting at it", () => {
    // Segment 1 (0 → 500) uses linear; segment 2 (500 → 1000) uses ease-in.
    const project = createProject({
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0, "linear"),
            createKeyframe("x", 500, 50, "ease-in"),
            createKeyframe("x", 1000, 100, "linear"),
          ],
        }),
      ],
    });

    // Segment 1 midpoint: linear → 25.
    expect(evaluate(project, 250).elements[0].transform.x).toBe(25);
    // Segment 1 end: exactly the keyframe value.
    expect(evaluate(project, 500).elements[0].transform.x).toBe(50);
    // Segment 2 midpoint: 50 + 50 · ease-in(0.5) ≈ 50 + 50 · 0.31536.
    expect(evaluate(project, 750).elements[0].transform.x).toBeCloseTo(
      65.77,
      1,
    );
    // Segment 2 end: exactly the last keyframe value.
    expect(evaluate(project, 1000).elements[0].transform.x).toBe(100);
  });

  it("supports all documented easing types on a segment", () => {
    const make = (easing: Parameters<typeof createKeyframe>[3]) =>
      createProject({
        durationMs: 1000,
        elements: [
          createElement("rect", {
            keyframes: [
              createKeyframe("x", 0, 0, easing),
              createKeyframe("x", 1000, 100, "linear"),
            ],
          }),
        ],
      });

    expect(evaluate(make("linear"), 500).elements[0].transform.x).toBe(50);
    expect(evaluate(make("ease-in"), 500).elements[0].transform.x).toBeCloseTo(
      31.54,
      1,
    );
    expect(evaluate(make("ease-out"), 500).elements[0].transform.x).toBeCloseTo(
      68.46,
      1,
    );
    // Symmetric curve: midpoint maps to the midpoint.
    expect(evaluate(make("ease-in-out"), 500).elements[0].transform.x).toBe(50);
  });

  it("interpolates every supported animatable property independently", () => {
    const project = createProject({
      durationMs: 1000,
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0),
            createKeyframe("x", 1000, 100),
            createKeyframe("y", 0, 0),
            createKeyframe("y", 1000, 200),
            createKeyframe("rotation", 0, 0),
            createKeyframe("rotation", 1000, 90),
            createKeyframe("scaleX", 0, 1),
            createKeyframe("scaleX", 1000, 3),
            createKeyframe("scaleY", 0, 2),
            createKeyframe("scaleY", 1000, 4),
            createKeyframe("opacity", 0, 0),
            createKeyframe("opacity", 1000, 1),
          ],
        }),
      ],
    });

    const element = evaluate(project, 500).elements[0];
    expect(element.transform).toEqual({
      x: 50,
      y: 100,
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
    });
    expect(element.opacity).toBe(0.5);
  });
});

describe("evaluate — independence, identity, immutability, determinism", () => {
  it("keeps elements and properties independent", () => {
    const project = createProject({
      durationMs: 1000,
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 0, 0),
            createKeyframe("x", 1000, 100),
          ],
        }),
        createElement("ellipse", {
          keyframes: [
            createKeyframe("x", 0, 1000),
            createKeyframe("x", 1000, 900),
          ],
        }),
      ],
    });

    const scene = evaluate(project, 250);
    expect(scene.elements[0].transform.x).toBe(25);
    expect(scene.elements[1].transform.x).toBe(975);
    // opacity of element 1 stays at its base (no opacity keyframes).
    expect(scene.elements[0].opacity).toBe(1);
  });

  it("preserves identity, type, and visibility", () => {
    const project = createProject({
      elements: [createElement("text", { text: "Hi", visible: false })],
    });
    const scene = evaluate(project, 0);
    const element = scene.elements[0];
    expect(element.id).toBe(project.elements[0].id);
    expect(element.type).toBe("text");
    expect(element.visible).toBe(false);
  });

  it("never mutates the input project", () => {
    const project = elementWithKeyframes();
    const snapshot = structuredClone(project);
    evaluate(project, -5);
    evaluate(project, 750);
    evaluate(project, 9999);
    expect(project).toEqual(snapshot);
  });

  it("returns fresh objects (no references into the project)", () => {
    const project = elementWithKeyframes();
    const scene = evaluate(project, 500);
    expect(scene.elements[0]).not.toBe(project.elements[0]);
    expect(scene.elements[0].transform).not.toBe(project.elements[0].transform);
  });

  it("is deterministic for repeated evaluation", () => {
    const project = elementWithKeyframes();
    expect(evaluate(project, 750)).toEqual(evaluate(project, 750));
  });
});

describe("evaluate — import hygiene (architecture constraint)", () => {
  it("imports nothing outside engine/project/lib and never stores or React", () => {
    // Vitest runs from the project root; read the source relative to it.
    const source = readFileSync("src/engine/evaluator.ts", "utf8");
    const importSpecifiers = [
      ...source.matchAll(/from "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).not.toMatch(/zustand|react/i);
      expect(specifier).not.toMatch(/@\/(editor|components|render|persistence|export)/);
      expect(
        specifier.startsWith(".") ||
          specifier.startsWith("@/project/") ||
          specifier.startsWith("@/engine/") ||
          specifier.startsWith("@/lib/"),
      ).toBe(true);
    }
  });
});
