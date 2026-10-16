# Pawzzle Codex Git Workflow

These instructions apply to the entire repository. A task-specific user instruction takes precedence when it explicitly selects a different safe branch, worktree, or release boundary.

## Protect Existing Work

- Treat `archive/original-work-20261016`, `feature/consolidated-pending-20261016`, and every existing feature/release worktree as preserved work.
- Never delete a branch or worktree without explicit user approval.
- Never use `git reset --hard`, `git clean`, `git stash`, force-push, or checkout/restore over unreviewed changes.
- Before implementation, inspect `git status -sb`, `git status --short`, and `git worktree list`. Preserve any pre-existing changes and report unexpected overlap.
- Do not use the original archive workspace for new implementation unless the user explicitly selects it.

## Default Task Workspace

For each new implementation or bug-fix task, unless the user explicitly selects an existing safe worktree:

1. Fetch `origin` and use the latest `origin/main` as the baseline. Do not update or clean another worktree to obtain that baseline.
2. Create a uniquely named isolated worktree and feature branch, normally under the Windows temporary directory.
3. Use a descriptive branch such as `feature/<task>-<YYYYMMDD>`, `fix/<task>-<YYYYMMDD>`, or `chore/<task>-<YYYYMMDD>`.
4. Keep the task worktree scoped to that task. Selectively integrate shared-file hunks; never copy an entire dirty repository.
5. Read-only investigations may remain in the current safe workspace and do not require a new branch.

## Change and Verification Rules

- Inspect a target file's existing diff before editing it.
- Make the smallest complete change and add focused regression coverage.
- Do not include unrelated Finance, Leave, Returns, Supplier, generated, or experimental work merely because it is present elsewhere.
- Run relevant focused tests, syntax checks, and `git diff --check`. Run the configured production build when the task affects runtime bundles.
- Use isolated synthetic databases for integration or transaction tests. Never point automated tests at production or staging.
- Routine frontend builds must write outside the worktree by setting `BUILD_PATH` to a unique temporary directory. Do not dirty or commit `client/build` during ordinary verification.
- If a required test or build fails, preserve the work in its isolated worktree, do not push it as a verified change, and report the exact failure.

## Automatic Commit, Push, and Pull Request

After the requested implementation is complete and its relevant verification passes, Codex is authorized and expected to:

1. Review the final file list and diff for scope, secrets, generated output, and accidental credentials.
2. Stage only reviewed paths explicitly. Never run `git add .` or blanket-stage an unknown directory.
3. Inspect `git diff --cached --name-status`, `git diff --cached --check`, and the staged diff.
4. Create one or more meaningful commits at validated feature boundaries using clear conventional-style messages.
5. Push the task branch normally to `origin` without rewriting history.
6. Create or update a GitHub pull request targeting `main`, summarizing scope, verification, database requirements, and known limitations.

Do not commit after every edit. Do not commit incomplete or failing work merely to make a worktree clean. If authentication or branch protection blocks a push or pull request, preserve the local branch and report the single required operator action.

## Never Commit

- Secrets, credentials, tokens, private keys, database connection strings, or local `.env` files.
- `node_modules`, coverage output, logs, temporary databases, test evidence, or editor/OS files.
- Generated `client/build` artifacts from routine validation.
- Unrelated changes from another task or worktree.

`client/.env.production` may only be changed when the task explicitly requires its public, non-secret configuration and the diff has been reviewed.

## Release and Production Boundary

- A pushed branch or pull request is not authorization to merge or deploy.
- Never automatically merge into `main`, force-push, deploy, alter production configuration, or run production database migrations/index changes.
- Production mutations require explicit task-specific authorization and the applicable preflight, backup, rollback, and verification gates.
- Report pushed commit SHAs and pull-request URLs accurately; do not claim a release is live without deployment verification.
