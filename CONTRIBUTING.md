# Contributing to Evaluchat

Thanks for your interest! Evaluchat is a small, independent open-source
project — a continuation of LangChain Open Canvas. Contributions are welcome.

## Ground rules

- **Open an issue first** for anything non-trivial (new feature, larger refactor,
  behaviour change) so we can agree on the direction before you invest the work.
- Small bug fixes and docs improvements are fine as direct PRs.
- This is a TypeScript monorepo with strict linting and formatting — the CI runs
  `format:check` and `lint` on every PR, so make sure they pass locally.

## Setup

```bash
git clone https://github.com/evaluchat/evaluchat.git
cd evaluchat
yarn install
```

Environment: copy `.env.example` → `.env` (root — model provider keys, loaded by
the LangGraph agents) and `apps/web/.env.example` → `apps/web/.env` (the web app:
Supabase keys for auth/persistence, model feature flags, optional transcription /
URL-scraping keys). See the README for details.

## Development

```bash
# agents (LangGraph dev server, port 54367)
yarn workspace @opencanvas/agents dev

# web app (Next.js dev server)
yarn workspace @opencanvas/web dev
```

## Checks (run before pushing)

```bash
yarn format:check   # prettier — all workspaces
yarn lint           # eslint
yarn build          # turbo build — full compile gate
```

If `format:check` complains, run `yarn format` (prettier auto-fix) on your changed
files only. Don't reformat unrelated files — it pollutes the PR.

## Commit conventions

- One logical change per commit; conventional-commit style prefixes (`feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`) are used in this repo.
- Keep the diff focused. A reviewer (possibly the maintainer a year from now) should
  understand the change without a novel.

## PR checklist

- [ ] `yarn format:check` passes
- [ ] `yarn lint` passes
- [ ] `yarn build` passes
- [ ] New/changed behaviour is covered by a test where practical
- [ ] Description explains what and why, plus how it was tested

## License

By contributing you agree that your contributions are licensed under the MIT License
(see [LICENSE](LICENSE)).
