# Agent instructions

## Cross-cutting rules

- Use **pnpm** only. Do not use `npm`, `yarn`, or `bun`.
- Do not run dev servers or browser checks unless explicitly asked.
- The webapp reads `datasets/publish/metadata/` and `datasets/publish/downloads/`. Do not duplicate those under `apps/web/`.

## Where to look

| Task | Start here |
|------|------------|
| Web app (Astro/Svelte) | [apps/web/README.md](apps/web/README.md) |
| Deploy site or downloads | [apps/web/docs/deploy.md](apps/web/docs/deploy.md) |
| Data pipeline, GSE workspaces, assembly | [datasets/README.md](datasets/README.md) |
| Rebuild order, bulk stages, new GSE | [datasets/docs/workflows.md](datasets/docs/workflows.md) |
| Dataset agent guidance | [datasets/AGENTS.md](datasets/AGENTS.md) |

## Quick reminders

- Use `pnpm data:assemble` when canonical per-GSE outputs already exist.
- Regenerate outputs by running bulk notebook stages separately (review failures after each), then assemble.
- A new GSE is a separate onboarding workflow — not covered by bulk stages alone.
