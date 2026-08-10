# AGENTS.md — Evaluchat Canvas

Guidance for AI coding agents (and humans) working in this repository.

## What this is

Evaluchat Canvas is an open-source, AI-native Markdown document workspace — an
independent continuation of LangChain Open Canvas (MIT). See [README.md](README.md)
for the product story and setup, [CONTRIBUTING.md](CONTRIBUTING.md) for the
contribution workflow.

## Repo layout

| Path | Package | What it is |
|---|---|---|
| `apps/web` | `@opencanvas/web` | Next.js web app: UI + API routes |
| `apps/agents` | `@opencanvas/agents` | LangGraph agent graphs (generation, reflection, routing) |
| `apps/desktop` | `@opencanvas/desktop` | Electron desktop app (in development) |
| `packages/shared` | `@opencanvas/shared` | Shared types, constants, utilities |
| `packages/evals` | `@opencanvas/evals` | Evaluation harness |

## Quick start

```bash
yarn install
cp .env.example .env                       # root: model provider keys (agents)
cp apps/web/.env.example apps/web/.env     # web: Supabase keys + feature flags
```

Run (two terminals):

```bash
yarn workspace @opencanvas/agents dev      # LangGraph dev server, port 54367
yarn workspace @opencanvas/web dev         # Next.js dev server
```

## Checks

```bash
yarn format:check   # prettier
yarn lint           # eslint
yarn build          # turbo build
```

Unit tests: `cd apps/agents && npx vitest run` and `cd packages/shared && npx vitest run`.

## Conventions

- TypeScript strict; relative imports in `packages/shared` MUST use `.js` extensions.
- One logical change per commit; conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Don't reformat unrelated files — prettier debt in untouched files is documented, not fixed opportunistically.

## Out of scope

Evaluchat's education-specific surfaces (Essays workflows, teacher analytics,
research instrumentation) are closed-source and live in a private repository.
This public repo contains only the generic canvas product. If a task requires
those surfaces, stop and say so — do not rebuild them here.
