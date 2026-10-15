# MotionLab — Architecture

## Principles

1. **Animation engine is framework-free.** All timing, interpolation, and
   evaluation logic is pure TypeScript with no React, no DOM, no Zustand
   imports. It is fully unit-testable in Node.
2. **Persistent project state ≠ transient editor state.** The *project
   document* (what gets saved/exported) is a serializable, validated data
   model. The *editor state* (selection, zoom, tool, playback head) lives and
   dies with the UI session and is never persisted.
3. **The project store is not written on animation frames.** Playback mutates
   transient editor/renderer state only. Project mutations happen on explicit
   user actions (add keyframe, move element, etc.).
4. **Coordinate conversion is isolated.** All mapping between screen space,
   canvas space, and scene space lives in one dedicated module
   (`src/lib/coords.ts`). No component does raw math on pointer events.
5. **Imported/loaded data is validated at runtime.** Anything read from
   IndexedDB or a JSON file passes through a validation module before it
   reaches the stores.
6. **Strict TypeScript, no `any`.**

## Directory Layout

```
app/                      # Next.js App Router — thin: pages/layout only
src/
  project/                # PERSISTENT project data model
    model.ts              #   types: Project, SceneElement, Keyframe, ...
    defaults.ts           #   factories for new projects/elements
    validate.ts           #   runtime validation of untrusted project data
  engine/                 # Animation engine (pure TS, no React/DOM/store)
    interpolation.ts      #   numeric/color interpolation, easing functions
    evaluator.ts          #   evaluate scene state at time t
    timeline.ts           #   keyframe sorting, lookup, duration calc
  editor/                 # TRANSIENT editor state (Zustand)
    editorStore.ts        #   selection, tools, zoom, playhead
    projectStore.ts       #   holds current Project document + mutations
    playback.ts           #   PlaybackController: rAF loop (plain TS, no React)
  persistence/            # IndexedDB adapter (async, validated I/O)
    projectRepository.ts
  render/                 # SVG scene renderer (React components, read-only
    SceneRenderer.tsx     #   w.r.t. engine state)
  components/             # Editor UI components (toolbar, timeline, panels)
  export/                 # CSS keyframes exporter (pure TS)
    cssExporter.ts
  lib/
    coords.ts             # screen <-> canvas <-> scene coordinate conversion
    elementTransform.ts   # element geometry/transform composition shared by
                          #   renderer (T5) and CSS exporter (T15)
    id.ts                 # id generation
tests/                    # cross-cutting integration tests
```

Dependency rule: `components → render/editor → engine/project/lib`.
`engine` and `export` depend on **nothing** above them. `persistence`
depends only on `project`. Enforced by convention and reviewed in PRs
(a lint rule can be added later if needed).

## Project Data Model (v1 draft)

```ts
// src/project/model.ts
type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/** Numeric properties the engine can animate. */
type AnimatableProperty = "x" | "y" | "rotation" | "scaleX" | "scaleY" | "opacity";

/** Base (rest) transform; the single source of truth for x/y/rotation/scale. */
interface Transform {
  x: number;
  y: number;
  rotation: number;   // degrees, clockwise
  scaleX: number;
  scaleY: number;
}

interface Keyframe {
  id: string;
  property: AnimatableProperty;
  timeMs: number;     // integer, 0 <= timeMs <= project.durationMs
  value: number;
  // Easing applied to the segment that STARTS at this keyframe
  // (the segment ending at the next keyframe; on the last keyframe it is inert).
  easing: Easing;
}

// Shared fields. transform holds the base values for the animatable transform
// properties; style.opacity is the base value for the `opacity` property.
// There is deliberately no separate `base` record — transform/style ARE the
// base values.
interface ElementBase {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  transform: Transform;
  style: { fill: string; opacity: number };
  keyframes: Keyframe[];
}

interface RectElement extends ElementBase {
  type: "rect";
  width: number;        // static geometry, not animatable in v1
  height: number;
  cornerRadius: number;
}

interface EllipseElement extends ElementBase {
  type: "ellipse";
  rx: number;
  ry: number;
}

interface TextElement extends ElementBase {
  type: "text";
  text: string;         // static content, not animatable in v1
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}

/** Discriminated union — narrow on `type`. */
type SceneElement = RectElement | EllipseElement | TextElement;

interface Project {
  id: string;
  name: string;
  canvas: { width: number; height: number; fps: number };
  durationMs: number;     // integer, > 0
  elements: SceneElement[];
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
}

/** Engine output: fully resolved values; no keyframe logic downstream. */
interface EvaluatedElement {
  id: string;
  type: SceneElement["type"];
  visible: boolean;
  transform: Transform;
  opacity: number;
}

interface EvaluatedScene {
  timeMs: number;
  elements: EvaluatedElement[];
}
```

