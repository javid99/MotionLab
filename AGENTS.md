
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
- Completed backlog tasks end with a verified, task-scoped commit per the
  workflow below. Never push without explicit authorization.
- Do not access secrets or external services unless necessary and authorized.

## Git Commit Workflow (mandatory)

Every completed backlog task ends with a verified, task-scoped commit:

1. Finish the task within its explicitly authorized scope.
2. Run the applicable verification commands documented in `docs/TESTING.md`
   ("Pre-Commit Verification and Git Review").
3. Fix task-related failures and rerun the relevant checks.
4. Inspect `git status` and the complete task diff.
5. Confirm that no unrelated files, generated artifacts, secrets, or
   pre-existing user changes will be included.
6. Stage only the files belonging to the completed task
   (`git add <file>...`); never `git add .` or `git add -A` blindly.
7. Create exactly one task-scoped commit using the Conventional Commits
   format below.
8. Report the commit hash, commit message, files included, and verification
   results.

A task must not be reported as fully completed until the commit has been
created successfully, unless committing is blocked by an explicit safety
concern or repository limitation. In that case, report the blocker and do
not claim that the commit exists.

### Commit message format

`<type>(<scope>): <imperative description>`

Supported types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`,
`build`, `ci`.

- Choose the type by the task's primary purpose; do not force `feat` for
  every task.
- Use a concise, meaningful scope; lowercase imperative description; no
  trailing period.
- One commit per completed task by default. If a task genuinely requires
  multiple independently meaningful commits, explain why before deviating.

Examples:

- `feat(coords): add canvas coordinate conversion`
- `fix(editor): reject non-finite frame rates`
- `test(coords): cover coordinate round trips`
- `docs(workflow): define commit conventions`

### Git safety rules

- Local commits only. Never run `git push`, force-push, reset, clean, or
  any destructive history-rewriting command unless explicitly authorized.
- Never amend an existing commit unless explicitly authorized.
- Never bypass Git hooks or verification checks to force a commit through.
- Do not change branches unless explicitly authorized.
- Never include unrelated or pre-existing user changes in a task commit.
- Do not commit secrets, credentials, `.env` files, local machine
  configuration, or unintended generated files.
- If pre-existing working-tree changes cannot be safely separated from the
  task, stop before committing and explain the situation.

## Completion Report
Report:
1. What changed.
2. Files modified.
3. Tests and commands executed.
4. Failures or checks not run.
5. Known limitations and follow-up tasks.
