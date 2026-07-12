/**
 * @finch.app/browser-tools v0.3.0
 *
 * Finch mini tool that registers chrome-devtools-mcp as an MCP server
 * via Finch's mcp.client capability. All browser automation tools are
 * provided by the MCP server — this extension only handles registration
 * and configuration.
 */
import type * as finch from 'finch';

const SERVER_NAME = 'chrome-devtools';
const STORAGE_KEY = 'browser-tools.setup';

interface StoredSetup {
  headless: boolean;
  viewport?: string;
  extraArgs?: string[];
}

type McpServerConfig =
  | { name: string; command: string; args?: string[]; env?: Record<string, string>; description?: string; ownerExtensionId?: string; ownerExtensionName?: string }
  | { name: string; url: string; headers?: Record<string, string>; env?: Record<string, string>; description?: string; ownerExtensionId?: string; ownerExtensionName?: string };

interface McpClientCapability {
  listServers(): Promise<string[]>;
  getServerStatuses?(): Promise<Array<{ name: string; status: string; toolCount: number; ownerExtensionId?: string; qualifiedName?: string }>>;
  listTools(server: string): Promise<Array<{ name: string; title?: string; description?: string; inputSchema?: Record<string, unknown> }>>;
  registerServer(config: McpServerConfig): Promise<{ ok: boolean; error?: string }>;
  unregisterServer(name: string): Promise<{ ok: boolean }>;
}

let activeCtx: finch.ExtensionContext | null = null;

// ── Storage helpers ─────────────────────────────────────────────────────────

async function readSetup(ctx: finch.ExtensionContext): Promise<StoredSetup | undefined> {
  return ctx.storage.get<StoredSetup>(STORAGE_KEY);
}

// ── MCP server registration ─────────────────────────────────────────────────

interface McpStdioServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  ownerExtensionId?: string;
  ownerExtensionName?: string;
}

function buildServerConfig(setup?: StoredSetup): McpStdioServerConfig {
  const args = ['-y', 'chrome-devtools-mcp@latest'];
  if (setup?.headless) args.push('--headless');
  if (setup?.viewport) args.push('--viewport', setup.viewport);
  if (setup?.extraArgs) args.push(...setup.extraArgs);

  return {
    name: SERVER_NAME,
    command: 'npx',
    args,
    description: 'Chrome DevTools MCP server by Google. Provides browser automation, debugging, and performance analysis.',
  };
}

