import { describe, it, expect } from "vitest";
import {
  getEasingFunction,
  interpolate,
  interpolateLinear,
} from "./interpolation";
import type { Easing } from "@/project/model";

const EASINGS: Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

// Golden midpoint values (tolerance 1e-3). ease-in-out is symmetric about
// (0.5, 0.5), so ease-in-out(0.5) = 0.5 exactly. ease-in (0.42, 0, 1, 1) at
// u = 0.5 solves 0.74t³ − 0.48t² − 1.26t + 0.5 = 0, giving t ≈ 0.37426 and
// y(t) = 3(1−t)t² + t³ ≈ 0.31536; ease-out is its mirror.
const MIDPOINT_GOLDEN: Record<Easing, number> = {
  linear: 0.5,
  "ease-in": 0.3154,
  "ease-out": 0.6846,
  "ease-in-out": 0.5,
};

describe("getEasingFunction — boundaries", () => {
  for (const easing of EASINGS) {
    it(`${easing}: u = 0 returns exactly 0 and u = 1 returns exactly 1`, () => {
      const ease = getEasingFunction(easing);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    });

    it(`${easing}: clamps u outside [0, 1]`, () => {
      const ease = getEasingFunction(easing);
      expect(ease(-0.5)).toBe(0);
      expect(ease(1.5)).toBe(1);
    });
  }
});

describe("getEasingFunction — documented curve properties", () => {
  it("linear is the identity map", () => {
    const ease = getEasingFunction("linear");
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9, 0.333333]) {
      expect(ease(u)).toBe(u);
    }
  });

  it("every easing is monotonically non-decreasing", () => {
    for (const easing of EASINGS) {
      const ease = getEasingFunction(easing);
      let previous = 0;
      for (let i = 1; i <= 20; i += 1) {
        const value = ease(i / 20);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
      expect(previous).toBe(1);
    }
  });

  it("ease-in starts slower than linear; ease-out faster", () => {
    const easeIn = getEasingFunction("ease-in");
    const easeOut = getEasingFunction("ease-out");
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(easeIn(u)).toBeLessThanOrEqual(u);
      expect(easeOut(u)).toBeGreaterThanOrEqual(u);
    }
  });

  it("ease-in-out is symmetric about (0.5, 0.5)", () => {
    const easeInOut = getEasingFunction("ease-in-out");
    for (const u of [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9]) {
      expect(easeInOut(u) + easeInOut(1 - u)).toBeCloseTo(1, 9);
    }
  });

  it("ease-out mirrors ease-in: ease-out(u) = 1 − ease-in(1 − u)", () => {
    const easeIn = getEasingFunction("ease-in");
    const easeOut = getEasingFunction("ease-out");
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(easeOut(u)).toBeCloseTo(1 - easeIn(1 - u), 6);
    }
  });

  it("matches the documented golden midpoint values", () => {
    for (const easing of EASINGS) {
      const ease = getEasingFunction(easing);
      expect(ease(0.5)).toBeCloseTo(MIDPOINT_GOLDEN[easing], 3);
    }
  });

  it("matches the documented golden value at u = 0.25", () => {
    // ease-in at u = 0.25 solves 0.74t³ − 0.48t² − 1.26t + 0.25 = 0
    // (t ≈ 0.1888), y(t) = 3(1−t)t² + t³ ≈ 0.09346.
    expect(getEasingFunction("ease-in")(0.25)).toBeCloseTo(0.09346, 3);
  });

  it("is deterministic — repeated calls return identical results", () => {
    for (const easing of EASINGS) {
      const ease = getEasingFunction(easing);
      expect(ease(0.42345)).toBe(ease(0.42345));
    }
  });

  it("propagates non-finite inputs (documented pure-math behavior)", () => {
    const ease = getEasingFunction("ease-in");
    expect(Number.isNaN(ease(Number.NaN))).toBe(true);
  });
});

describe("interpolateLinear", () => {
  it("interpolates linearly, including fractional results", () => {
    expect(interpolateLinear(10, 20, 0.5)).toBe(15);
    expect(interpolateLinear(0, 1, 0.25)).toBe(0.25);
    expect(interpolateLinear(-10, 10, 0.75)).toBe(5);
    expect(interpolateLinear(1.5, 2.5, 0.3)).toBeCloseTo(1.8, 12);
  });

  it("returns the exact endpoints at u = 0 and u = 1", () => {
    expect(interpolateLinear(7.25, -3.5, 0)).toBe(7.25);
    expect(interpolateLinear(7.25, -3.5, 1)).toBe(-3.5);
  });

  it("handles reversed value order (from > to)", () => {
    expect(interpolateLinear(20, 10, 0.5)).toBe(15);
    expect(interpolateLinear(20, 10, 0)).toBe(20);
    expect(interpolateLinear(20, 10, 1)).toBe(10);
  });
});

describe("interpolate — eased numeric interpolation", () => {
  it("returns the exact endpoints for every easing", () => {
    for (const easing of EASINGS) {
      expect(interpolate(10, 20, 0, easing)).toBe(10);
      expect(interpolate(10, 20, 1, easing)).toBe(20);
    }
  });

  it("applies easing to normalized progress before interpolating", () => {
    // interpolate = from + (to − from) · easing(u)
    expect(interpolate(0, 100, 0.5, "linear")).toBe(50);
    expect(interpolate(0, 100, 0.5, "ease-in")).toBeCloseTo(31.54, 1);
    expect(interpolate(0, 100, 0.5, "ease-out")).toBeCloseTo(68.46, 1);
    // Symmetric curve: the midpoint maps to the midpoint.
    expect(interpolate(0, 100, 0.5, "ease-in-out")).toBe(50);
  });

  it("supports fractional and negative value ranges", () => {
    expect(interpolate(-2.5, 2.5, 0.5, "linear")).toBe(0);
    expect(interpolate(-2.5, 2.5, 0.5, "ease-in")).toBeCloseTo(-0.9231, 2);
  });

  it("clamps out-of-range progress", () => {
    expect(interpolate(10, 20, -1, "ease-in-out")).toBe(10);
    expect(interpolate(10, 20, 2, "ease-in-out")).toBe(20);
  });

  it("interpolates rotated and scaled values identically (pure math)", () => {
    // 90° clockwise rotation value pair, e.g. rotation keyframes.
    expect(interpolate(0, 90, 0.25, "linear")).toBeCloseTo(22.5, 12);
    // Scale keyframes with non-uniform targets.
    expect(interpolate(1, 3, 0.5, "linear")).toBe(2);
  });
});
