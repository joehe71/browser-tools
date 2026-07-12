# browser-tools · AGENTS.md

Space-bound project rules for the browser-tools Finch Mini Tool extension.

## Project Overview

- Finch Mini Tool extension that registers [`chrome-devtools-mcp`](https://github.com/niclas-niclas/chrome-devtools-mcp) as an MCP server via Finch's `mcp.client` capability.
- Published as `@joehe71/browser-tools` on npm.
- Tech stack: TypeScript (ES2022/ESNext), `@finch.app/minitool-api`, MCP Client capability.
- All browser automation tools are provided by the MCP server (`mcp__chrome-devtools__*`).
- This extension only handles registration, configuration, and status checking.

## Architecture

- **MCP Server**: `chrome-devtools-mcp` by Google — stdio transport via `npx -y chrome-devtools-mcp@latest`.
- **Registration**: `activate()` reads stored config from `ctx.storage` and calls `mcp.client.registerServer()`.
- **Teardown**: `deactivate()` calls `mcp.client.unregisterServer()`.
- **Tools**: `browser_setup` (configure + register), `browser_check` (status).
- **Metadata**: `contributes.mcpServers` in `package.json` provides tool titles and display hints for the MCP Client.

## Workflow

1. **Read before editing.** For upstream MCP server changes, check the chrome-devtools-mcp README first.
2. **Build after edits.** After changing `src/`, run `npm run build` to confirm TypeScript compiles.
3. **Conventional Commits.** Use `feat:`, `fix:`, `chore:`, `docs:` prefixes so Release Please can generate `CHANGELOG.md`.
4. **Release flow.** Push to `main` creates a Release PR; merging it creates a `v*` tag and triggers `npm publish`.

## Code Conventions

- `browser_setup` and `browser_check` are the only local tools. Keep them minimal.
- MCP tool metadata (titles, display) goes in `package.json` `contributes.mcpServers`, not in code.
- Secrets should never be stored or returned. Chrome DevTools MCP has no API key, but future options may.
- Return `{ content: [...], isError: true }` on failures; log with `ctx.logger.error`.
- Use `registerWhenReady()` pattern for MCP registration — extension activation order is not guaranteed.

## Adding or Modifying Tools

- This extension does not add MCP tools directly. To add a local utility tool, register it in `src/index.ts`.
- To expose new MCP tool metadata, add entries to `contributes.mcpServers[].toolMeta.titles` and `toolDisplay.tools`.
- Update the README tool table and options sections.
- Consider whether `package.json` `systemPrompt` or `promptGuides` need updating.

## Testing

- There is currently no test framework.
- Minimum gate for any PR: `npm run build` must pass.
- Before release, smoke-test with a real `chrome-devtools-mcp` installation when possible.

## CI/CD

- `.github/workflows/release-please.yml` — creates a release PR on push to `main`.
- `.github/workflows/publish.yml` — builds and publishes to npm on `v*` tags.
- The publish job skips if the package version already exists on npm.

## Memory & AGENTS

- When a new convention, repeated pitfall, or design decision emerges, update this `AGENTS.md`.
- Do not store secrets, npm tokens, or transient CLI output in memory.
- Space memory records decisions and caveats, not diffs, tokens, or secrets.
