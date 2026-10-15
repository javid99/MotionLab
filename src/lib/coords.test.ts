import { describe, it, expect } from "vitest";
import {
  createViewTransform,
  sceneToCanvas,
  canvasToScene,
  canvasToScreen,
  screenToCanvas,
  sceneToScreen,
  screenToScene,
  zoomAtScreen,
  type Point,
  type ViewTransform,
} from "./coords";

function expectPointClose(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

/** Arbitrary zoom/pan matrices used across tests (incl. fractional values). */
const VIEWS: ViewTransform[] = [
  createViewTransform(1, 0, 0), // identity
  createViewTransform(1.37, 120.5, -64.25), // fractional zoom + pan
  createViewTransform(0.25, -500, 900), // zoom-out, negative offset
  createViewTransform(3, 0, -1275.75), // integer zoom, large offset
];

const POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 200 },
  { x: -42.75, y: 3.14159 }, // negative + fractional
  { x: 1279.5, y: 719.25 }, // near canvas bounds (fractional)
];

describe("scene <-> canvas", () => {
  it("scales scene points to canvas space", () => {
    expectPointClose(sceneToCanvas({ x: 10, y: -20 }, 2), { x: 20, y: -40 });
    expectPointClose(sceneToCanvas({ x: 1.5, y: 0.5 }, 1.37), {
      x: 2.055,
      y: 0.685,
    });
  });

  it("round-trips scene → canvas → scene for arbitrary scales", () => {
    for (const scale of [1, 0.25, 1.37, 3]) {
      for (const point of POINTS) {
        expectPointClose(canvasToScene(sceneToCanvas(point, scale), scale), point);
      }
    }
  });

  it("throws RangeError for invalid scales", () => {
    for (const scale of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sceneToCanvas({ x: 1, y: 1 }, scale)).toThrow(RangeError);
      expect(() => canvasToScene({ x: 1, y: 1 }, scale)).toThrow(RangeError);
    }
  });
});

describe("canvas <-> screen", () => {
  it("pans canvas points into screen space", () => {
    expectPointClose(canvasToScreen({ x: 10, y: 20 }, { x: -5, y: 0.5 }), {
      x: 5,
      y: 20.5,
    });
  });

  it("round-trips canvas → screen → canvas for arbitrary offsets", () => {
    const offsets: Point[] = [
      { x: 0, y: 0 },
      { x: 120.5, y: -64.25 },
      { x: -1000, y: 900 },
    ];
    for (const offset of offsets) {
      for (const point of POINTS) {
        expectPointClose(screenToCanvas(canvasToScreen(point, offset), offset), point);
      }
    }
  });
});

describe("scene <-> screen (full view transform)", () => {
  it("maps with the documented formula screen = scene * scale + offset", () => {
    const view = createViewTransform(1.37, 120.5, -64.25);
    expectPointClose(sceneToScreen({ x: 10, y: -20 }, view), {
      x: 10 * 1.37 + 120.5,
      y: -20 * 1.37 - 64.25,
    });
  });

  it("round-trips screen → scene → screen for arbitrary zoom/pan", () => {
    for (const view of VIEWS) {
      for (const point of POINTS) {
        const scene = screenToScene(point, view);
        expectPointClose(sceneToScreen(scene, view), point);
      }
    }
  });

  it("round-trips scene → screen → scene for arbitrary zoom/pan", () => {
    for (const view of VIEWS) {
      for (const point of POINTS) {
        const screen = sceneToScreen(point, view);
        expectPointClose(screenToScene(screen, view), point);
      }
    }
  });

  it("is the identity transform at scale 1 with zero offset", () => {
    const view = createViewTransform(1, 0, 0);
    for (const point of POINTS) {
      expectPointClose(sceneToScreen(point, view), point);
      expectPointClose(screenToScene(point, view), point);
    }
  });

  it("throws RangeError for invalid view transforms", () => {
    expect(() => createViewTransform(0)).toThrow(RangeError);
    expect(() => createViewTransform(-1)).toThrow(RangeError);
    expect(() => createViewTransform(Number.NaN)).toThrow(RangeError);
    expect(() => createViewTransform(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => createViewTransform(1, Number.NaN, 0)).toThrow(RangeError);
    expect(() => createViewTransform(1, 0, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );

    const invalidScale = { scale: 0, offsetX: 0, offsetY: 0 };
    expect(() => sceneToScreen({ x: 1, y: 1 }, invalidScale)).toThrow(RangeError);
    expect(() => screenToScene({ x: 1, y: 1 }, invalidScale)).toThrow(RangeError);
  });

  it("propagates non-finite point inputs without clamping", () => {
    const view = createViewTransform(2, 10, 10);
    const result = screenToScene({ x: Number.NaN, y: 0 }, view);
    expect(Number.isNaN(result.x)).toBe(true);
    expect(result.y).toBe(-5);
  });
});

describe("zoomAtScreen — zoom around a focal point", () => {
  it("keeps the scene point under the focal screen point fixed on screen", () => {
    const view = createViewTransform(1.37, 120.5, -64.25);
    const focalScreen: Point = { x: 640, y: 400 };
    const focalScene = screenToScene(focalScreen, view);

    for (const nextScale of [0.5, 2, 1.37, 4.75]) {
      const zoomed = zoomAtScreen(view, focalScreen, nextScale);
      expect(zoomed.scale).toBe(nextScale);
      // The focal scene point must land exactly where it did before.
      expectPointClose(sceneToScreen(focalScene, zoomed), focalScreen);
    }
  });

  it("moves other scene points consistently with the new scale", () => {
    const view = createViewTransform(1, 0, 0);
    const zoomed = zoomAtScreen(view, { x: 0, y: 0 }, 2);
    // Zooming by 2 about the screen origin doubles distances from it.
    expectPointClose(sceneToScreen({ x: 100, y: 50 }, zoomed), {
      x: 200,
      y: 100,
    });
  });

  it("supports zoom sequences while pinning each focal point", () => {
    let view = createViewTransform(1, 0, 0);
    const steps: Array<{ focal: Point; scale: number }> = [
      { focal: { x: 300, y: 200 }, scale: 2 },
      { focal: { x: 450, y: 350 }, scale: 0.75 },
      { focal: { x: 100, y: 50 }, scale: 3.5 },
    ];
    for (const { focal, scale } of steps) {
      const pinnedScene = screenToScene(focal, view);
      view = zoomAtScreen(view, focal, scale);
      expectPointClose(sceneToScreen(pinnedScene, view), focal);
    }
    expect(view.scale).toBe(3.5);
  });

  it("throws RangeError for invalid next scales or focal points", () => {
    const view = createViewTransform(1, 0, 0);
    for (const nextScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => zoomAtScreen(view, { x: 10, y: 10 }, nextScale)).toThrow(
        RangeError,
      );
    }
    for (const focal of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => zoomAtScreen(view, focal, 2)).toThrow(RangeError);
    }
  });
});
