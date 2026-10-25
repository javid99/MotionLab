import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { exportProjectCss } from "./cssExporter";
import { getEasingFunction } from "@/engine/interpolation";
import { keyframesForProperty } from "@/engine/timeline";
import { evaluate } from "@/engine/evaluator";
import { composeElementTransform, getElementSize } from "@/lib/elementTransform";
import {
  applyCssTransform,
  applySvgTransformAttribute,
} from "../../tests/helpers/cssMatrix";
import { createElement, createKeyframe, createProject } from "@/project/defaults";
import { ProjectValidationError } from "@/project/validate";
import type { Point } from "@/lib/coords";
import type {
  AnimatableProperty,
  Easing,
  Project,
  SceneElement,
} from "@/project/model";

/**
 * Tests for the revised ADR-008 export contract (per-property custom-property
 * animations). The test-side interpolator parses the emitted CSS and
 * interpolates it the way a browser would, so equivalence with the engine
 * evaluator is asserted at many sample times — not just endpoints.
 */

function animationName(elementId: string, property: AnimatableProperty): string {
  const suffix: Record<AnimatableProperty, string> = {
    x: "x",
    y: "y",
    rotation: "rotation",
    scaleX: "scale-x",
    scaleY: "scale-y",
    opacity: "opacity",
  };
  return `mlab-${elementId}-${suffix[property]}`;
}

interface CssKeyframeBlock {
  pct: number;
  value: number;
  /** The exporter only emits easings from the documented union. */
  timing: Easing | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseKeyframes(css: string, name: string): CssKeyframeBlock[] {
  const rule = css.match(
    new RegExp(`@keyframes ${escapeRegExp(name)} \\{\\n([\\s\\S]*?)\\n\\}`),
  );
  if (!rule) {
    throw new Error(`@keyframes ${name} not found in output`);
  }
  const blocks: CssKeyframeBlock[] = [];
  const blockRe =
    /  ([\d.]+)% \{\n    (--mlab-[a-z-]+|opacity): (-?[\d.]+(?:e[+-]?\d+)?);\n(?:    animation-timing-function: ([a-z-]+);\n)?  \}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(rule[1])) !== null) {
    blocks.push({
      pct: Number(match[1]),
      value: Number(match[3]),
      timing: (match[4] as Easing | undefined) ?? null,
    });
  }
  if (blocks.length === 0) {
    throw new Error(`no keyframe blocks parsed for ${name}`);
  }
  return blocks;
}

/** Interpolates the parsed CSS the way a browser would. */
function cssValueAt(
  blocks: CssKeyframeBlock[],
  timeMs: number,
  durationMs: number,
): number {
  const pct = (timeMs / durationMs) * 100;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (pct <= first.pct) {
    return first.value;
  }
  if (pct >= last.pct) {
    return last.value;
  }
  let index = 0;
  while (index < blocks.length - 1 && blocks[index + 1].pct < pct) {
    index += 1;
  }
  const a = blocks[index];
  const b = blocks[index + 1];
  const u = (pct - a.pct) / (b.pct - a.pct);
  const ease = getEasingFunction(a.timing ?? "linear");
  return a.value + (b.value - a.value) * ease(u);
}

function engineValueAt(
  project: Project,
  element: SceneElement,
  property: AnimatableProperty,
  timeMs: number,
): number {
  const evaluated = evaluate(project, timeMs).elements.find(
    (candidate) => candidate.id === element.id,
  );
  if (!evaluated) {
    throw new Error("element missing from evaluated scene");
  }
  return property === "opacity"
    ? evaluated.opacity
    : evaluated.transform[property];
}

