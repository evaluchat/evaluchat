# Evaluchat Canvas

[![CI](https://github.com/evaluchat/canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/evaluchat/canvas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**AI-native Markdown document workspace.** Write, edit, and iterate on documents
side-by-side with an AI assistant — with live rendered preview, rich formatting,
LaTeX and Mermaid support, and AI edits you review and approve inline.

Evaluchat Canvas is an independent, open-source continuation of
[LangChain Open Canvas](https://github.com/langchain-ai/open-canvas) (MIT). We're
grateful for the original project — see [Acknowledgments](#acknowledgments).

Try the hosted version at [evaluchat.com](https://evaluchat.com), or run it yourself
(local or self-hosted — see [Setup locally](#setup-locally)).

## Features

- **Live markdown editing & rendering** — see the rendered document while you edit, no toggling
- **Rich formatting toolbar** — bold, italic, lists, quotes, code blocks and more
- **LaTeX equations & Mermaid diagrams** — rendered inline, in markdown and code artifacts
- **AI track changes** — the assistant proposes edits; you approve or reject them inline
- **Artifact versioning** — every artifact carries a version history; travel back in time
- **Built-in memory** — a reflection agent remembers style rules and facts about you across sessions
- **Custom & pre-built quick actions** — one-click prompts for common writing and coding tasks
- **Code, Markdown, or both** — switch between code and markdown artifacts in the same session
- **Printer-friendly export / PDF** — clean output styling for print and PDF

## Repo layout

| Path              | What it is                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/web`        | Next.js web app (UI + API routes) — `@opencanvas/web`                           |
| `apps/agents`     | LangGraph agent graphs (generation, reflection, routing) — `@opencanvas/agents` |
| `packages/shared` | Shared types and utilities — `@opencanvas/shared`                               |

## Setup locally

Prerequisites: **Node 22** and **Yarn 1.22** (corepack: `corepack enable`).

```bash
git clone https://github.com/evaluchat/canvas.git
cd canvas
yarn install
```

### 1. Environment

- **Root `.env`** — used by the agents (LangGraph). Copy `.env.example` → `.env` and add
  at least one model provider key (OpenAI, Anthropic, Google, Fireworks, or Groq).
- **`apps/web/.env`** — used by the web app. Copy `apps/web/.env.example` →
  `apps/web/.env`, set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (create a free Supabase project — it provides auth and persistence), and optionally
  `GROQ_API_KEY` (audio transcription) and `FIRECRAWL_API_KEY` (URL scraping).

### 2. Run

Terminal 1 — agents (LangGraph dev server on port 54367):

```bash
yarn workspace @opencanvas/agents dev
```

Terminal 2 — web app (Next.js dev server):

```bash
yarn workspace @opencanvas/web dev
```

Open http://localhost:3000.

## Checks

```bash
yarn format:check   # prettier
yarn lint           # eslint
yarn build          # turbo build (all workspaces)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — setup, conventions, and the PR checklist.
External contributions are welcome; this is a small project, so please open an issue
before large changes.

## Related surfaces

Evaluchat Canvas is one of Evaluchat's open surfaces. The same document workspace
also powers:

- **Evaluchat Essays** — AI-assisted essay workflows for education
- **Evaluchat Research** — public research on AI in education and assessment

## Acknowledgments

Evaluchat Canvas is derived from and inspired by
[LangChain Open Canvas](https://github.com/langchain-ai/open-canvas), licensed under
the MIT License. The original copyright notice and license text are preserved in
[LICENSE-LANGCHAIN](LICENSE-LANGCHAIN). We extend our appreciation to the LangChain
team and open-source contributors for the initial structural concept of canvas-based
AI interaction.

## License

MIT — see [LICENSE](LICENSE). Upstream attribution: [LICENSE-LANGCHAIN](LICENSE-LANGCHAIN).
