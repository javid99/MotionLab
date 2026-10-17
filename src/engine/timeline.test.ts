import { describe, it, expect } from "vitest";
import {
  clampTime,
  effectiveDurationMs,
  elementEffectiveDurationMs,
  findKeyframeSpan,
  keyframesForProperty,
  segmentProgress,
} from "./timeline";
import { createKeyframe, createElement, createProject } from "@/project/defaults";
import type { Keyframe, SceneElement } from "@/project/model";

const DURATION_MS = 5000;

function makeElement(): SceneElement {
  return createElement("rect", {
    keyframes: [
      createKeyframe("x", 1000, 10),
      createKeyframe("x", 3000, 30),
      createKeyframe("y", 2000, 5, "ease-in"),
    ],
  });
}

function makeTrack(): Keyframe[] {
  return [
    createKeyframe("x", 1000, 10),
    createKeyframe("x", 2000, 20),
    createKeyframe("x", 3000, 40),
  ];
}

describe("keyframesForProperty", () => {
  it("returns only the requested property's track", () => {
    const element = makeElement();
    const track = keyframesForProperty(element, "x");
    expect(track.map((k) => k.property)).toEqual(["x", "x"]);
    expect(track.map((k) => k.timeMs)).toEqual([1000, 3000]);
  });

  it("does not mix keyframes across property tracks", () => {
    const element = makeElement();
    const yTrack = keyframesForProperty(element, "y");
    // Compare fields: keyframe ids are unique per createKeyframe call.
    expect(
      yTrack.map((k) => [k.property, k.timeMs, k.value, k.easing]),
    ).toEqual([["y", 2000, 5, "ease-in"]]);
  });

  it("returns an empty array for a property without keyframes", () => {
    const element = makeElement();
    expect(keyframesForProperty(element, "rotation")).toEqual([]);
  });

  it("does not mutate the element's keyframes array", () => {
    const element = makeElement();
    const snapshot = element.keyframes.map((k) => ({ ...k }));
    keyframesForProperty(element, "x");
    expect(element.keyframes).toEqual(snapshot);
  });
});

describe("findKeyframeSpan", () => {
  it("returns empty for a track without keyframes", () => {
    expect(findKeyframeSpan([], 0)).toEqual({ kind: "empty" });
    expect(findKeyframeSpan([], 2500)).toEqual({ kind: "empty" });
  });

  it("holds at the keyframe for a single-keyframe track (before, at, after)", () => {
    const track = [createKeyframe("x", 2000, 7)];
    expect(findKeyframeSpan(track, 0)).toEqual({ kind: "hold", keyframe: track[0] });
    expect(findKeyframeSpan(track, 1999)).toEqual({ kind: "hold", keyframe: track[0] });
    expect(findKeyframeSpan(track, 2000)).toEqual({ kind: "hold", keyframe: track[0] });
    expect(findKeyframeSpan(track, 5000)).toEqual({ kind: "hold", keyframe: track[0] });
  });

  it("holds at the first keyframe before the track starts", () => {
    const track = makeTrack();
    expect(findKeyframeSpan(track, 0)).toEqual({ kind: "hold", keyframe: track[0] });
    expect(findKeyframeSpan(track, 999)).toEqual({ kind: "hold", keyframe: track[0] });
  });

  it("returns the surrounding pair between keyframes", () => {
    const track = makeTrack();
    expect(findKeyframeSpan(track, 1500)).toEqual({
      kind: "segment",
      from: track[0],
      to: track[1],
    });
    expect(findKeyframeSpan(track, 2500)).toEqual({
      kind: "segment",
      from: track[1],
      to: track[2],
    });
  });

  it("starts a segment exactly at a keyframe timestamp", () => {
    const track = makeTrack();
    expect(findKeyframeSpan(track, 1000)).toEqual({
      kind: "segment",
      from: track[0],
      to: track[1],
    });
    expect(findKeyframeSpan(track, 2000)).toEqual({
      kind: "segment",
      from: track[1],
      to: track[2],
    });
  });

  it("holds at the last keyframe at and after the track end", () => {
    const track = makeTrack();
    expect(findKeyframeSpan(track, 3000)).toEqual({ kind: "hold", keyframe: track[2] });
    expect(findKeyframeSpan(track, 4000)).toEqual({ kind: "hold", keyframe: track[2] });
  });

  it("is deterministic and does not mutate the input", () => {
    const track = makeTrack();
    const snapshot = track.map((k) => ({ ...k }));
    const first = findKeyframeSpan(track, 1500);
    const second = findKeyframeSpan(track, 1500);
    expect(first).toEqual(second);
    expect(track).toEqual(snapshot);
  });
});