/** Segment boundaries ±1 ms (clamped), segment midpoints, fixed table. */
function sampleTimes(project: Project, element: SceneElement): number[] {
  const durationMs = project.durationMs;
  const times = new Set<number>();
  for (const property of ANIMATABLE_PROPERTIES) {
    const authored = keyframesForProperty(element, property).map(
      (k) => k.timeMs,
    );
    for (const time of authored) {
      for (const candidate of [time - 1, time, time + 1]) {
        if (candidate >= 0 && candidate <= durationMs) {
          times.add(candidate);
        }
      }
    }
    for (let i = 1; i < authored.length; i += 1) {
      times.add(Math.round((authored[i - 1] + authored[i]) / 2));
    }
  }
  for (const fraction of [0, 1 / 3, 0.5, 2 / 3, 0.9, 1]) {
    times.add(Math.round(fraction * durationMs));
  }
  return [...times].sort((a, b) => a - b);
}

function expectExportMatchesEngine(
  css: string,
  project: Project,
  element: SceneElement,
): void {
  for (const property of ANIMATABLE_PROPERTIES) {
    if (keyframesForProperty(element, property).length === 0) {
      continue;
    }
    const blocks = parseKeyframes(css, animationName(element.id, property));
    for (const timeMs of sampleTimes(project, element)) {
      const exported = cssValueAt(blocks, timeMs, project.durationMs);
      const engine = engineValueAt(project, element, property, timeMs);
      expect(Math.abs(exported - engine)).toBeLessThanOrEqual(1e-6);
    }
  }
}

const ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "opacity",
];

