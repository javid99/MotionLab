# MotionLab — Architectural Decision Records

Status legend: PROPOSED (needs owner approval) · ACCEPTED · DEFERRED ·
SUPERSEDED.

## ADR-001 — Animation engine is pure TypeScript, no React

- **Status:** ACCEPTED (per project constraints).
- **Decision:** `src/engine/*` contains no React, DOM, or store imports. It
  exposes pure functions; React integration happens in `render/` and
  `editor/`.
- **Rationale:** testability in Node without jsdom, portability, and a clean
  playback loop that never re-renders the store.

## ADR-002 — Two stores: `projectStore` (persistent) vs `editorStore` (transient)

- **Status:** ACCEPTED (per project constraints).
- **Decision:** Zustand slices are split by persistence, not by feature.
  The playhead during playback is transient; keyframe edits are project
  mutations.
- **Consequence:** playback never triggers project persistence or subscription
  churn on the project document.

## ADR-003 — SVG as the v1 renderer

- **Status:** ACCEPTED (per initial stack).
- **Decision:** Scene is rendered as SVG. Canvas2D/WebGL can be introduced
  later behind `SceneRenderer` without touching the engine.
- **Consequence:** DOM-based hit testing and CSS export map naturally to SVG
  element properties.

## ADR-004 — Hand-written runtime validation instead of a schema library (v1)

- **Status:** ACCEPTED — Option 1 (hand-written type guards, zero deps).
  Owner approval, 2026-10-12.
- **Options:**
  1. Hand-written type guards in `src/project/validate.ts` (zero deps).
  2. Zod schemas with inferred types (one dependency).
  3. Compile-time only, no runtime validation — rejected: violates
     ARCHITECTURE.md Principle 5 and the project constraint to validate
     imported data at runtime.
- **Review (2026-10-12):** the model currently has ~12 types (discriminated
  `SceneElement` union, `Transform`, `Keyframe`, `Project`,
  `EvaluatedScene`, …), below the revisit threshold. The validation surface
  is narrow: IndexedDB loads (T13) and JSON import (T18, post-v1), with
  concrete rejection cases already fixed in T13's ACs. Hand-written guards
  give the required descriptive errors with no dependency; the drift risk
  is bounded by round-trip and malformed-input tests. Zod would add a
  runtime dependency and either duplicate the type definitions or couple
  the persisted format to a library. If the choice ever changes, it is
  localized to `src/project/validate.ts` (stores and engine never import
  it), so switching later is cheap.
- **Recommendation:** Option 1 for v1 (small model, avoids a dependency);
  revisit if the model grows past ~15 types or import/export JSON ships.

## ADR-005 — Playwright: config now, browsers/tests later

- **Status:** ACCEPTED — defer option chosen. Owner approval, 2026-10-12.
- **Decision:** defer `@playwright/test` installation and the e2e skeleton
  to M7/e2e backlog item (T19). Unit coverage (Vitest + RTL) is sufficient
  until the full editor flow exists; installing browser binaries now adds
  setup weight with nothing to test.

## ADR-006 — IDs are string UUIDs generated client-side

- **Status:** ACCEPTED.
- **Decision:** `crypto.randomUUID()` (fallback generator in `src/lib/id.ts`
  for old runtimes). No server, so client-generated ids are safe.

## ADR-007 — Time is milliseconds end-to-end

- **Status:** ACCEPTED.
- **Decision:** All model, engine, timeline, and export code uses integer
  milliseconds (`timeMs`, `durationMs`). The UI may present seconds/frames but
  converts at the boundary.

## ADR-008 — CSS export contract (per-element property groups, per-segment easing)

- **Status:** ACCEPTED (owner approval, 2026-10-12, incl. the text layout
  constants below).
