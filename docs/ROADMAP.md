# MotionLab — Roadmap

Incremental, test-driven delivery. Each milestone ends with green
`npm run typecheck`, `npm run lint`, and `npm test`.

## M1 — Foundations (current)

- Repository bootstrap: docs, testing config, backlog. ✅ (this change)
- `src/project/model.ts` + factories + `src/lib/id.ts`.
- Project store (Zustand) holding the current `Project`.
- App shell layout (empty editor page, dark canvas placeholder).

## M2 — Canvas & Elements

- SVG `SceneRenderer` that renders a `Project` read-only.
- Coordinate conversion module (`src/lib/coords.ts`) with unit tests.
- Create/select/move/resize elements; toolbar + properties panel.
- Project store mutations for element CRUD; canvas persistence wiring.

## M3 — Animation Engine

- Easing + interpolation (`src/engine/interpolation.ts`).
- Timeline utilities (`src/engine/timeline.ts`).
- Evaluator: `evaluate(project, timeMs) → EvaluatedScene`
  (`src/engine/evaluator.ts`).
- Keyframe model wiring: add/remove/update keyframes from UI later; engine
  lands first with a thorough unit suite.

## M4 — Playback & Timeline UI

- rAF playback controller with injected host + scheduler (transient state
  only — no project writes per frame; contract in ARCHITECTURE.md).
- Play/pause/stop/scrub controls bound to playhead state (looping transport
  per ADR-009, accepted).
- Timeline panel: tracks per element/property, draggable keyframes, time ruler.

## M5 — Persistence

- IndexedDB repository (`src/persistence/projectRepository.ts`).
- Runtime validation on load (`src/project/validate.ts`).
- Project list screen: open/rename/duplicate/delete.

## M6 — CSS Export

- `src/export/cssExporter.ts` (pure TS) — `Project → @keyframes CSS` with
  per-element property groups (transform group + opacity group; contract
  approved in DECISIONS.md ADR-008).
- Export dialog + download.
- Property-value equivalence checks at sampled times (intermediate samples
  per ADR-008): emitted keyframe interpolation must match
  `evaluate(project, t)`; percentage rounding and collision rules per
  ADR-008. Pixel-perfect rendering is not claimed.

## M7 — Polish & Hardening (post-v1)

- Undo/redo on project snapshots — **deferred beyond v1** (ADR-010).
- Import/export project JSON (with validation).
- Playwright e2e smoke suite (create → animate → save → reload → verify).
- Performance pass: profile long timelines, virtualize timeline if needed
  (manual measurement; see BACKLOG.md T20).