async function registerRuntimeServer(ctx: finch.ExtensionContext, setup?: StoredSetup): Promise<{ ok: boolean; error?: string }> {
  if (!ctx.capabilities.has('mcp.client')) {
    return { ok: false, error: 'mcp.client capability unavailable' };
  }
  const mcp = ctx.capabilities.get<McpClientCapability>('mcp.client');
  const server = buildServerConfig(setup);
  server.ownerExtensionId = ctx.extension.id;
  server.ownerExtensionName = ctx.extension.displayName;
  try {
    return await mcp.registerServer(server);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function unregisterRuntimeServer(ctx: finch.ExtensionContext): Promise<void> {
  if (!ctx.capabilities.has('mcp.client')) return;
  try {
    await ctx.capabilities.get<McpClientCapability>('mcp.client').unregisterServer(SERVER_NAME);
  } catch {
    // Runtime state is in-memory; nothing to clean up on shutdown.
  }
}

/** Wait for mcp.client capability to come online, then register. */
async function registerWhenReady(ctx: finch.ExtensionContext, setup?: StoredSetup): Promise<void> {
  const MAX_ATTEMPTS = 20;
  const INTERVAL_MS = 250;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (ctx.capabilities.has('mcp.client')) {
      const res = await registerRuntimeServer(ctx, setup);
      if (res.ok) {
        ctx.logger.info('chrome-devtools MCP server registered');
        return;
      }
      ctx.logger.warn('chrome-devtools MCP server registration failed:', res.error);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  ctx.logger.warn('mcp.client capability never became available; server not registered. Is MCP Client enabled?');
}

async function verifyWithMcpClient(ctx: finch.ExtensionContext): Promise<string> {
  if (!ctx.capabilities.has('mcp.client')) {
    return 'MCP Client capability is not available. Enable the MCP Client extension, then try again.';
  }
  const mcp = ctx.capabilities.get<McpClientCapability>('mcp.client');
  try {
    const servers = await mcp.listServers();
    if (!servers.includes(SERVER_NAME)) {
      return 'Registered, but MCP Client has not picked up the chrome-devtools server yet. Disable/enable MCP Client or restart Finch if it does not appear shortly.';
    }
    const tools = await mcp.listTools(SERVER_NAME);
    const names = tools.map((t) => t.name).sort();
    return names.length
      ? `MCP Client can see ${names.length} chrome-devtools tools: ${names.slice(0, 10).join(', ')}${names.length > 10 ? ', ...' : ''}.`
      : 'MCP Client found the chrome-devtools server, but it has not reported tools yet.';
  } catch (err) {
    return `Registered, but connection validation did not complete: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Tools ───────────────────────────────────────────────────────────────────

function registerSetupTool(ctx: finch.ExtensionContext): void {
  ctx.subscriptions.push(ctx.tools.register({
    name: 'browser_setup',
    title: 'Set up Browser Tools',
    description: 'Configure and register the Chrome DevTools MCP server. Use this for first-time setup or to change options like headless mode and viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', description: 'Run Chrome in headless mode (no visible window). Default: false.' },
        viewport: { type: 'string', description: 'Initial viewport size, e.g. "1280x720".' },
      },
    },
    risk: 'medium',
    async execute(input) {
      const args = input as { headless?: boolean; viewport?: string };
      const existing = await readSetup(ctx);
      const setup: StoredSetup = {
        headless: args.headless ?? existing?.headless ?? false,
        viewport: args.viewport ?? existing?.viewport,
        extraArgs: existing?.extraArgs,
      };

      await ctx.storage.set(STORAGE_KEY, setup);
      const registration = await registerRuntimeServer(ctx, setup);
      if (!registration.ok) {
        ctx.logger.error('failed to register chrome-devtools MCP server', registration.error);
        return { content: [{ type: 'text', text: `Saved setup, but MCP Client did not accept the server: ${registration.error ?? 'unknown error'}.` }], isError: true };
      }

      await ctx.ui.showToast({ title: 'Browser Tools configured', variant: 'success' });
      const validation = await verifyWithMcpClient(ctx);
      const summary = buildServerConfig(setup);
      return {
        content: [{
          type: 'text',
          text: `Chrome DevTools MCP server registered as "${SERVER_NAME}" (${summary.command} ${(summary.args ?? []).join(' ')}). ${validation}`,
        }],
      };
    },
  }));
}

function registerStatusTool(ctx: finch.ExtensionContext): void {
  ctx.subscriptions.push(ctx.tools.register({
    name: 'browser_check',
    title: 'Browser Tools Status',
    description: 'Check whether the Chrome DevTools MCP server is registered and list its visible tools.',
    inputSchema: { type: 'object', properties: {} },
    risk: 'low',
    async execute() {
      const configured = Boolean(await readSetup(ctx));

      if (!ctx.capabilities.has('mcp.client')) {
        const statusText = configured ? 'yes' : 'no';
        return { content: [{ type: 'text', text: `MCP Client capability is unavailable. Browser Tools configured in extension storage: ${statusText}.` }], isError: !configured };
      }

      const mcp = ctx.capabilities.get<McpClientCapability>('mcp.client');
      const statuses = mcp.getServerStatuses ? await mcp.getServerStatuses() : [];
      const status = statuses.find((s) => s.name === SERVER_NAME);
      let tools: string[] = [];
      try {
        tools = (await mcp.listTools(SERVER_NAME)).map((t) => t.name).sort();
      } catch {
        // Status output below is enough for troubleshooting.
      }

      return {
        content: [{
          type: 'text',
          text: [
            `Configured: ${configured ? 'yes' : 'no'}`,
            `MCP status: ${status ? `${status.status} (${status.toolCount} tools cached)` : 'not listed'}`,
            `Tools: ${tools.length ? tools.join(', ') : 'none yet'}`,
          ].join('\n'),
        }],
      };
    },
  }));
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function activate(ctx: finch.ExtensionContext): void {
  ctx.logger.info('Browser Tools extension activated');
  activeCtx = ctx;
  registerSetupTool(ctx);
  registerStatusTool(ctx);

  // Re-register the runtime MCP server from stored config. Runtime registrations
  // are in-memory on the MCP Client side and lost across restarts, so we restore
  // them on every activation. No-op when Browser Tools hasn't been set up yet.
  void readSetup(ctx).then((setup) => {
    if (setup) return registerWhenReady(ctx, setup);
  }).catch((err) => ctx.logger.error('Browser Tools activation registration failed', err));
}

export function deactivate(): void {
  const ctx = activeCtx;
  activeCtx = null;
  if (ctx) void unregisterRuntimeServer(ctx);
}