- **Chosen approach: per-element property groups.** A single animation per
  element cannot express independent keyframe times and easings for multiple
  properties (one keyframe block carries one `animation-timing-function`),
  and the five transform properties cannot be separate animations (each
  would declare `transform`; with multiple animations on one element, the
  last one wins). Properties are therefore partitioned into groups:
  - **Transform group** — `x`, `y`, `rotation`, `scaleX`, `scaleY` → one
    `@keyframes` rule animating the single `transform` property.
  - **Opacity group** — `opacity` → its own `@keyframes` rule. As a separate
    animation, its keyframe times and easings are fully independent of the
    transform group.
  - The element style rule carries a comma-separated `animation` list, one
    entry per non-empty group, all sharing `durationMs` duration, `0ms`
    delay, iteration count `1`, `animation-fill-mode: forwards`.
    Rule naming: `mlab-<elementId>-transform`, `mlab-<elementId>-opacity`.
  - Elements with no animated properties get no `@keyframes` and no
    `animation` declarations.
- **Independent keyframe times within a group:** each property is declared
  only at its own authored keyframe percentages plus the generated
  `0%`/`100%` endpoints. CSS interpolates a property between the keyframes
  that declare it, so no union-of-boundaries fill is required and
  per-property timing is preserved exactly.
- **Per-segment easing:** all four v1 easings are standard CSS timing
  functions; `animation-timing-function` inside a keyframe block applies to
  the segment starting at that block (CSS pairs each property with the
  blocks that declare it), matching our keyframe model.
