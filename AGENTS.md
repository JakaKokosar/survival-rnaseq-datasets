# Agent instructions

- This project uses **pnpm** for all dependency management and script execution. Do not use `npm`, `yarn`, or `bun` for any purpose.
- Don't run any dev servers unless explicitly asked to do so.
- Don't do any browser check unless explicitly asked to do so.

## Dataset artifacts

- The webapp consumes committed JSON from `datasets/publish/metadata/` and local
  downloads from `datasets/publish/downloads/`. Do not create copies in
  `apps/web/src/` or a separate development-download directory.
- Use `pnpm data:assemble` when canonical per-GSE outputs already exist.
- When canonical outputs must be regenerated, run each bulk notebook stage
  separately and review its failure summary before continuing.
- Treat a new GSE as a separate onboarding workflow. The bulk stages only run
  notebooks already present in registered GSE workspaces and do not replace
  study-specific preparation, metadata mapping, curation, or review.
- Preserve the canonical stage order documented in `datasets/docs/workflows.md`.
