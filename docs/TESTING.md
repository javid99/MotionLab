# MotionLab — Testing Strategy

## Stack

- **Vitest** — unit + integration tests (`jsdom` environment).
- **React Testing Library** — component behavior tests.
- **@testing-library/jest-dom** — DOM matchers, loaded via `vitest.setup.ts`.
- **Playwright** — e2e (deferred; see DECISIONS.md ADR-005).

## Configuration

- `vitest.config.ts` — jsdom, React plugin, `@` alias → `./src`,
  test glob: `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}`.
- `vitest.setup.ts` — jest-dom matchers.
- `tests/smoke.test.ts` — sanity test proving the harness runs.

## Scripts

| Command | Purpose |
|---|---|
| `npm run test` | run all tests once |
| `npm run test:watch` | watch mode |
| `npm run test:coverage` | coverage report |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | production build (run before milestones) |

## Test Placement Rules

| Code | Test type | Location |
|---|---|---|
| `src/engine/*` | unit, Node-fast, exhaustive | colocated `*.test.ts` |
| `src/project/*` | unit incl. validation/round-trip | colocated |
| `src/export/*` | unit: snapshot CSS output | colocated |
| `src/lib/coords.ts` | unit: conversions round-trip | colocated |
| `src/editor/playback.ts` | unit with mocked rAF + injected timestamps | colocated |
| `src/persistence/*` | integration with fake-indexeddb | colocated |
| React components | RTL behavior tests | colocated `*.test.tsx` |
| Cross-cutting flows | integration | `tests/` |
| Full user journeys | e2e (later) | `e2e/` (Playwright) |

## Conventions

- Every new behavior and bug fix ships with a test.
- The engine test suite must run without jsdom-only APIs where possible.
- Never weaken a test to make a change pass; if a test encodes outdated
  behavior, change the test deliberately and say so in the PR/report.
- A command is "passing" only if it was executed and exited 0.

## Determinism

- Engine tests (`src/engine/*`) must be fully deterministic: pure inputs,
  fixed expected values, no clock access, no randomness, no real timers.
- Interpolation/easing tests assert exact expected numeric values
  (boundaries `u = 0/1`, documented midpoints) — never "sanity range" checks.
- Evaluator tests use fixture projects with hand-computed golden values,
  including hold semantics before the first and after the last keyframe and
  clamping outside `[0, durationMs]`.
- Playback tests never rely on real `requestAnimationFrame` timing: the
  controller is driven with a mocked injected `FrameScheduler` and injected
  timestamps, so frame advancement and wrap-at-end behavior are asserted
  exactly.
- Project store write-freedom during playback is asserted with a store spy
  (zero writes across synthetic frames).

## Functional Correctness vs Performance

- **CI-testable functional criteria** (must pass in `npm test`): all
  behavior, contracts, and edge cases — including "no project store writes
  during playback" via a spy.
- **Performance targets are manual measurements, not automated assertions.**
  FPS and profiling goals (e.g., BACKLOG.md T20) are recorded as evidence in
  a PR because they are environment-dependent and flaky in CI. Automated
  tests must not assert timing or fps values.

## Not Yet Configured

- Coverage thresholds (add once there is meaningful source to cover).
- fake-indexeddb for persistence tests (added with the persistence task).
- Playwright (ADR-005).
