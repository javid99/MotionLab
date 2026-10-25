# MotionLab — Backlog

Prioritized, dependency-ordered tasks. Each task lists acceptance criteria
(AC). Work top-to-bottom within a milestone; milestones are sequential unless
noted. Status: TODO / IN PROGRESS / DONE / BLOCKED.

Pending-decision gates: **none** — all ADRs are accepted (see DECISIONS.md).
T17 remains scoped post-v1 by ADR-010 (Undo/Redo deferred).

## Milestone 1 — Foundations

### T1. Project data model + factories — TODO (P0)
- **Depends on:** —
- Create `src/project/model.ts` (types per ARCHITECTURE.md, incl. the
  `SceneElement` discriminated union and `EvaluatedScene`) and
  `src/project/defaults.ts` (`createProject`, `createElement` per type,
  `createKeyframe`).
- Create `src/lib/id.ts` (UUID via `crypto.randomUUID` with fallback).
- **AC:**
  - Strict types, no `any`; `Project` JSON round-trips via a test.
  - An exhaustive `switch` over element types compiles without a default
    branch (type-level completeness check).
  - Factories generate unique ids and valid defaults
    (`fps > 0`, `durationMs > 0`, integer times).
  - Unit tests colocated and green.

### T2. Project store (Zustand) — TODO (P0)
- **Depends on:** T1. (`zustand` is part of the approved initial stack —
  no additional approval needed.)
- `src/editor/projectStore.ts` holding current `Project` with mutations:
  `setProject`, `updateElement`, `addKeyframe`, `removeKeyframe`, `setCanvas`.
- **AC:** mutations are pure updates (immutability); `addKeyframe` keeps
  keyframes sorted per `(element, property)` and rejects duplicate times
  (per ARCHITECTURE.md keyframe invariants); the engine never imports the
  store; unit tests cover add/update/remove/reject paths.

### T3. App shell layout — TODO (P1)
- **Depends on:** — (static layout only; no store wiring)
- Replace default `app/page.tsx` with an editor shell: canvas area
  placeholder, toolbar strip, right properties panel, bottom timeline strip
  (empty state).
- **AC:** renders without errors; `npm run build` passes; RTL smoke test for
  shell regions; no project logic in components yet.

## Milestone 2 — Canvas & Elements

### T4. Coordinate conversion module — TODO (P0)
- **Depends on:** T1.
- `src/lib/coords.ts`: screen↔canvas↔scene transforms incl. zoom/pan.
- **AC:** round-trip tests (screen → canvas → screen is identity for
  arbitrary zoom/pan); zoom around a focal point tested;
  no pointer math anywhere else in the codebase.

### T5. SVG SceneRenderer — TODO (P0)
- **Depends on:** T1 (model types only — the renderer is prop-driven and
  must not import any store).
- `src/render/SceneRenderer.tsx`: renders `EvaluatedScene` (+ base geometry
  from `Project` for static fields) via props.
- **AC:** RTL test asserts correct SVG nodes/attributes from fixture props;
  renderer contains no store imports and no animation math (evaluation
  happens via the engine before render); element type handled through an
  exhaustive switch; evaluated transforms applied per the canonical
  composition (translate → rotate → scale, about the element's center in
  user units — ARCHITECTURE.md "Transform composition"), with text
  bounding-box constants defined deterministically here (no font
  measurement) and shared with the exporter; verified by a matrix test
  shared with the exporter test (T15).

### T6. Element CRUD + selection — TODO (P0)
- **Depends on:** T2, T3, T4, T5.
- Toolbar actions (add rect/ellipse/text), click-select, drag-move, resize
  handles; properties panel edits name/fill/position.
- **AC:** selection lives in `editorStore`; geometry changes go through
  `projectStore` only on committed interactions; coords math only via
  `src/lib/coords.ts`; RTL + unit tests for store and conversion paths.

## Milestone 3 — Animation Engine

### T7. Easing + interpolation — TODO (P0)
- **Depends on:** T1 (`Easing` type).
- `src/engine/interpolation.ts`: `Easing` functions and numeric interpolation.
- **AC:** deterministic pure functions (no randomness, no clock access);
  easing at u=0 and u=1 returns exactly 0 and 1; midpoint values match the
  documented spec for each easing; exhaustive unit tests.

