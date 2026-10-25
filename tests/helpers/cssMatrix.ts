import type { Point } from "@/lib/coords";

/**
 * Shared transform-application helpers for CSS-export matrix equivalence
 * tests (T15). The CSS applier implements ADR-008 semantics: CSS applies the
 * transform list as
 * `M = T(origin) · translate(x, y) · rotate · scale · T(-origin)` with the
 * origin resolved per `transform-box: view-box`. The SVG applier applies a
 * composed SVG `transform` attribute string right-to-left per SVG
 * semantics. Both operate in the element's user space (geometry drawn at
 * the local origin).
 */

export function applyCssTransform(
  origin: Point,
  x: number,
  y: number,
  rotationDeg: number,
  scaleX: number,
  scaleY: number,
  p: Point,
): Point {
  let dx = p.x - origin.x;
  let dy = p.y - origin.y;
  dx *= scaleX;
  dy *= scaleY;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: origin.x + x + dx * cos - dy * sin,
    y: origin.y + y + dx * sin + dy * cos,
  };
}

/** Applies the composed SVG `transform` attribute (right-to-left). */
export function applySvgTransformAttribute(str: string, p: Point): Point {
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
