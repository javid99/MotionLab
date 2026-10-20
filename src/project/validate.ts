/**
 * Runtime validation of untrusted project data (T13) — hand-written type
 * guards per the accepted ADR-004 (no schema library, no dependencies).
 * Pure TypeScript: no React/DOM/store imports; the input is never mutated.
 *
 * ## Contract
 *
 * - `validateProject(data)` returns the data typed as `Project` when it
 *   satisfies the documented model and invariants, and throws a
 *   `ProjectValidationError` otherwise. The error accumulates ALL issues in
 *   deterministic document order, so callers see every failure at once.
 * - Enforced invariants (documented in ARCHITECTURE.md / model.ts and the
 *   established store behavior):
 *   - project: non-empty `id`, string `name`, finite canvas dimensions,
 *     finite `fps > 0`, integer `durationMs > 0`, parseable ISO timestamps,
 *     `elements` array, unique element ids;
 *   - elements: valid discriminated union `type` (exhaustive switch over
 *     `rect` | `ellipse` | `text`), non-empty id, booleans `locked` /
 *     `visible`, finite transform and style numbers, type-specific geometry
 *     fields;
 *   - keyframes: non-empty id (unique within the element), property from
 *     `ANIMATABLE_PROPERTIES`, integer `timeMs` within
 *     `[0, project.durationMs]`, finite `value`, easing from `EASINGS`,
 *     no duplicate times and ascending order per `(element, property)` track
 *     (the documented store invariant the evaluator relies on).
 * - Not enforced (no documented constraint): `name` non-empty, canvas
 *   width/height positivity, opacity range, scale/rotation ranges,
 *   `updatedAt >= createdAt`.
 */

import {
  ANIMATABLE_PROPERTIES,
  EASINGS,
  type Project,
} from "@/project/model";

