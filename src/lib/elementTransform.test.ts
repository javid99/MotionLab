import { describe, it, expect } from "vitest";
import {
  TEXT_HEIGHT_FACTOR,
  TEXT_WIDTH_FACTOR,
  composeElementTransform,
  getCssTransformOrigin,
  getElementCenter,
  getElementSize,
} from "./elementTransform";
import { createElement } from "@/project/defaults";
import type { Point } from "@/lib/coords";
import type { SceneElement, Transform } from "@/project/model";

describe("getElementSize", () => {
  it("returns rect geometry as-is", () => {
    const rect = createElement("rect", { width: 320, height: 240 });
    expect(getElementSize(rect)).toEqual({ width: 320, height: 240 });
  });

  it("returns the full ellipse bounding box (2rx × 2ry)", () => {
    const ellipse = createElement("ellipse", { rx: 30, ry: 45 });
    expect(getElementSize(ellipse)).toEqual({ width: 60, height: 90 });
  });

  it("computes text size from the confirmed deterministic constants", () => {
    const text = createElement("text", { text: "Hello", fontSize: 16 });
    expect(getElementSize(text)).toEqual({
      width: TEXT_WIDTH_FACTOR * 16 * 5, // 48
      height: TEXT_HEIGHT_FACTOR * 16, // 19.2
    });
    expect(getElementSize(text).width).toBe(48);
    expect(getElementSize(text).height).toBe(19.2);
  });

  it("counts every character of the text content, including spaces", () => {
    const text = createElement("text", { text: "a b", fontSize: 10 });
    expect(getElementSize(text).width).toBe(TEXT_WIDTH_FACTOR * 10 * 3);
  });
});

