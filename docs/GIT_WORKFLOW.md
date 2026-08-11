# Git Workflow

A lightweight Git-Flow. Two long-lived branches, short-lived feature branches.

## Branches

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | **Production.** Only ever receives tested, release-ready code (merged from `develop`). | Production VPS |
| `develop` | **Integration.** The default working branch; where features land and are tested together. | Staging — see `docs/STAGING.md` (documented, not yet provisioned) |
| `feature/*` | One branch per feature/fix, branched off `develop`. | — |

> `main` is protected in spirit: never commit to it directly. Everything reaches
> `main` only by merging `develop` once it's verified.

## Day-to-day

Start a feature (always from an up-to-date `develop`):
```bash
git checkout develop
git pull origin develop
git checkout -b feature/short-description
```

Work, committing in small logical chunks:
```bash
git add -p
git commit -m "feat(scope): what changed"
```

Publish and open a PR **into `develop`**:
```bash
git push -u origin feature/short-description
# open a Pull Request: base = develop, compare = feature/short-description
```

After review/CI pass, merge the PR into `develop`, then delete the feature branch.

## Releasing to production

When `develop` is verified — every box in `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md`
checked on staging (`docs/STAGING.md`; see also `PRODUCTION_ROADMAP.md` §4):
```bash
git checkout main
git pull origin main
git merge --no-ff develop
git tag -a v1.x.0 -m "release: v1.x.0"
git push origin main --tags
```
Then deploy `main` on the server (`docs/SERVER_SETUP.md` §12), and run the
automated post-deploy check (`scripts/smoke-test.mjs` / `.github/workflows/smoke.yml`)
against the freshly deployed instance.

## Commit message convention

`type(scope): summary` — types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
Examples: `feat(scheduling): warn on consecutive-rest violation`,
`fix(auth): store token in localStorage`, `docs: server setup guide`.

## Rules of thumb
- Never commit `.env` (only `.env.example`). Never commit `prisma/dev.db`.
- One feature = one branch = one PR. Keep them small.
- Rebase or merge `develop` into your feature branch if it drifts, before opening the PR.
