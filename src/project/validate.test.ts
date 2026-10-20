import { describe, it, expect } from "vitest";
import { ProjectValidationError, validateProject } from "./validate";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import type { Project } from "@/project/model";

function validProject(): Project {
  return createProject({
    elements: [
      createElement("rect", {
        keyframes: [
          createKeyframe("x", 0, 0),
          createKeyframe("x", 1000, 100, "ease-in"),
        ],
      }),
      createElement("ellipse", {
        keyframes: [createKeyframe("opacity", 500, 0.5, "ease-out")],
      }),
      createElement("text", {
        keyframes: [createKeyframe("rotation", 250, 45, "ease-in-out")],
      }),
    ],
  });
}

function mutated(mutate: (project: Project) => void): unknown {
  const project = structuredClone(validProject());
  mutate(project);
  return project;
}

/** Typed escape hatch for test mutations; the runtime data is untrusted anyway. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function issuesOf(data: unknown): readonly string[] {
  try {
    validateProject(data);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectValidationError);
    return (error as ProjectValidationError).issues;
  }
  throw new Error("expected validation to fail");
}

describe("validateProject — valid data", () => {
  it("accepts a factory project containing every element type", () => {
    const project = validProject();
    expect(validateProject(structuredClone(project))).toEqual(project);
  });

  it("accepts each element type on its own", () => {
    for (const type of ["rect", "ellipse", "text"] as const) {
      const element =
        type === "rect"
          ? createElement("rect")
          : type === "ellipse"
            ? createElement("ellipse")
            : createElement("text");
      const project = createProject({ elements: [element] });
      expect(validateProject(structuredClone(project))).toEqual(project);
    }
  });

  it("accepts boundary and edge values", () => {
    const project = createProject({
      durationMs: 1000,
      elements: [
        createElement("rect", {
          // scale 0, negative rotation, opacity 0/1, boundary keyframe times
          transform: { x: -40, y: 0, rotation: -720, scaleX: 0, scaleY: 3 },
          style: { fill: "", opacity: 0 },
          keyframes: [
            createKeyframe("x", 0, -5),
            createKeyframe("y", 1000, 7),
          ],
        }),
      ],
    });
    expect(validateProject(structuredClone(project))).toEqual(project);
  });

  it("accepts an empty elements array and empty keyframes", () => {
    expect(validateProject(createProject()).elements).toEqual([]);
    const project = createProject({ elements: [createElement("rect")] });
    expect(validateProject(structuredClone(project))).toEqual(project);
  });

  it("accepts the same timeMs on different property tracks", () => {
    const project = mutated((p) => {
      const ellipse = p.elements[1];
      ellipse.keyframes[0].timeMs = 0; // rect x track already has timeMs 0
    });
    expect(validateProject(project)).toBeDefined();
  });

  it("does not mutate the input", () => {
    const project = validProject();
    const snapshot = structuredClone(project);
    validateProject(project);
    expect(() =>
      validateProject(mutated((p) => {
        asRecord(p.elements[0]).type = "triangle";
      })),
    ).toThrow(ProjectValidationError);
    expect(project).toEqual(snapshot);
  });
});

const INVALID_CASES: Array<{ name: string; data: unknown; issue: string }> = [
  { name: "null is not an object", data: null, issue: "project must be an object" },
  { name: "array is not an object", data: [], issue: "project must be an object" },
  { name: "number is not an object", data: 42, issue: "project must be an object" },
  {
    name: "missing id",
    data: mutated((p) => { delete asRecord(p).id; }),
    issue: "project.id must be a non-empty string",
  },
  {
    name: "empty id",
    data: mutated((p) => { asRecord(p).id = ""; }),
    issue: "project.id must be a non-empty string",
  },
  {
    name: "name not a string",
    data: mutated((p) => { asRecord(p).name = 7; }),
    issue: "project.name must be a string",
  },
  {
    name: "missing canvas",
    data: mutated((p) => { delete asRecord(p).canvas; }),
    issue: "project.canvas must be an object",
  },
  {
    name: "canvas fps zero",
    data: mutated((p) => { asRecord(p).canvas = { width: 100, height: 100, fps: 0 }; }),
    issue: "project.canvas.fps must be > 0",
  },
  {
    name: "canvas fps negative",
    data: mutated((p) => { asRecord(p).canvas = { width: 100, height: 100, fps: -30 }; }),
    issue: "project.canvas.fps must be > 0",
  },
  {
    name: "canvas fps not a number",
    data: mutated((p) => { asRecord(p).canvas = { width: 100, height: 100, fps: "30" }; }),
    issue: "project.canvas.fps must be a finite number",
  },
  {
    name: "canvas width not a number",
    data: mutated((p) => { asRecord(p).canvas = { width: "1280", height: 720, fps: 30 }; }),
    issue: "project.canvas.width must be a finite number",
  },
  {
    name: "durationMs zero",
    data: mutated((p) => { p.durationMs = 0; }),
    issue: "project.durationMs must be a positive integer",
  },
  {
    name: "durationMs fractional",
    data: mutated((p) => { p.durationMs = 1.5; }),
    issue: "project.durationMs must be a positive integer",
  },
  {
    name: "durationMs not a number",
    data: mutated((p) => { asRecord(p).durationMs = "5000"; }),
    issue: "project.durationMs must be a positive integer",
  },
  {
    name: "createdAt not parseable",
    data: mutated((p) => { p.createdAt = "not-a-date"; }),
    issue: "project.createdAt must be an ISO 8601 timestamp",
  },
  {
    name: "missing updatedAt",
    data: mutated((p) => { delete asRecord(p).updatedAt; }),
    issue: "project.updatedAt must be an ISO 8601 timestamp",
  },
  {
    name: "elements not an array",
    data: mutated((p) => { asRecord(p).elements = {}; }),
    issue: "project.elements must be an array",
  },
  {
    name: "element not an object",
    data: mutated((p) => { asRecord(p).elements = [42]; }),
    issue: "project.elements[0] must be an object",
  },
  {
    name: "unknown element type",
    data: mutated((p) => { asRecord(p.elements[0]).type = "triangle"; }),
    issue: 'project.elements[0].type must be one of "rect" | "ellipse" | "text"',
  },
  {
    name: "missing element type",
    data: mutated((p) => { delete asRecord(p.elements[0]).type; }),
    issue: 'project.elements[0].type must be one of "rect" | "ellipse" | "text"',
  },
  {
    name: "duplicate element id",
    data: mutated((p) => { p.elements[1].id = p.elements[0].id; }),
    issue: "is not unique within the project",
  },
  {
    name: "empty element id",
    data: mutated((p) => { asRecord(p.elements[0]).id = ""; }),
    issue: "project.elements[0].id must be a non-empty string",
  },
  {
    name: "locked not a boolean",
    data: mutated((p) => { asRecord(p.elements[0]).locked = "yes"; }),
    issue: "project.elements[0].locked must be a boolean",
  },
  {
    name: "visible not a boolean",
    data: mutated((p) => { asRecord(p.elements[0]).visible = 1; }),
    issue: "project.elements[0].visible must be a boolean",
  },
  {
    name: "missing transform",
    data: mutated((p) => { delete asRecord(p.elements[0]).transform; }),
    issue: "project.elements[0].transform must be an object",
  },
  {
    name: "transform x not a number",
    data: mutated((p) => { asRecord(p.elements[0].transform).x = "10"; }),
    issue: "project.elements[0].transform.x must be a finite number",
  },
  {
    name: "transform scaleX not finite",
    data: mutated((p) => { asRecord(p.elements[0].transform).scaleX = Number.POSITIVE_INFINITY; }),
    issue: "project.elements[0].transform.scaleX must be a finite number",
  },
  {
    name: "missing style",
    data: mutated((p) => { delete asRecord(p.elements[0]).style; }),
    issue: "project.elements[0].style must be an object",
  },
  {
    name: "style fill not a string",
    data: mutated((p) => { asRecord(p.elements[0].style).fill = 5; }),
    issue: "project.elements[0].style.fill must be a string",
  },
  {
    name: "style opacity not a number",
    data: mutated((p) => { asRecord(p.elements[0].style).opacity = null; }),
    issue: "project.elements[0].style.opacity must be a finite number",
  },
  {
    name: "keyframes not an array",
    data: mutated((p) => { asRecord(p.elements[0]).keyframes = {}; }),
    issue: "project.elements[0].keyframes must be an array",
  },
  {
    name: "keyframe not an object",
    data: mutated((p) => { asRecord(p.elements[0]).keyframes = ["x"]; }),
    issue: "project.elements[0].keyframes[0] must be an object",
  },
  {
    name: "unknown animatable property",
    data: mutated((p) => { asRecord(p.elements[0].keyframes[0]).property = "z"; }),
    issue: "project.elements[0].keyframes[0].property must be one of",
  },
  {
    name: "unknown easing",
    data: mutated((p) => { asRecord(p.elements[0].keyframes[0]).easing = "bounce"; }),
    issue: "project.elements[0].keyframes[0].easing must be one of",
  },
  {
    name: "fractional keyframe time",
    data: mutated((p) => { p.elements[0].keyframes[0].timeMs = 12.5; }),
    issue: "project.elements[0].keyframes[0].timeMs must be an integer",
  },
  {
    name: "negative keyframe time",
    data: mutated((p) => { p.elements[0].keyframes[0].timeMs = -1; }),
    issue: "project.elements[0].keyframes[0].timeMs must be >= 0",
  },
  {
    name: "keyframe time beyond duration",
    data: mutated((p) => { p.elements[0].keyframes[1].timeMs = 9999; }),
    issue: "project.elements[0].keyframes[1].timeMs must be <= project.durationMs (5000)",
  },
  {
    name: "keyframe value not a number",
    data: mutated((p) => { asRecord(p.elements[0].keyframes[0]).value = "5"; }),
    issue: "project.elements[0].keyframes[0].value must be a finite number",
  },
  {
    name: "empty keyframe id",
    data: mutated((p) => { asRecord(p.elements[0].keyframes[0]).id = ""; }),
    issue: "project.elements[0].keyframes[0].id must be a non-empty string",
  },
  {
    name: "duplicate keyframe id within element",
    data: mutated((p) => {
      p.elements[0].keyframes[1].id = p.elements[0].keyframes[0].id;
    }),
    issue: "is not unique within the element",
  },
  {
    name: "duplicate keyframe times on one track",
    data: mutated((p) => { p.elements[0].keyframes[1].timeMs = 0; }),
    issue: 'duplicate keyframe times for property "x"',
  },
  {
    name: "unsorted keyframes on one track",
    data: mutated((p) => {
      p.elements[0].keyframes[0].timeMs = 1000;
      p.elements[0].keyframes[1].timeMs = 0;
    }),
    issue: 'keyframes for property "x" must be sorted ascending by timeMs',
  },
  {
    name: "rect missing width",
    data: mutated((p) => { delete asRecord(p.elements[0]).width; }),
    issue: "project.elements[0].width must be a finite number",
  },
  {
    name: "rect cornerRadius not a number",
    data: mutated((p) => { asRecord(p.elements[0]).cornerRadius = "0"; }),
    issue: "project.elements[0].cornerRadius must be a finite number",
  },
  {
    name: "ellipse missing ry",
    data: mutated((p) => { delete asRecord(p.elements[1]).ry; }),
    issue: "project.elements[1].ry must be a finite number",
  },
  {
    name: "ellipse rx not a number",
    data: mutated((p) => { asRecord(p.elements[1]).rx = "30"; }),
    issue: "project.elements[1].rx must be a finite number",
  },
  {
    name: "text missing text content",
    data: mutated((p) => { delete asRecord(p.elements[2]).text; }),
    issue: "project.elements[2].text must be a string",
  },
  {
    name: "text fontSize not a number",
    data: mutated((p) => { asRecord(p.elements[2]).fontSize = "16"; }),
    issue: "project.elements[2].fontSize must be a finite number",
  },
  {
    name: "text fontFamily not a string",
    data: mutated((p) => { asRecord(p.elements[2]).fontFamily = 3; }),
    issue: "project.elements[2].fontFamily must be a string",
  },
  {
    name: "text fontWeight not a string",
    data: mutated((p) => { asRecord(p.elements[2]).fontWeight = null; }),
    issue: "project.elements[2].fontWeight must be a string",
  },
];

describe("validateProject — invalid data", () => {
  for (const testCase of INVALID_CASES) {
    it(`rejects: ${testCase.name}`, () => {
      expect(() => validateProject(testCase.data)).toThrow(
        ProjectValidationError,
      );
      expect(issuesOf(testCase.data)).toContainEqual(
        expect.stringContaining(testCase.issue),
      );
    });
  }

  it("accumulates multiple issues in one error", () => {
    const data = mutated((p) => {
      asRecord(p.elements[0]).type = "triangle";
      asRecord(p.elements[1]).rx = "30";
      asRecord(p).durationMs = 0;
    });
    const issues = issuesOf(data);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — the same input produces the same issues", () => {
    const data = INVALID_CASES[0].data;
    expect(issuesOf(data)).toEqual(issuesOf(data));
  });
});
