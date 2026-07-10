# browser-tools · AGENTS.md

Space-bound project rules for the browser-tools Finch Mini Tool extension.

## Project Overview

- Finch Mini Tool extension wrapping Vercel Labs [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI.
- Published as `@joehe71/browser-tools` on npm.
- Tech stack: TypeScript (ES2022/ESNext), `@finch.app/minitool-api`, Node `child_process`.

## Workflow

1. **Read before editing.** For upstream CLI changes, check the agent-browser README first.
2. **Build after edits.** After changing `src/`, run `npm run build` to confirm TypeScript compiles.
3. **Conventional Commits.** Use `feat:`, `fix:`, `chore:`, `docs:` prefixes so Release Please can generate `CHANGELOG.md`.
4. **Release flow.** Push to `main` creates a Release PR; merging it creates a `v*` tag and triggers `npm publish`.

## Code Conventions

- One tool per definition block in `src/index.ts`. Keep the `browser_` name prefix.
- Each tool must provide: `name`, `title`, `description`, `inputSchema`, `risk`, `execute`.
- Risk levels:
  - `low` — read-only or page state queries (`read`, `snapshot`, `get_info`, `wait`)
  - `medium` — DOM interactions that mutate state (`click`, `fill`, `upload`, `drag`)
  - `high` — arbitrary code execution (`run_js`)
- Shell out to `agent-browser` via the shared `run()` / `runJson()` helpers.
- Guard every tool except `browser_check` with `requireAgentBrowser()`.
- Return `{ content: [...], isError: true }` on failures; log unexpected exceptions with `ctx.logger.error`.
- Temp files for screenshots/PDFs must be cleaned up in `finally` blocks.

## Adding or Modifying Tools

- Match the upstream `agent-browser` CLI command syntax and argument order.
- Update the README tool table and options sections.
- Consider whether `package.json` `systemPrompt` or `promptGuides` need updating.
- Consider whether unit tests are feasible and add them before merging complex logic.

## Testing

- There is currently no test framework.
- Minimum gate for any PR: `npm run build` must pass.
- If adding non-trivial logic, set up a test harness rather than only adding implementation code.
- Before release, smoke-test with a real `agent-browser` installation when possible.

## CI/CD

- `.github/workflows/release-please.yml` — creates a release PR on push to `main`.
- `.github/workflows/publish.yml` — builds and publishes to npm on `v*` tags.
- The publish job skips if the package version already exists on npm.

## Memory & AGENTS

- When a new convention, repeated pitfall, or design decision emerges, update this `AGENTS.md`.
- Do not store secrets, npm tokens, or transient CLI output in memory.
- Space memory records decisions and caveats, not diffs, tokens, or secrets.
