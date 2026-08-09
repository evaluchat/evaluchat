# Evaluchat Canvas Desktop — Progress Log

Branch `feat/electron-desktop` · Plan: `PLAN.md` · Runbook: `RUNBOOK.md`

## Status

| Phase | Task | State | Shipped (sha) | Verified |
|-------|------|-------|---------------|----------|
| 0 | T0.1 Scaffold apps/desktop | done (2026-08-08, iter 1) | dd90d2a | typecheck/test/build/smoke `SMOKE_OK`/format all exit 0 |
| 0 | T0.2 Shell/menu/IPC | in progress (2026-08-09, iter 2) | | |
| 0 | T0.3 File plumbing | pending | | |
| 0 | T0.4 Autosave + first-run | pending | | |
| 1 | T1.1–T1.6 Canvas extraction (AI off) | pending | | |
| 2 | T2.1–T2.5 BYOK AI | pending | | |
| 3 | T3.1–T3.3 Packaging/releases | pending | | |
| 4 | T4.1–T4.3 OSS identity | pending | | |

## Log

### 2026-08-08 — iter 1 (T0.1 scaffold) ✅
- Branch `feat/electron-desktop` created from `origin/main` (841159b).
- Plan/progress/runbook committed (0d1474a).
- Cursor Agent scaffolded `apps/desktop`: electron-vite + React + TS strict, electron-builder (win NSIS/portable, linux AppImage/deb, mac dmg config), vitest (`isSmokeTest`), `--smoke-test` launch flag, CI `desktop` job (ubuntu: typecheck→test→build→package:linux --dir), electron pinned 33.4.11 (hoisting fix).
- Verified (real output): typecheck 0 · test 1 passed · build 0 (out/main+preload+renderer) · smoke `SMOKE_OK` exit 0 · desktop format:check 0. Repo-wide `format:check` exit 1 = pre-existing apps/web prettier failures, untouched.
- Shipped: dd90d2a (pushed).
- Next: T0.2 native shell (menu, single-instance already in scaffold — extend: window-state persistence, IPC skeleton).