- **Easing conflicts within the transform group:** if two transform
  properties start segments at the same `timeMs` with different easings, one
  merged block cannot carry both timing functions. Resolution: the property
  first in alphabetical order keeps the block at `timeMs`; the other is also
  declared at `timeMs` (pinning its value exactly) and its next segment
  start is offset by the smallest time step that yields a distinct
  percentage (`δ ≤ durationMs × 10⁻⁶`, clamped to half the gap to that
  property's next keyframe). Effect: a bounded timing phase-shift of ≤ δ on
  that one segment; values at authored keyframe times remain exact. The
  opacity group cannot collide (single property).
- **Endpoint merging:** generated `0%`/`100%` blocks are always emitted per
  group with values from `evaluate(project, 0)` and
  `evaluate(project, durationMs)`. An authored keyframe at `0` or
  `durationMs` yields the identical value by evaluator definition; the
  emitted block then carries the authored keyframe's easing. Exactly one
  block is emitted per percentage per group — authored endpoints replace
  (never duplicate) generated ones.
- **Percentage precision:** for each keyframe,
  `pct = timeMs / durationMs × 100`, emitted with **at most 6 decimal
  places and trailing zeros trimmed** (e.g. `25%`, `33.333333%`). For any
  project duration ≤ 1 hour, rounding introduces a time error < 0.02 ms.
- **Percentage collisions:** two distinct `timeMs` values of the same
  property that round to the same percentage string (only possible in
  pathological durations) are **merged deterministically**: one block is
  emitted using the keyframe with the **greater `timeMs`** (later keyframe
  wins, mirroring CSS duplicate-selector behavior). A dedicated test covers
  merging.
- **SVG transform origin (precise; corrected 2026-10-15):** CSS transform
  origin for SVG elements resolves against the reference box chosen by
  `transform-box`. The exporter sets `transform-box: view-box` and
  `transform-origin: <width/2>px <height/2>px` — the element's **local**
  center in view-box user units, derived from static geometry (rect:
  `width/2`, `height/2`; ellipse: `rx`, `ry`; text: half the deterministic
  text box), provided by `getCssTransformOrigin` in
  `src/lib/elementTransform.ts`.
  **Correction rationale:** the previously documented absolute-center origin
  (`x + width/2`, `y + height/2`) is not matrix-equivalent to the renderer
  when the translation is inside the transform list — CSS applies the list
  as `M = T(origin) · translate(x,y) · rotate · scale · T(-origin)`, so an
  absolute-center origin makes the rotation center drift with the
  translation. With the local-center origin the CSS matrix is exactly the
  renderer matrix: `T(g) · T(x,y) · R · S · T(-g) = T(x + g) · R · S · T(-g)`
  where `g = (width/2, height/2)`. The element's center is still carried to
  `(x + width/2, y + height/2)` (its position under the canonical
  composition is unchanged); only the CSS origin expression was wrong.
  Equivalence is verified by the matrix tests in
  `src/lib/elementTransform.test.ts` (translation, rotation, non-uniform
  scale, combined — at the center and non-center points) and will be
  asserted end-to-end against emitted CSS in T15.
  `view-box` avoids `fill-box`'s dependence on browser-computed bounding
  boxes (font metrics for text). Rotation (degrees, clockwise) and scale
  semantics are identical in CSS and SVG — no axis compensation.
  For text elements, renderer and exporter must share deterministic
  bounding-box constants (no font measurement); the constants are
  implemented in `src/lib/elementTransform.ts` and covered by the shared
  matrix tests.
  **Confirmed v1 text constants (owner-approved, 2026-10-12):** width =
  0.6 × fontSize × character count, height = 1.2 × fontSize, top-left at
  `(x, y)`.
- **v1 property mapping** (all six animatable properties are supported):
  `x`/`y` → `translate(...)`, `rotation` → `rotate(...)`,
  `scaleX`/`scaleY` → `scale(...)`, `opacity` → `opacity`.
- **Not animated in v1** (static; exported as-is on the element rule):
  geometry (`width/height/rx/ry/cornerRadius`), `fill`, text content.
- **Fidelity claim (deliberately modest):** the exporter guarantees
  *property-value equivalence*: the animation defined by the emitted CSS
  must interpolate to the same property values as `evaluate(project, t)`.
  Asserted in tests at `0%`/`100%` **and at intermediate sample times** —
  every segment boundary ±1 ms, every segment midpoint, and a fixed sample
  table per fixture — with tolerance `1e-6` (exact for fixture values chosen
  to avoid binary-fraction issues). Samples inside an easing-conflict offset
  window compare against the exported animation's own interpolation; the
  pinned values at both boundaries of the offset are asserted exactly.
  **Pixel-perfect rendering equivalence is not promised** and not tested.
- **Trade-offs / open points:**
  - The easing-conflict offset trades a ≤ δ timing phase-shift for
    simplicity; full generality (densified segments with sampled easing)
    is rejected for v1 complexity.
  - `transform-box: view-box` assumes the CSS is applied to SVG elements in
    the same viewBox; applying the export to HTML containers is out of
    scope for v1.
  - The text bounding-box constants are an approximation (confirmed for v1);
    if browser-measured text metrics are ever wanted, the deterministic test
    strategy must be revisited.

## ADR-009 — Playback loops; Stop resets to 0

- **Status:** ACCEPTED — Option 1 (looping). Owner approval, 2026-10-12.
- **Options:**
  1. **Looping (recommended):** Play wraps from `durationMs` back to 0 and
     continues until paused/stopped; Stop cancels and resets the playhead
     to 0. Matches motion-design-tool expectations and makes previewing
     seamless.
  2. **Stop at end:** playback halts at `durationMs` with the playhead
     resting on the last frame; Play from the end restarts at 0.
- **Review (2026-10-12):** looping matches the iterative authoring workflow
  (motion tools loop their previews by default) and loses no capability —
  Stop already provides "return to 0 and halt" and Pause provides "freeze."
  It is cheap and deterministic under the injected `FrameScheduler` (wrap
  asserted with synthetic timestamps per T10/TESTING.md). It does not
  couple to export semantics: the exported CSS intentionally uses
  `animation-iteration-count: 1` (ADR-008); the editor preview optimizing
  for authoring is a separate concern. Stop-at-end would add a second
  end-of-preview variant (natural end vs Pause) plus a restart-at-0 rule.
  Neither option affects the controller's injected interfaces, the
  no-project-store-writes rule, or other transport semantics — only the
  wrap branch and two test expectations.
- **Recommendation:** Option 1.

## ADR-010 — Undo/Redo is deferred beyond v1

- **Status:** ACCEPTED — Undo/Redo out of v1 scope. Owner confirmation,
  2026-10-12.
- **Decision:** v1 ships without undo/redo. Backlog T17
  (Milestone 7, marked post-v1) implements snapshot-based history on
  `Project` when prioritized. Nothing in the v1 data model or store design
  precludes adding it later (mutations are already immutable updates).
- **Rationale:** v1 success criteria (PRODUCT.md) do not require it;
  implementing history well (coalescing of drags, bounded memory) is
  significant work better spent on the core editor in v1.