function expectElementInOutput(css: string, element: SceneElement): void {
  expect(css).toContain(`[data-element-id="${element.id}"]`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fixture 1: x and opacity with different keyframe times and easings. */
function fixtureXPlusOpacity(): Project {
  return createProject({
    name: "X + opacity",
    durationMs: 5000,
    elements: [
      createElement("rect", {
        name: "Box",
        keyframes: [
          createKeyframe("x", 0, 0, "linear"),
          createKeyframe("x", 1000, 10, "ease-out"),
          createKeyframe("x", 2500, 20, "linear"),
          createKeyframe("opacity", 500, 1, "ease-in"),
          createKeyframe("opacity", 2500, 0, "ease-in-out"),
        ],
        style: { fill: "#ff0000", opacity: 1 },
      }),
    ],
  });
}

/** Fixture 2 (the counterexample from the ADR revision): interleaved x/y. */
function fixtureInterleavedXy(): Project {
  return createProject({
    name: "Interleaved x/y",
    durationMs: 5000,
    elements: [
      createElement("rect", {
        keyframes: [
          createKeyframe("x", 0, 0, "ease-in"),
          createKeyframe("x", 1000, 10, "ease-in"),
          createKeyframe("y", 500, 0, "linear"),
          createKeyframe("y", 2000, 5, "linear"),
        ],
      }),
    ],
  });
}

/** Fixture 3: x/y segments starting at the same time with different easings. */
function fixtureSameStartDifferentEasings(): Project {
  return createProject({
    name: "Same start",
    durationMs: 3000,
    elements: [
      createElement("rect", {
        keyframes: [
          createKeyframe("x", 0, 0, "linear"),
          createKeyframe("x", 1000, 10, "ease-in"),
          createKeyframe("x", 2000, 20, "linear"),
          createKeyframe("y", 0, 0, "linear"),
          createKeyframe("y", 1000, 4, "ease-out"),
          createKeyframe("y", 2000, 8, "linear"),
        ],
      }),
    ],
  });
}

/** Fixture 4: authored keyframe at 0 on one property, others without. */
function fixtureAuthoredZero(): Project {
  return createProject({
    name: "Authored zero",
    durationMs: 3000,
    elements: [
      createElement("rect", {
        keyframes: [
          createKeyframe("x", 0, 5, "ease-out"),
          createKeyframe("x", 1000, 15, "linear"),
          createKeyframe("y", 2000, 1, "linear"),
          createKeyframe("y", 3000, 3, "linear"),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportProjectCss — percentages and endpoints", () => {
  it("formats percentages with at most 6 decimals, trailing zeros trimmed", () => {
    const project = createProject({
      durationMs: 3000,
      elements: [
        createElement("rect", {
          keyframes: [createKeyframe("x", 1000, 10, "linear")],
        }),
      ],
    });
    const css = exportProjectCss(project);

    expect(css).toContain("33.333333% {");
    expect(css).toContain("0% {");
    expect(css).toContain("100% {");
    expect(css).not.toContain("33.33333333");
  });

  it("emits 0%/100% endpoint values equal to evaluate(project, 0/durationMs)", () => {
    const project = fixtureInterleavedXy();
    const css = exportProjectCss(project);
    const element = project.elements[0];

    const xBlocks = parseKeyframes(css, animationName(element.id, "x"));
    expect(xBlocks[0]).toEqual({ pct: 0, value: 0, timing: "ease-in" });
    expect(xBlocks[xBlocks.length - 1].value).toBe(
      engineValueAt(project, element, "x", 5000),
    );

    const yBlocks = parseKeyframes(css, animationName(element.id, "y"));
    expect(yBlocks[0].value).toBe(engineValueAt(project, element, "y", 0));
    expect(yBlocks[yBlocks.length - 1]).toEqual({
      pct: 100,
      value: 5,
      timing: null,
    });
  });

  it("merges an authored keyframe at 0 into a single 0% block carrying the authored easing", () => {
    const project = fixtureAuthoredZero();
    const css = exportProjectCss(project);
    const element = project.elements[0];

    const xRule = css.match(
      new RegExp(`@keyframes ${animationName(element.id, "x")} \\{\\n([\\s\\S]*?)\\n\\}`),
    );
    expect((xRule?.[1].match(/^  0% \{/gm) ?? []).length).toBe(1);
    const xBlocks = parseKeyframes(css, animationName(element.id, "x"));
    expect(xBlocks[0]).toEqual({ pct: 0, value: 5, timing: "ease-out" });

    // y has no authored endpoint: generated 0%/100% holds, no timing claim.
    const yBlocks = parseKeyframes(css, animationName(element.id, "y"));
    expect(yBlocks[0]).toEqual({ pct: 0, value: 1, timing: null });
    expect(yBlocks[yBlocks.length - 1]).toEqual({
      pct: 100,
      value: 3,
      timing: null,
    });
  });
});

describe("exportProjectCss — per-property timing independence", () => {
  it("fixture: x and opacity animate independently with their own times and easings", () => {
    const project = fixtureXPlusOpacity();
    const element = project.elements[0];
    const css = exportProjectCss(project);

    const xBlocks = parseKeyframes(css, animationName(element.id, "x"));
    expect(xBlocks.map((b) => b.pct)).toEqual([0, 20, 50, 100]);
    expect(xBlocks[1]).toEqual({ pct: 20, value: 10, timing: "ease-out" });
    // The last authored keyframe's easing is inert (hold to 100%).
    expect(xBlocks[2]).toEqual({ pct: 50, value: 20, timing: null });

    const opacityBlocks = parseKeyframes(
      css,
      animationName(element.id, "opacity"),
    );
    expect(opacityBlocks.map((b) => b.pct)).toEqual([0, 10, 50, 100]);
    expect(opacityBlocks[1]).toEqual({ pct: 10, value: 1, timing: "ease-in" });
    // Last authored keyframe: hold to 100%, no timing claim.
    expect(opacityBlocks[2]).toEqual({ pct: 50, value: 0, timing: null });
    // Opacity is a native CSS property animation.
    expect(css).toMatch(
      new RegExp(`@keyframes ${animationName(element.id, "opacity")} \\{\\n  0% \\{\\n    opacity:`),
    );
    expect(css).not.toContain("--mlab-opacity");

    expectExportMatchesEngine(css, project, element);
  });

  it("fixture: interleaved x/y keyframe times never split the other property's segments", () => {
    const project = fixtureInterleavedXy();
    const element = project.elements[0];
    const css = exportProjectCss(project);

    // x's rule contains only x's times (0%, 20%, 100%) — y's 10%/40% blocks
    // are absent, so x's 0→1000 ms ease-in segment is never split.
    const xBlocks = parseKeyframes(css, animationName(element.id, "x"));
    expect(xBlocks.map((b) => b.pct)).toEqual([0, 20, 100]);
    // The authored ease-in at 1000 ms is inert (last authored keyframe →
    // hold); the 0→1000 ms segment carries ease-in via the 0% block.
    expect(xBlocks[1]).toEqual({ pct: 20, value: 10, timing: null });

    const yBlocks = parseKeyframes(css, animationName(element.id, "y"));
    expect(yBlocks.map((b) => b.pct)).toEqual([0, 10, 40, 100]);

    // The ADR-revision counterexample: engine x at 750 ms is
    // 10 · ease-in(0.75) ≈ 6.016 — the old transform-group export produced
    // ≈6.577 here. The export must match the engine within 1e-6.
    const exported = cssValueAt(xBlocks, 750, project.durationMs);
    expect(exported).toBeCloseTo(10 * getEasingFunction("ease-in")(0.75), 9);
    expect(
      Math.abs(exported - engineValueAt(project, element, "x", 750)),
    ).toBeLessThanOrEqual(1e-6);

    expectExportMatchesEngine(css, project, element);
  });

  it("fixture: same-start segments with different easings keep both easings", () => {
    const project = fixtureSameStartDifferentEasings();
    const element = project.elements[0];
    const css = exportProjectCss(project);

    const xBlocks = parseKeyframes(css, animationName(element.id, "x"));
    const yBlocks = parseKeyframes(css, animationName(element.id, "y"));
    // Both properties have a block at 33.333333% — each in its own rule with
    // its own easing (structurally conflict-free per the revised ADR-008).
    expect(xBlocks[1]).toEqual({ pct: 33.333333, value: 10, timing: "ease-in" });
    expect(yBlocks[1]).toEqual({ pct: 33.333333, value: 4, timing: "ease-out" });
    // Values at authored keyframe times are exact; the last authored
    // keyframes hold to 100% with no timing claim.
    expect(xBlocks[2]).toEqual({ pct: 66.666667, value: 20, timing: null });
    expect(yBlocks[2]).toEqual({ pct: 66.666667, value: 8, timing: null });

    expectExportMatchesEngine(css, project, element);
  });
});

describe("exportProjectCss — percentage collisions", () => {
  it("merges distinct times rounding to the same percentage; later wins", () => {
    const project = createProject({
      durationMs: 2_000_000_000,
      elements: [
        createElement("rect", {
          keyframes: [
            createKeyframe("x", 1_000_000_000, 1, "linear"),
            createKeyframe("x", 1_000_000_001, 2, "linear"),
          ],
        }),
      ],
    });
    const css = exportProjectCss(project);
    const element = project.elements[0];

    const xRule = css.match(
      new RegExp(`@keyframes ${animationName(element.id, "x")} \\{\\n([\\s\\S]*?)\\n\\}`),
    );
    expect((xRule?.[1].match(/^  50% \{/gm) ?? []).length).toBe(1);
    // The merged 50% block carries the later keyframe's value; the earlier
    // value survives only in the legitimate 0% hold.
    const collisionBlocks = parseKeyframes(css, animationName(element.id, "x"));
    expect(collisionBlocks.map((b) => b.pct)).toEqual([0, 50, 100]);
    expect(collisionBlocks[1].value).toBe(2);
    expect(collisionBlocks[0].value).toBe(1);
    expect(collisionBlocks[2].value).toBe(2);
  });
});

describe("exportProjectCss — element rules and registrations", () => {
  it("emits @property registrations once per animated transform component", () => {
    const project = fixtureXPlusOpacity();
    const css = exportProjectCss(project);

    expect(css).toContain(`@property --mlab-x {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}`);
    expect(css).not.toContain("@property --mlab-y");
    expect(css).not.toContain("@property --mlab-rotation");
    expect(css).not.toContain("@property --mlab-scale-x");
    expect(css).not.toContain("@property --mlab-scale-y");
  });

  it("renders element rules per type with geometry, fill, and fonts", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          name: "Box",
          width: 120,
          height: 80,
          cornerRadius: 6,
          style: { fill: "#123456", opacity: 1 },
        }),
        createElement("ellipse", { name: "Dot", rx: 25, ry: 40 }),
        createElement("text", {
          name: "Label",
          text: "Hi",
          fontSize: 18,
          fontFamily: "Georgia",
          fontWeight: "700",
        }),
      ],
    });
    const css = exportProjectCss(project);

    const [rect, ellipse, text] = project.elements;
    expectElementInOutput(css, rect);
    expect(css).toContain("fill: #123456;");
    expect(css).toContain("width: 120px;");
    expect(css).toContain("height: 80px;");
    expect(css).toContain("rx: 6px;");
    expectElementInOutput(css, ellipse);
    expect(css).toContain("rx: 25px;");
    expect(css).toContain("ry: 40px;");
    expectElementInOutput(css, text);
    expect(css).toContain("font-family: Georgia;");
    expect(css).toContain("font-size: 18px;");
    expect(css).toContain("font-weight: 700;");
  });

  it("uses the shared local-center transform origin and view-box transform box", () => {
    const project = createProject({
      elements: [createElement("rect", { width: 100, height: 100 })],
    });
    const css = exportProjectCss(project);

    expect(css).toContain("transform-box: view-box;");
    expect(css).toContain("transform-origin: 50px 50px;");
  });

  it("composes transform via var()/calc() with base-value fallbacks", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          transform: { x: 37.25, y: 80.5, rotation: 37.5, scaleX: 1.5, scaleY: 0.8 },
        }),
      ],
    });
    const css = exportProjectCss(project);

    expect(css).toContain(
      "transform: translate(calc(var(--mlab-x, 37.25) * 1px), calc(var(--mlab-y, 80.5) * 1px)) rotate(calc(var(--mlab-rotation, 37.5) * 1deg)) scale(calc(var(--mlab-scale-x, 1.5)), calc(var(--mlab-scale-y, 0.8)));",
    );
  });

  it("is matrix-equivalent to the SVG renderer composition (shared helpers)", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          width: 100,
          height: 100,
          transform: { x: 37.25, y: 80.5, rotation: 37.5, scaleX: 1.5, scaleY: 0.8 },
        }),
      ],
    });
    const element = project.elements[0];
    const css = exportProjectCss(project);

    const originMatch = css.match(/transform-origin: ([\d.]+)px ([\d.]+)px;/);
    expect(originMatch).not.toBeNull();
    const origin: Point = {
      x: Number(originMatch?.[1]),
      y: Number(originMatch?.[2]),
    };

    const fallback = (property: string): number => {
      const match = css.match(
        new RegExp(`var\\(--mlab-${property}, (-?[\\d.]+)\\)`),
      );
      expect(match).not.toBeNull();
      return Number(match?.[1]);
    };

    const points: Point[] = [
      { x: 50, y: 50 }, // element center
      { x: 0, y: 0 }, // local top-left
      { x: 25, y: 75 }, // non-center
      { x: -10.5, y: -20.25 }, // outside geometry
    ];
    const size = getElementSize(element);
    const attribute = composeElementTransform(element.transform, size);
    for (const point of points) {
      const viaCss = applyCssTransform(
        origin,
        fallback("x"),
        fallback("y"),
        fallback("rotation"),
        fallback("scale-x"),
        fallback("scale-y"),
        point,
      );
      const viaSvg = applySvgTransformAttribute(attribute, point);
      expect(viaCss.x).toBeCloseTo(viaSvg.x, 9);
      expect(viaCss.y).toBeCloseTo(viaSvg.y, 9);
    }
  });

  it("omits unanimated properties, animations, and registrations", () => {
    const project = createProject({
      elements: [
        createElement("rect", {
          keyframes: [createKeyframe("x", 0, 0, "linear")],
        }),
        createElement("ellipse", { name: "Static" }),
      ],
    });
    const css = exportProjectCss(project);
    const staticElement = project.elements[1];

    expect(css).not.toContain("--mlab-y: ");
    expect(css).not.toContain("--mlab-rotation: ");
    expect(css).not.toContain("--mlab-scale-x: ");
    expect(css).not.toContain("@property --mlab-y");
    // The static element has a rule but no keyframes or animation.
    expectElementInOutput(css, staticElement);
    expect(css).not.toContain(`@keyframes mlab-${staticElement.id}`);
    const rule = css.match(
      new RegExp(`\\[data-element-id="${staticElement.id}"\\] \\{[\\s\\S]*?\\n\\}`),
    );
    expect(rule?.[0]).not.toContain("animation:");
  });

  it("returns an empty string for a project without elements", () => {
    expect(exportProjectCss(createProject())).toBe("");
  });
});

