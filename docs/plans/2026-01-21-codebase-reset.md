# Codebase Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all existing application code, keeping only infrastructure and documentation.

**Architecture:** After reset, the repo will contain infrastructure (Terraform, CI/CD), documentation, and root configs only. Application code will be rebuilt separately.

**Tech Stack:** N/A (removal only)

---

## What We Keep

| Directory | Reason |
|-----------|--------|
| `/infrastructure/` | Terraform, Lambda, scripts (already MikroORM-ready) |
| `/docs/` | All documentation including new designs |
| `/.github/workflows/` | CI/CD pipelines (already updated for MikroORM) |
| `/scripts/` | Helper scripts |
| Root configs | package.json, tsconfig.json, .gitignore, docker-compose.yml, Dockerfile, etc. |

## What We Remove

| Directory | Reason |
|-----------|--------|
| `/apps/api/` | Old Prisma-based API |
| `/apps/dpp-worker/` | Old worker implementation |
| `/packages/db/` | Old Prisma schema and client |
| `/packages/shared/` | Old shared types |
| `/packages/walt-id/` | Old walt-id integration |

---

### Task 1: Remove Old Application Code

**Files:**
- Delete: `apps/api/` (entire directory)
- Delete: `apps/dpp-worker/` (entire directory)
- Delete: `packages/db/` (entire directory)
- Delete: `packages/shared/` (entire directory)
- Delete: `packages/walt-id/` (entire directory)

**Step 1: Remove directories**

```bash
rm -rf apps/api apps/dpp-worker packages/db packages/shared packages/walt-id
```

**Step 2: Verify removal**

```bash
ls apps/
ls packages/
```

Expected: Both directories empty or don't exist

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old Prisma-based application code

Removed:
- apps/api (old Prisma-based API)
- apps/dpp-worker (old worker)
- packages/db (old Prisma schema)
- packages/shared (old shared types)
- packages/walt-id (old walt-id integration)

Kept:
- infrastructure/ (Terraform, Lambda, CI/CD)
- docs/ (all documentation)
- .github/workflows/ (already MikroORM-ready)
- scripts/ (helper scripts)
- Root configs

Ready for MikroORM rebuild per docs/plans/ designs."
```

---

### Task 2: Update Root package.json

**Files:**
- Modify: `package.json`

**Step 1: Remove Prisma-specific scripts, update for clean state**

Update the scripts section to remove references to packages that no longer exist:

```json
{
  "name": "eurocomply",
  "version": "0.1.0",
  "private": true,
  "description": "EuroComply DPP Compliance Platform",
  "scripts": {
    "dev": "echo 'No apps to run yet'",
    "build": "echo 'No packages to build yet'",
    "test": "echo 'No tests yet'",
    "lint": "echo 'No code to lint yet'",
    "typecheck": "echo 'No code to typecheck yet'",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "clean": "rm -rf node_modules"
  },
  "packageManager": "pnpm@10.28.0",
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Remove pnpm-lock.yaml (will regenerate)**

```bash
rm -f pnpm-lock.yaml
```

**Step 3: Reinstall minimal dependencies**

```bash
pnpm install
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: update root package.json for clean slate"
```

---

### Task 3: Verify Clean State

**Step 1: Check directory structure**

```bash
find . -type d -name "node_modules" -prune -o -type d -print | grep -v ".git" | head -30
```

Expected output should show only:
- `.github/`
- `docs/`
- `infrastructure/`
- `scripts/`

**Step 2: Verify git status is clean**

```bash
git status
```

Expected: "nothing to commit, working tree clean"

---

## Summary

After completing this plan:

| What | Status |
|------|--------|
| `/apps/` | Empty |
| `/packages/` | Empty |
| `/infrastructure/` | Unchanged |
| `/docs/` | Unchanged |
| `/.github/workflows/` | Unchanged |
| `/scripts/` | Unchanged |

**Next:** Create new implementation plan for MikroORM packages and apps.