Rules:

- `Project` is the unit of persistence; it must round-trip through
  `JSON.stringify` and IndexedDB unchanged.
- The engine never mutates a `Project`; it produces `EvaluatedScene`
  snapshots.
- **Base values:** `element.transform` (x, y, rotation, scaleX, scaleY) and
  `element.style.opacity` are the base (rest) values. They are used whenever
  a property has no keyframes. Geometry (`width/height/rx/ry/cornerRadius`)
  and text content are static in v1 and are not animatable.
- **Keyframe invariants:** for a given `(element.id, property)` pair,
  keyframes are kept sorted ascending by `timeMs`; two keyframes of the same
  pair at the same `timeMs` are rejected by validation and by the
  `addKeyframe` store mutation. `timeMs` is an integer.
- Code that consumes elements must narrow the `SceneElement` union on `type`
  (exhaustive switch); no `any` and no unchecked casts.
- **Element anchor convention:** `(transform.x, transform.y)` is the
  top-left of the element's untransformed bounding box (rect and text) or of
  the ellipse's bounding box. Centers used for rotation/scaling derive from
  it — see "Transform composition" below.

## Animation Evaluation & Playback Contract

### Evaluator contract

```ts
// src/engine/evaluator.ts
function evaluate(project: Project, timeMs: number): EvaluatedScene;
```

- **Pure and deterministic:** same inputs always produce the same output; no
  mutation of `project`; no reads of clocks, randomness, or globals; no React,
  DOM, or state-management imports.
- `timeMs` is clamped to `[0, project.durationMs]`.
- Per `(element, property)` evaluation semantics:
  - No keyframes → base value (transform field or `style.opacity`).
  - `t` ≤ first keyframe time → first keyframe's value (hold).
  - `t` ≥ last keyframe time → last keyframe's value (hold).
  - Otherwise, with consecutive keyframes `a`, `b` where
    `a.timeMs ≤ t < b.timeMs`:
    `value = a.value + (b.value − a.value) · easing(a.easing)((t − a.timeMs) / (b.timeMs − a.timeMs))`
    — i.e., the easing stored on a keyframe shapes the 
    
    
    segment that starts at
    that keyframe.
  - These hold semantics intentionally mirror CSS `@keyframes` behavior
    (see ADR-008) so export can be verified against the evaluator.

### Playback loop

- `src/editor/playback.ts` exports a `PlaybackController` — a plain
  TypeScript class with **no React, Zustand, or direct DOM imports**. All
  side effects are injected through two minimal interfaces:

  ```ts
  interface PlaybackHost {
    getPlayhead(): number;
    setPlayhead(timeMs: number): void; // transient playhead only
    getDurationMs(): number;
  }

  interface FrameScheduler {
    now(): number;                               // performance.now()
    schedule(cb: (now: number) => void): number; // requestAnimationFrame
    cancel(handle: number): void;                // cancelAnimationFrame
  }
  ```

  The editor layer provides a thin adapter wiring `PlaybackHost` to
  `editorStore`/`projectStore` and uses the default rAF-based scheduler.
  Tests inject a fully mocked scheduler. No further abstraction (no event
  emitters, no observables) is added.

- Public surface: `play()`, `pause()`, `stop()`, `scrub(timeMs)`,
  `dispose()` — implementing the transport semantics below.
- Each frame: the controller computes `timeMs` from the injected
  `now()` deltas (wrapping at `durationMs` per ADR-009), calls
  `host.setPlayhead(timeMs)`, and does nothing else. **The project store is
  never written during playback**; project mutations happen only on
  committed user actions (add keyframe, move element, …).
