import { describe, it, expect } from "vitest";
import { createId, createFallbackId } from "./id";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createId", () => {
  it("returns an RFC 4122 v4 UUID", () => {
    expect(createId()).toMatch(UUID_V4_REGEX);
  });

  it("generates unique ids across repeated calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe("createFallbackId", () => {
  it("returns an RFC 4122 v4 UUID", () => {
    expect(createFallbackId()).toMatch(UUID_V4_REGEX);
  });

  it("generates unique ids across repeated calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      ids.add(createFallbackId());
    }
    expect(ids.size).toBe(500);
  });
});
