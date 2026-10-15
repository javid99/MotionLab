import { describe, it, expect } from "vitest";
import {
  TEXT_HEIGHT_FACTOR,
  TEXT_WIDTH_FACTOR,
  composeElementTransform,
  getElementCenter,
  getElementSize,
} from "./elementTransform";
import { createElement } from "@/project/defaults";

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
