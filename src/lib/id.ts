const UUID_V4_TEMPLATE = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

/**
 * RFC 4122 v4 fallback used when `crypto.randomUUID()` is unavailable
 * (e.g. older runtimes and some jsdom configurations). Prefers
 * `crypto.getRandomValues` and degrades to `Math.random` as a last resort.
 * Exported for tests.
 */
export function createFallbackId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }
  return UUID_V4_TEMPLATE.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Generates a unique RFC 4122 v4 UUID string (ADR-006). */
export function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return createFallbackId();
}