### T8. Timeline utilities — TODO (P0)
- **Depends on:** T1.
- `src/engine/timeline.ts`: keyframe lookup (surrounding pair), clamp time,
  compute effective duration.
- **AC:** edge cases tested (no keyframes, single keyframe, `t` before first
  and after last keyframe → hold semantics per ARCHITECTURE.md; `t` outside
  `[0, durationMs]` clamped).

### T9. Evaluator — TODO (P0)
- **Depends on:** T1, T7, T8.
- `src/engine/evaluator.ts`: `evaluate(project, timeMs): EvaluatedScene` per
  the contract in ARCHITECTURE.md ("Animation Evaluation & Playback
  Contract").
- **AC:** deterministic; never mutates input; base values used where no
  keyframes exist; hold-before-first and hold-after-last semantics tested;
  per-segment easing tested with golden values; no React/DOM/store imports
  (verified by an import-scan test or lint rule).

## Milestone 4 — Playback & Timeline UI

### T10. Playback controller — TODO (P0)
- **Depends on:** T2 (stores needed only for the host adapter); the playback
  contract in ARCHITECTURE.md. The controller itself needs neither the
  evaluator (T9) nor the renderer (T5) — it only writes the playhead.
  Wrap-at-end behavior per ADR-009 (accepted: looping).
- `src/editor/playback.ts`: `PlaybackController` with injected
  `PlaybackHost` + `FrameScheduler` (per ARCHITECTURE.md); implements
  `play()` / `pause()` / `stop()` / `scrub(timeMs)` / `dispose()`.
- **AC (deterministic):** with a mocked `FrameScheduler` and injected
  timestamps, N synthetic frames advance the playhead by exactly the
  injected elapsed deltas; the module has no direct React/Zustand/DOM
  imports (import-scan test); a spy on the project store records zero
  writes across playback frames; Pause/Stop/Scrub/dispose state transitions
  and wrap-at-end behavior covered by unit tests; at most one frame is
  scheduled at any time, `dispose()` cancels the pending frame exactly once
  and is idempotent.

### T11. Timeline panel — TODO (P1)
- **Depends on:** T6 for the static structure (tracks, ruler, keyframe
  editing); T10 only for the scrubbing/playhead wiring.
- Per-element/property tracks, draggable keyframes, time ruler; scrubbing
  wires the playhead through the `PlaybackController` host.
- **AC:** drag interactions round through coords module; keyframe edits hit
  project store once per committed change; the static structure renders and
  is testable without the playback controller present; scrubbing uses the
  `Scrub` semantics from ARCHITECTURE.md; RTL tests for add/move keyframe
  and for scrub-to-time wiring.

## Milestone 5 — Persistence

### T12. IndexedDB repository — TODO (P0)
- **Depends on:** T1. Test-only dev dependency `fake-indexeddb` (approval
  requested with the task).
- `src/persistence/projectRepository.ts`: put/get/list/delete, promise-based.
- **AC:** integration tests with fake-indexeddb; errors reject (no silent
  failures); no UI imports.

### T13. Runtime validation on load — TODO (P0)
- **Depends on:** T1, T12. Validation approach per ADR-004 (accepted).
- `src/project/validate.ts` + repository integration (approach per ADR-004).
- **AC:** malformed records are rejected with descriptive errors (wrong
  element `type`, non-integer/duplicate keyframe times, missing fields,
  out-of-range `timeMs`); valid fixtures load unchanged; validation covers
  all discriminated-union branches.

### T14. Project list screen — TODO (P1)
- **Depends on:** T12, T13.
- Open/rename/duplicate/delete projects from a landing list.
- **AC:** saved project survives full reload (RTL + integration); deleting
  current project handled gracefully.

## Milestone 6 — CSS Export

### T15. CSS keyframes exporter — TODO (P0)
- **Depends on:** T9 (evaluator), T1 (static geometry for transform-origin
  centers). Contract approved (ADR-008; revised 2026-10-21, owner-approved
  Option A: independently animated registered custom properties per
  component).
- `src/export/cssExporter.ts`: `Project → CSS string` (pure TS) per the
  revised ADR-008 contract (one `@property` + `@keyframes` per animated
  property; opacity native; element rule composes via var()/calc()).
- **AC:**
  - Emitted keyframe percentages follow the ADR-008 rounding rule
    (≤ 6 decimal places, trailing zeros trimmed) and are exact for fixture
    projects.
  - The emitted `0%` and `100%` keyframe values equal `evaluate(project, 0)`
    and `evaluate(project, durationMs)` for every animated property;
    authored keyframes at `0`/`durationMs` merge with generated endpoints
    into exactly one block per percentage per group (ADR-008 endpoint rule).
  - Export/evaluator equivalence is asserted at **intermediate sample
    times** per ADR-008: every segment boundary ±1 ms, every segment
    midpoint, and a fixed sample table per fixture — interpolated export
    values vs `evaluate(project, t)` within `1e-6`; pinned boundary values
    in offset windows asserted exactly.
  - **Multi-property scenarios (required fixtures):**
    - x and opacity animated with different keyframe times and easings →
      two independent per-property animations, each preserving its
      own times/easings exactly.
    - x and y animated with different keyframe times → independent
      per-property animations; foreign keyframe times never split or
      re-time the other property's segments (per-property timing preserved
      exactly).
    - x and y starting segments at the same `timeMs` with different easings
      → each property keeps its own easing in its own rule (structurally
      conflict-free per the revised ADR-008); values at authored keyframe
      times exact; equivalence holds at sampled times.
    - an authored keyframe at `0` (or `durationMs`) on one property while
      others have no endpoints → single merged `0%`/`100%` blocks per
      property with authored easing.
  - Per-segment easing appears as `animation-timing-function` inside the
    matching keyframe block; each animated property has its own
    `@keyframes` rule and `opacity` is a native CSS property animation
    (properties never share a rule).
  - The transform declaration matches the renderer's composition order and
    origin (shared matrix test with T5); exported rules carry
    `transform-box: view-box` and the explicit user-unit
    `transform-origin` per ADR-008.
  - Percentage-collision merging (later keyframe wins) is covered by a
    dedicated test.
  - Properties without keyframes do not appear in the output (base values
    come from the element rule); elements without animated properties get
    no `@keyframes`; snapshot + targeted assertions; no React/DOM/store
    imports.