describe("getElementCenter", () => {
  it("offsets the local center by the element position", () => {
    const rect = createElement("rect", { width: 100, height: 100 });
    const center = getElementCenter(rect, {
      x: 100,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(center).toEqual({ x: 150, y: 100 });
  });

  it("uses the deterministic text box for text centers", () => {
    const text = createElement("text", { text: "Hi", fontSize: 20 });
    const center = getElementCenter(text, {
      x: 10,
      y: 20,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(center.x).toBe(10 + (TEXT_WIDTH_FACTOR * 20 * 2) / 2);
    expect(center.y).toBe(20 + (TEXT_HEIGHT_FACTOR * 20) / 2);
  });
});

describe("composeElementTransform", () => {
  it("reduces to translate(x, y) at rotation 0 and scale 1", () => {
    const transform = {
      x: 100,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    expect(composeElementTransform(transform, { width: 100, height: 100 })).toBe(
      "translate(150 100) rotate(0) scale(1 1) translate(-50 -50)",
    );
  });

  it("composes rotate and scale about the element center", () => {
    const transform = {
      x: 100,
      y: 50,
      rotation: 90,
      scaleX: 2,
      scaleY: 1,
    };
    expect(composeElementTransform(transform, { width: 100, height: 100 })).toBe(
      "translate(150 100) rotate(90) scale(2 1) translate(-50 -50)",
    );
  });

  it("preserves fractional values without rounding", () => {
    const transform = {
      x: 10.25,
      y: -3.75,
      rotation: 0.5,
      scaleX: 1.25,
      scaleY: 0.75,
    };
    const result = composeElementTransform(transform, { width: 8.4, height: 6 });
    expect(result).toBe(
      "translate(14.45 -0.75) rotate(0.5) scale(1.25 0.75) translate(-4.2 -3)",
    );
  });
});

describe("getCssTransformOrigin", () => {
  it("returns the element's local center for every element type", () => {
    const rect = createElement("rect", { width: 100, height: 100 });
    const ellipse = createElement("ellipse", { rx: 30, ry: 45 });
    const text = createElement("text", { text: "Hi", fontSize: 20 });

    expect(getCssTransformOrigin(rect)).toEqual({ x: 50, y: 50 });
    expect(getCssTransformOrigin(ellipse)).toEqual({ x: 30, y: 45 });
    expect(getCssTransformOrigin(text)).toEqual({
      x: (TEXT_WIDTH_FACTOR * 20 * 2) / 2,
      y: (TEXT_HEIGHT_FACTOR * 20) / 2,
    });
  });
});

/**
 * Independent matrix application used to verify the ADR-008 CSS export
 * contract against the renderer's composed attribute. CSS applies the
 * transform list as M = T(origin) · translate(x,y) · rotate · scale ·
 * T(-origin), with the origin resolved per `transform-box: view-box`.
 */
function applyCssExportMatrix(
  element: SceneElement,
  transform: Transform,
  p: Point,
): Point {
  const o = getCssTransformOrigin(element);
  let dx = p.x - o.x;
  let dy = p.y - o.y;
  dx *= transform.scaleX;
  dy *= transform.scaleY;
  const rad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: o.x + transform.x + dx * cos - dy * sin,
    y: o.y + transform.y + dx * sin + dy * cos,
  };
}

/** Applies the composed SVG `transform` attribute (right-to-left). */
function applySvgTransformAttribute(str: string, p: Point): Point {
  const tokens = str.match(/(translate|rotate|scale)\(([^)]+)\)/g);
  if (!tokens) throw new Error(`unparseable transform: ${str}`);
  let x = p.x;
  let y = p.y;
  for (const token of [...tokens].reverse()) {
    const args = token
      .slice(token.indexOf("(") + 1, -1)
      .split(/[\s,]+/)
      .map(Number);
    if (token.startsWith("translate")) {
      x += args[0] as number;
      y += args[1] as number;
    } else if (token.startsWith("scale")) {
      x *= args[0] as number;
      y *= args[1] as number;
    } else {
      const rad = ((args[0] as number) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      x = rotatedX;
      y = rotatedY;
    }
  }
  return { x, y };
}

function expectClose(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe("CSS export matrix equivalence (ADR-008)", () => {
  const elements = [
    createElement("rect", { width: 100, height: 100 }),
    createElement("ellipse", { rx: 30, ry: 45 }),
    createElement("text", { text: "Hi", fontSize: 20 }),
  ];

  const transforms: Array<[string, Transform]> = [
    ["translation only", { x: 120.5, y: -64.25, rotation: 0, scaleX: 1, scaleY: 1 }],
    ["rotation only", { x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 }],
    [
      "non-uniform scale only",
      { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 0.5 },
    ],
    [
      "combined fractional",
      { x: 37.25, y: 80.5, rotation: 37.5, scaleX: 1.5, scaleY: 0.8 },
    ],
  ];

  it("matches the renderer matrix for the element center and non-center points", () => {
    for (const element of elements) {
      const size = getElementSize(element);
      const points: Point[] = [
        { x: size.width / 2, y: size.height / 2 }, // element center
        { x: 0, y: 0 }, // local top-left
        { x: size.width / 4, y: (3 * size.height) / 4 }, // non-center
        { x: -10.5, y: -20.25 }, // outside the geometry
      ];
      for (const [, transform] of transforms) {
        const attribute = composeElementTransform(transform, size);
        for (const point of points) {
          const viaSvgAttribute = applySvgTransformAttribute(attribute, point);
          const viaCss = applyCssExportMatrix(element, transform, point);
          expectClose(viaCss, viaSvgAttribute);
        }
      }
    }
  });

  it("carries the element's material center to the absolute center", () => {
    for (const element of elements) {
      for (const [, transform] of transforms) {
        const localCenter: Point = {
          x: getElementSize(element).width / 2,
          y: getElementSize(element).height / 2,
        };
        const attribute = composeElementTransform(
          transform,
          getElementSize(element),
        );
        expectClose(
          applySvgTransformAttribute(attribute, localCenter),
          getElementCenter(element, transform),
        );
        expectClose(
          applyCssExportMatrix(element, transform, localCenter),
          getElementCenter(element, transform),
        );
      }
    }
  });
});
