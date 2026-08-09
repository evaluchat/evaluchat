# Evaluchat Canvas Desktop — Progress Log

Branch `feat/electron-desktop` · Plan: `PLAN.md` · Runbook: `RUNBOOK.md`

## Status

| Phase | Task | State | Shipped (sha) | Verified |
|-------|------|-------|---------------|----------|
| 0 | T0.1 Scaffold apps/desktop | done (2026-08-08, iter 1) | dd90d2a | typecheck/test/build/smoke `SMOKE_OK`/format all exit 0 |
| 0 | T0.2 Shell/menu/IPC | done (2026-08-09, iter 2) | cfde9c1 | typecheck 0 · test 9/9 · build 0 · smoke `SMOKE_OK` exit 0 · format:check 0 |
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

### 2026-08-09 — iter 2 (T0.2 shell/menu/IPC) ✅
- Sync: merged `origin/main` (c90e1ec track-changes UI #10) — yarn.lock-only conflict resolved (theirs + yarn install), merge commit 8000901.
- Cursor Agent (cursor-grok-4.5-high; sonnet-4/codex/gpt-5.2 blocked by monthly usage limit) implemented:
  - `src/main/window-state.ts`: `validateWindowState`/`loadWindowState`/`saveWindowState` (atomic tmp+rename, silent fs errors) + `manageWindowState` (debounced 500ms resize/move save, maximize flag, flush on close, `getNormalBounds`), type-only electron import.
  - `src/main/ipc.ts`: `ipcMain.handle("app:ping")`; preload `ping` now `ipcRenderer.invoke` round-trip (was sync stub); `ElectronAPI.ping: () => Promise<string>`; App.tsx renders async result.
  - Menu (File/Edit/View), single-instance lock, CSP already in scaffold — kept as-is.
  - 8 new vitest cases (validate/load/save/atomicity/round-trip).
- Verified (real output): typecheck exit 0 · `Test Files 2 passed (2) / Tests 9 passed (9)` · build exit 0 (out/main 6.07 kB + preload + renderer) · smoke `SMOKE_OK` exit 0 (xvfb) · format:check 0.
- Shipped: cfde9c1 (feat) + ff7d7c4 (docs screenshot) (pushed).
- Next: T0.3 file plumbing — `dialog.showOpenDialog`/`showSaveDialog` + fs in main, IPC `file:open`/`file:save`/`file:read`, recent-files menu list, unsaved-changes guard.