describe("segmentProgress", () => {
  const from = createKeyframe("x", 1000, 0);
  const to = createKeyframe("x", 3000, 0);

  it("returns 0 at the segment start, 1 at the end, fractions between", () => {
    expect(segmentProgress(1000, from, to)).toBe(0);
    expect(segmentProgress(3000, from, to)).toBe(1);
    expect(segmentProgress(2000, from, to)).toBe(0.5);
    expect(segmentProgress(1500, from, to)).toBeCloseTo(0.25, 12);
  });

  it("throws RangeError for degenerate (non-increasing) intervals", () => {
    expect(() => segmentProgress(1000, from, from)).toThrow(RangeError);
    expect(() =>
      segmentProgress(1000, to, from),
    ).toThrow(RangeError);
  });

  it("throws RangeError for non-finite timeMs", () => {
    expect(() => segmentProgress(Number.NaN, from, to)).toThrow(RangeError);
    expect(() =>
      segmentProgress(Number.POSITIVE_INFINITY, from, to),
    ).toThrow(RangeError);
  });
});

describe("clampTime", () => {
  it("clamps times outside [0, durationMs]", () => {
    expect(clampTime(-1, DURATION_MS)).toBe(0);
    expect(clampTime(6000, DURATION_MS)).toBe(DURATION_MS);
  });

  it("returns in-range times unchanged, including boundaries", () => {
    expect(clampTime(0, DURATION_MS)).toBe(0);
    expect(clampTime(2500, DURATION_MS)).toBe(2500);
    expect(clampTime(DURATION_MS, DURATION_MS)).toBe(DURATION_MS);
    expect(clampTime(12.5, DURATION_MS)).toBe(12.5);
  });

  it("throws RangeError for invalid inputs", () => {
    expect(() => clampTime(Number.NaN, DURATION_MS)).toThrow(RangeError);
    expect(() =>
      clampTime(Number.POSITIVE_INFINITY, DURATION_MS),
    ).toThrow(RangeError);
    expect(() => clampTime(0, 0)).toThrow(RangeError);
    expect(() => clampTime(0, -100)).toThrow(RangeError);
    expect(() => clampTime(0, Number.NaN)).toThrow(RangeError);
  });
});

describe("effectiveDurationMs", () => {
  it("returns 0 for an empty track", () => {
    expect(effectiveDurationMs([])).toBe(0);
  });

  it("returns the single keyframe's time", () => {
    expect(effectiveDurationMs([createKeyframe("x", 2500, 0)])).toBe(2500);
  });

  it("returns the maximum time regardless of input order", () => {
    const track = [
      createKeyframe("x", 3000, 0),
      createKeyframe("x", 1000, 0),
      createKeyframe("x", 2000, 0),
    ];
    expect(effectiveDurationMs(track)).toBe(3000);
  });
});

describe("elementEffectiveDurationMs", () => {
  it("returns the maximum across all property tracks of one element", () => {
    const element = makeElement();
    // x track ends at 3000, y track at 2000.
    expect(elementEffectiveDurationMs(element)).toBe(3000);
  });

  it("returns 0 for an element without keyframes", () => {
    const project = createProject({ elements: [createElement("rect")] });
    expect(elementEffectiveDurationMs(project.elements[0])).toBe(0);
  });

  it("does not mix tracks of different elements", () => {
    const project = createProject({
      elements: [makeElement(), createElement("ellipse")],
    });
    const [first] = project.elements;
    expect(elementEffectiveDurationMs(first)).toBe(3000);
    expect(elementEffectiveDurationMs(project.elements[1])).toBe(0);
  });
});