export class ProjectValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid project: ${issues.join("; ")}`);
    this.name = "ProjectValidationError";
    this.issues = issues;
  }
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    isNonEmptyString(value) && !Number.isNaN(Date.parse(value))
  );
}

function isAnimatableProperty(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (ANIMATABLE_PROPERTIES as readonly string[]).includes(value)
  );
}

function isEasing(value: unknown): value is string {
  return typeof value === "string" && (EASINGS as readonly string[]).includes(value);
}

const TRANSFORM_FIELDS = ["x", "y", "rotation", "scaleX", "scaleY"] as const;

interface KeyframeContext {
  durationMs: number | null;
  keyframeIds: Set<string>;
  timesByProperty: Map<string, number[]>;
}

export function validateProject(data: unknown): Project {
  const issues: string[] = [];
  if (!isRecord(data)) {
    throw new ProjectValidationError(["project must be an object"]);
  }

  if (!isNonEmptyString(data.id)) {
    issues.push("project.id must be a non-empty string");
  }
  if (typeof data.name !== "string") {
    issues.push("project.name must be a string");
  }

  if (!isRecord(data.canvas)) {
    issues.push("project.canvas must be an object");
  } else {
    for (const field of ["width", "height", "fps"] as const) {
      if (!isFiniteNumber(data.canvas[field])) {
        issues.push(`project.canvas.${field} must be a finite number`);
      }
    }
    if (isFiniteNumber(data.canvas.fps) && data.canvas.fps <= 0) {
      issues.push("project.canvas.fps must be > 0");
    }
  }

  let durationMs: number | null = null;
  if (
    typeof data.durationMs !== "number" ||
    !Number.isInteger(data.durationMs) ||
    data.durationMs <= 0
  ) {
    issues.push("project.durationMs must be a positive integer");
  } else {
    durationMs = data.durationMs;
  }

  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isIsoTimestamp(data[field])) {
      issues.push(`project.${field} must be an ISO 8601 timestamp`);
    }
  }

  if (!Array.isArray(data.elements)) {
    issues.push("project.elements must be an array");
  } else {
    const elementIds = new Set<string>();
    data.elements.forEach((element, index) => {
      validateElement(element, `project.elements[${index}]`, issues, {
        durationMs,
        elementIds,
      });
    });
  }

  if (issues.length > 0) {
    throw new ProjectValidationError(issues);
  }
  return data as unknown as Project;
}

interface ElementContext {
  durationMs: number | null;
  elementIds: Set<string>;
}

function validateElement(
  data: unknown,
  path: string,
  issues: string[],
  context: ElementContext,
): void {
  if (!isRecord(data)) {
    issues.push(`${path} must be an object`);
    return;
  }

  if (!isNonEmptyString(data.id)) {
    issues.push(`${path}.id must be a non-empty string`);
  } else if (context.elementIds.has(data.id)) {
    issues.push(`${path}.id "${data.id}" is not unique within the project`);
  } else {
    context.elementIds.add(data.id);
  }

  if (typeof data.name !== "string") {
    issues.push(`${path}.name must be a string`);
  }
  if (typeof data.locked !== "boolean") {
    issues.push(`${path}.locked must be a boolean`);
  }
  if (typeof data.visible !== "boolean") {
    issues.push(`${path}.visible must be a boolean`);
  }

  validateTransform(data.transform, `${path}.transform`, issues);

  if (!isRecord(data.style)) {
    issues.push(`${path}.style must be an object`);
  } else {
    if (typeof data.style.fill !== "string") {
      issues.push(`${path}.style.fill must be a string`);
    }
    if (!isFiniteNumber(data.style.opacity)) {
      issues.push(`${path}.style.opacity must be a finite number`);
    }
  }

  if (!Array.isArray(data.keyframes)) {
    issues.push(`${path}.keyframes must be an array`);
  } else {
    const keyframeContext: KeyframeContext = {
      durationMs: context.durationMs,
      keyframeIds: new Set<string>(),
      timesByProperty: new Map<string, number[]>(),
    };
    data.keyframes.forEach((keyframe, index) => {
      validateKeyframe(
        keyframe,
        `${path}.keyframes[${index}]`,
        issues,
        keyframeContext,
      );
    });
    for (const [property, times] of keyframeContext.timesByProperty) {
      for (let i = 1; i < times.length; i += 1) {
        if (times[i] === times[i - 1]) {
          issues.push(
            `${path} has duplicate keyframe times for property "${property}"`,
          );
        } else if (times[i] < times[i - 1]) {
          issues.push(
            `${path} keyframes for property "${property}" must be sorted ascending by timeMs`,
          );
        }
      }
    }
  }

  // Exhaustive switch over the documented discriminated union.
  switch (data.type) {
    case "rect":
      for (const field of ["width", "height", "cornerRadius"] as const) {
        if (!isFiniteNumber(data[field])) {
          issues.push(`${path}.${field} must be a finite number`);
        }
      }
      break;
    case "ellipse":
      for (const field of ["rx", "ry"] as const) {
        if (!isFiniteNumber(data[field])) {
          issues.push(`${path}.${field} must be a finite number`);
        }
      }
      break;
    case "text":
      if (typeof data.text !== "string") {
        issues.push(`${path}.text must be a string`);
      }
      if (!isFiniteNumber(data.fontSize)) {
        issues.push(`${path}.fontSize must be a finite number`);
      }
      if (typeof data.fontFamily !== "string") {
        issues.push(`${path}.fontFamily must be a string`);
      }
      if (typeof data.fontWeight !== "string") {
        issues.push(`${path}.fontWeight must be a string`);
      }
      break;
    default:
      issues.push(
        `${path}.type must be one of "rect" | "ellipse" | "text"`,
      );
  }
}

function validateTransform(
  data: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(data)) {
    issues.push(`${path} must be an object`);
    return;
  }
  for (const field of TRANSFORM_FIELDS) {
    if (!isFiniteNumber(data[field])) {
      issues.push(`${path}.${field} must be a finite number`);
    }
  }
}

function validateKeyframe(
  data: unknown,
  path: string,
  issues: string[],
  context: KeyframeContext,
): void {
  if (!isRecord(data)) {
    issues.push(`${path} must be an object`);
    return;
  }

  if (!isNonEmptyString(data.id)) {
    issues.push(`${path}.id must be a non-empty string`);
  } else if (context.keyframeIds.has(data.id)) {
    issues.push(
      `${path}.id "${data.id}" is not unique within the element`,
    );
  } else {
    context.keyframeIds.add(data.id);
  }

  if (!isAnimatableProperty(data.property)) {
    issues.push(
      `${path}.property must be one of ${ANIMATABLE_PROPERTIES.map(
        (property) => `"${property}"`,
      ).join(" | ")}`,
    );
  }

  if (typeof data.timeMs !== "number" || !Number.isInteger(data.timeMs)) {
    issues.push(`${path}.timeMs must be an integer`);
  } else {
    if (data.timeMs < 0) {
      issues.push(`${path}.timeMs must be >= 0`);
    }
    if (context.durationMs !== null && data.timeMs > context.durationMs) {
      issues.push(
        `${path}.timeMs must be <= project.durationMs (${context.durationMs})`,
      );
    }
    if (isAnimatableProperty(data.property)) {
      const times = context.timesByProperty.get(data.property) ?? [];
      times.push(data.timeMs);
      context.timesByProperty.set(data.property, times);
    }
  }

  if (!isFiniteNumber(data.value)) {
    issues.push(`${path}.value must be a finite number`);
  }
  if (!isEasing(data.easing)) {
    issues.push(
      `${path}.easing must be one of ${EASINGS.map((easing) => `"${easing}"`).join(
        " | ",
      )}`,
    );
  }
}
