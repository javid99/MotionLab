
# MotionLab Agent Rules

## Before Working
- Read this file and the relevant project documentation.
- Inspect the existing implementation before editing.
- Identify the task's acceptance criteria and dependencies.
- Do not assume APIs, files, or behavior exist without verification.

## Scope Control
- Implement only the requested task.
- Avoid unrelated refactoring.
- Do not add dependencies without approval.
- Ask before changing established public interfaces.
- If a task requires an architectural decision, propose options first.

## Architecture
- Keep the animation engine independent of React.
- Separate persistent project state from transient editor state.
- Do not update the project store on every animation frame.
- Keep coordinate conversion in a dedicated module.
- Validate imported project data at runtime.
- Use strict TypeScript and avoid `any`.

## Quality
- Add tests for new behavior and regressions.
- Run relevant tests, lint, typecheck, and build when appropriate.
- Never claim a command passed unless it was executed successfully.
- Never hide failures by weakening tests or disabling checks.

## Git and Safety
- Do not discard user changes.
- Do not reset, rebase, or rewrite Git history without approval.
- Do not commit or push unless explicitly requested.
- Do not access secrets or external services unless necessary and authorized.

## Completion Report
Report:
1. What changed.
2. Files modified.
3. Tests and commands executed.
4. Failures or checks not run.
5. Known limitations and follow-up tasks.
