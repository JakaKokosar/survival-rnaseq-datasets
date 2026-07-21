# Deploy to Caddy

Copy local files to the server over SSH. Existing remote files with the same name are overwritten.

Production serves the built Astro site at the site root and published CSVs at `/downloads/` on the same origin.

## Setup (user only)

The user creates and maintains `apps/web/.env.deploy` (from `apps/web/.env.deploy.example`).
Agents must not create, edit, or read the contents of that file.

If `.env.deploy` is missing, tell the user to set it up and stop.

Configure SSH access separately (e.g. `ssh-agent`, `~/.ssh/config`, or `ssh-copy-id`).
Deploy commands assume `scp` can reach the server without extra flags.

GitHub Actions uses repository Secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_SITE_PATH`, optional `DEPLOY_PORT`).

## Deploy

Load credentials from the monorepo root, then run `scp`:

```bash
set -a && source apps/web/.env.deploy && set +a
```

**Site** (build first):

```bash
pnpm build
scp -P "${DEPLOY_PORT:-22}" -r apps/web/dist/* \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_SITE_PATH}"
```

**Downloads**:

```bash
scp -P "${DEPLOY_PORT:-22}" -r datasets/publish/downloads/* \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DOWNLOADS_PATH}"
```

Run `pnpm data:assemble` before uploading downloads so the published catalog matches the files on disk.