describe("exportProjectCss — determinism, immutability, validation", () => {
  it("produces identical output for identical input", () => {
    const project = fixtureInterleavedXy();
    expect(exportProjectCss(project)).toBe(exportProjectCss(project));
  });

  it("does not mutate the input project", () => {
    const project = fixtureInterleavedXy();
    const snapshot = structuredClone(project);
    exportProjectCss(project);
    expect(project).toEqual(snapshot);
  });

  it("rejects invalid input with ProjectValidationError", () => {
    expect(() => exportProjectCss(null)).toThrow(ProjectValidationError);
    expect(() => exportProjectCss({ id: "x" })).toThrow(ProjectValidationError);
  });

  it("rejects element ids that cannot be embedded in CSS identifiers", () => {
    const project = createProject({
      elements: [createElement("rect", { name: "Bad id" })],
    });
    (project.elements[0] as { id: string }).id = 'bad" id';
    expect(() => exportProjectCss(project)).toThrow(
      ProjectValidationError,
    );
    expect(() => exportProjectCss(project)).toThrow(/CSS identifiers/);
  });

  it("matches a full-output snapshot for a small fixture", () => {
    const project = createProject({
      durationMs: 2000,
      elements: [
        createElement("rect", {
          width: 40,
          height: 40,
          keyframes: [
            createKeyframe("x", 0, 0, "linear"),
            createKeyframe("x", 1000, 20, "ease-in"),
          ],
        }),
      ],
    });
    const element = project.elements[0];
    const expected = `@property --mlab-x {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

@keyframes mlab-${element.id}-x {
  0% {
    --mlab-x: 0;
    animation-timing-function: linear;
  }
  50% {
    --mlab-x: 20;
  }
  100% {
    --mlab-x: 20;
  }
}

[data-element-id="${element.id}"] {
  fill: #808080;
  width: 40px;
  height: 40px;
  rx: 0px;
  transform-box: view-box;
  transform-origin: 20px 20px;
  transform: translate(calc(var(--mlab-x, 0) * 1px), calc(var(--mlab-y, 0) * 1px)) rotate(calc(var(--mlab-rotation, 0) * 1deg)) scale(calc(var(--mlab-scale-x, 1)), calc(var(--mlab-scale-y, 1)));
  opacity: 1;
  animation: mlab-${element.id}-x 2000ms linear 0ms 1 normal forwards;
}
`;
    expect(exportProjectCss(project)).toBe(expected);
  });
});

describe("exportProjectCss — import hygiene (architecture constraint)", () => {
  it("imports only from engine, project, and lib modules", () => {
    const source = readFileSync("src/export/cssExporter.ts", "utf8");
    const importSpecifiers = [...source.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).not.toMatch(/zustand|react/i);
      expect(specifier).not.toMatch(
        /@\/(editor|components|render|persistence)/,
      );
      expect(
        specifier.startsWith("@/project/") ||
          specifier.startsWith("@/engine/") ||
          specifier.startsWith("@/lib/"),
      ).toBe(true);
    }
  });
});