### T16. Export dialog — TODO (P1)
- **Depends on:** T15.
- UI: preview CSS, copy, download `.css`.
- **AC:** clipboard/download handlers tested in jsdom; export runs
  synchronously on the main thread (no worker) — acceptable because it is a
  pure string build; a fixture with 100+ keyframes exports in a test
  without timeout.

## Milestone 7 — Polish & Hardening (post-v1)

### T17. Undo/redo — TODO (P2) — **deferred beyond v1 (ADR-010)**
- **Depends on:** T2.
- Snapshot-based history on `Project` (bounded stack).
- **AC:** keyboard shortcuts; history excluded from persistence; tests for
  push/undo/redo/coalescing of drags.

### T18. Project JSON import/export — TODO (P2)
- **Depends on:** T13.
- **AC:** import path validates (rejects tampered data with error messages);
  export → import round-trip test (`JSON.stringify` equality).

### T19. Playwright e2e suite — TODO (P2)
- **Depends on:** T14, T16 (ADR-005 accepted: e2e deferred to post-v1).
- **AC:** one journey test: create element → keyframe → play → save →
  reload → verify.

### T20. Performance pass — TODO (P2)
- **Depends on:** T10, T11.
- **Functional AC (CI):** no project store writes during playback (covered
  by T10's spy test); React Profiler trace attached to the PR shows no
  project-document re-renders per frame during playback.
- **Performance target (manual, not a CI gate):** ~60 fps preview with 100+
  animated elements, measured by rAF sampling over a 10 s session on the
  documented reference machine; results recorded in the PR. Performance
  numbers are intentionally not automated assertions (environment-dependent
  and flaky in CI).