- At most one frame is scheduled at any time; `pause()`, `stop()`, and
  `dispose()` cancel the pending frame. `dispose()` is idempotent.
- All timing derives from the injected `FrameScheduler.now()`, so playback
  is fully deterministic under mocked timestamps (see TESTING.md,
  "Determinism").
- The renderer subscribes to playhead + project + selection, calls
  `evaluate` for the new time, and re-renders. The engine never drives
  frames on its own.

### Transport semantics

| Action | Behavior |
|---|---|
| **Play** | Starts (or resumes) the rAF loop from the current playhead. When the playhead reaches `durationMs` it wraps to 0 and playback continues (looping). See ADR-009. |
| **Pause** | Cancels the rAF loop; playhead keeps its current value. |
| **Stop** | Cancels the rAF loop and resets the playhead to 0. |
| **Scrub** | Directly sets the playhead (transient state). Scrubbing pauses active playback; the user resumes with Play. |

The playhead value lives in `editorStore` (transient) and is never persisted.
Unit tests for playback must not depend on real frame timing (see
TESTING.md, "Determinism").

## State Ownership

| State | Where | Persisted? |
|---|---|---|
| Project document | `projectStore` (Zustand) | Yes (IndexedDB) |
| Selection, active tool, zoom, panel layout | `editorStore` (Zustand) | No |
| Playhead time (incl. during playback) | `editorStore` via `PlaybackController` | No |
| Computed frame (element values at t) | engine output, consumed by renderer | No |
| Active transport state (playing/paused) | `editorStore` + `PlaybackController` | No |

Undo/redo is **deferred beyond v1** (DECISIONS.md ADR-010, backlog T17).
When implemented, it will operate on `Project` snapshots, not editor state.

## Rendering Pipeline

```
projectStore (Project) ──▶ engine.evaluator ──▶ EvaluatedScene ──▶ SceneRenderer (SVG)
                              ▲ playhead (editorStore / rAF)        ▲ selection overlay (editorStore)
```

The renderer is a pure function of `Project` + `EvaluatedScene` + selection;
it never computes animation math itself.

### Transform composition (shared by renderer and exporter)

The SVG renderer and the CSS exporter must apply evaluated transforms
identically:

- **Order:** `translate(x, y) → rotate(rotation) → scale(scaleX, scaleY)`
  (CSS form: `transform: translate(...) rotate(...) scale(...)`).
- **Origin:** the element's center in SVG user units, derived from static
  geometry and the element anchor convention (top-left `(x, y)`):
  - rect: `cx = x + width/2`, `cy = y + height/2` (corner radius ignored)
  - ellipse: `cx = x + rx`, `cy = y + ry`
  - text: deterministic layout constants shared by renderer and exporter —
    no font measurement (confirmed v1 constants per ADR-008: width = 0.6 ×
    fontSize × character count, height = 1.2 × fontSize, top-left at
    `(x, y)`).
- **SVG specifics:** for CSS applied to SVG elements, the transform origin
  resolves against the reference box selected by `transform-box`. The
  exporter therefore emits `transform-box: view-box` and
  `transform-origin: <width/2>px <height/2>px` — the element's **local**
  center (via `getCssTransformOrigin` in `src/lib/elementTransform.ts`).
  With the translation inside the CSS transform list, the local-center
  origin makes the CSS matrix exactly equal to the renderer's composed
  matrix; an absolute-center origin would not (corrected 2026-10-15, see
  ADR-008). The renderer composes the matrix itself via
  `composeElementTransform` (same module). Rotation (degrees, clockwise)
  and scale semantics are identical in CSS and SVG; no axis compensation is
  needed.
- A shared consistency test asserts that renderer output and exporter
  output produce the same effective matrix for a fixture element
  (see T5 and T15).

## Storage

- IndexedDB via a thin promise wrapper (no external library).
- One object store `projects`, keyed by `Project.id`.
- All reads pass through `project/validate.ts`; invalid records are surfaced
  as errors, never silently coerced.
