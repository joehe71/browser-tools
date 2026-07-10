/**
 * @finch.app/agent-browser v0.1.0
 *
 * Finch mini tool that wraps the `agent-browser` CLI (Vercel Labs)
 * into discrete Agent tools for browser automation.
 *
 * Requirements:
 *   npm install -g agent-browser
 *   agent-browser install
 */
import type * as finch from 'finch';
import { execFile, execSync } from 'node:child_process';
import { accessSync, constants, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLI = 'agent-browser';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Check if agent-browser is available on PATH. */
function isAgentBrowserAvailable(): boolean {
  try {
    execSync(`which ${CLI}`, { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Run agent-browser with args and return stdout. */
async function run(args: string[], timeout = 30_000): Promise<string> {
  const { stdout, stderr } = await execFileAsync(CLI, args, { timeout, maxBuffer: 10 * 1024 * 1024 });
  if (stderr) {
    // agent-browser may print diagnostics to stderr; append to stdout
    return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  }
  return stdout.trim();
}

/** Run agent-browser with JSON output. */
async function runJson<T = unknown>(args: string[], timeout = 30_000): Promise<T> {
  const out = await run([...args, '--json'], timeout);
  return JSON.parse(out) as T;
}

/** Create a temp file path for screenshot output. */
function tempScreenshotPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-browser-'));
  const path = join(dir, 'screenshot.png');
  return path;
}

/** Read a local file as base64 data URI. */
function fileToBase64(filePath: string): { data: string; mimeType: string } {
  const buf = readFileSync(filePath);
  return { data: buf.toString('base64'), mimeType: 'image/png' };
}

/** Render a ToolErrorResult. */
function error(msg: string): finch.ToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

/** Guard: require agent-browser to be installed. */
function requireAgentBrowser(): void {
  if (!isAgentBrowserAvailable()) {
    throw new ToolNotInstalledError();
  }
}

class ToolNotInstalledError extends Error {
  constructor() {
    super('agent-browser is not installed');
    this.name = 'ToolNotInstalledError';
  }
}

// ── Tool definitions ────────────────────────────────────────────────────────

const tools: Array<{
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  execute(input: Record<string, unknown>, exec: finch.ToolExecutionContext): Promise<finch.ToolResult>;
}> = [
  // ── browser_navigate ──────────────────────────────────────────────────
  {
    name: 'browser_navigate',
    title: 'Browser: Navigate',
    description: 'Open a URL in the browser. Launches the browser if not already running. Use this to load a webpage before reading, screenshotting, or interacting with it.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to navigate to (e.g. https://example.com).' },
        profile: { type: 'string', description: 'Optional Chrome profile name to reuse login state (e.g. "Default", "Work"). Only used on first launch.' },
      },
      required: ['url'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const url = String(input.url ?? '');
      const profile = input.profile ? String(input.profile) : undefined;
      const args = profile ? ['--profile', profile, 'open', url] : ['open', url];
      const out = await run(args);
      return { content: [{ type: 'text', text: out || `Navigated to ${url}` }] };
    },
  },

  // ── browser_read ──────────────────────────────────────────────────────
  {
    name: 'browser_read',
    title: 'Browser: Read Page',
    description: 'Read the current page content as agent-friendly text. Extracts the main readable content from the active browser tab, stripping away navigation, ads, and chrome. Also works with a direct URL (fetches without launching a browser).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to read directly without launching the browser. Omit to read the current active tab.' },
        filter: { type: 'string', description: 'Optional text filter to find specific content on the page.' },
        outline: { type: 'boolean', description: 'Show page outline/structure instead of full text.' },
        md: { type: 'boolean', description: 'If true, only read pages that serve markdown (for docs sites).' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const url = input.url ? String(input.url) : undefined;
      const args: string[] = ['read'];
      if (url) args.push(url);
      if (input.filter) args.push('--filter', String(input.filter));
      if (input.outline) args.push('--outline');
      if (input.md) args.push('--require-md');
      const out = await run(args, 60_000);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_snapshot ──────────────────────────────────────────────────
  {
    name: 'browser_snapshot',
    title: 'Browser: Snapshot',
    description: 'Get the accessibility tree of the current page with interactive element refs (e.g. @e1, @e2). This is the BEST way for AI to understand what is on the page — it returns a structured view with all clickable, focusable, and readable elements labeled with refs you can use in subsequent click/fill commands.',
    inputSchema: {
      type: 'object',
      properties: {
        interactiveOnly: { type: 'boolean', description: 'Only show interactive elements (simplified view). Default: false.' },
        json: { type: 'boolean', description: 'Output as JSON for programmatic use.' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const args: string[] = ['snapshot'];
      if (input.interactiveOnly) args.push('-i');
      if (input.json) args.push('--json');
      const out = await run(args, 60_000);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_screenshot ────────────────────────────────────────────────
  {
    name: 'browser_screenshot',
    title: 'Browser: Screenshot',
    description: 'Take a screenshot of the current page. Returns the image so you can see what is on the page. Use this after navigating or interacting to visually verify the browser state.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture full page (scrollable area) instead of viewport only.' },
        format: { type: 'string', description: 'Image format: "png" (default) or "jpeg".', enum: ['png', 'jpeg'] },
        quality: { type: 'number', description: 'JPEG quality 0-100 (default 80). Only applies to jpeg format.' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const filePath = tempScreenshotPath();
      try {
        const args: string[] = ['screenshot', filePath];
        if (input.fullPage) args.push('--full');
        if (input.format) args.push('--screenshot-format', String(input.format));
        if (input.quality !== undefined) args.push('--screenshot-quality', String(input.quality));

        await run(args, 60_000);
        const image = fileToBase64(filePath);
        return { content: [{ type: 'image', ...image }] };
      } finally {
        try { unlinkSync(filePath); rmSync(join(filePath, '..'), { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
      }
    },
  },

  // ── browser_click ─────────────────────────────────────────────────────
  {
    name: 'browser_click',
    title: 'Browser: Click',
    description: 'Click an element on the page. Use a CSS selector (e.g. "#submit", ".btn-primary") or a snapshot ref (e.g. "@e3"). Use the snapshot tool first to get element refs.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (e.g. "#submit", ".btn-primary", "button") or snapshot ref (e.g. "@e3").' },
        newTab: { type: 'boolean', description: 'Open link in a new tab.' },
      },
      required: ['selector'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const args: string[] = ['click', String(input.selector)];
      if (input.newTab) args.push('--new-tab');
      const out = await run(args);
      return { content: [{ type: 'text', text: out || `Clicked "${input.selector}"` }] };
    },
  },

  // ── browser_fill ──────────────────────────────────────────────────────
  {
    name: 'browser_fill',
    title: 'Browser: Fill',
    description: 'Clear a form field and fill it with text. Use a CSS selector or snapshot ref (e.g. "@e3") to target the input element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref (e.g. "#email", "@e3") for the input element.' },
        text: { type: 'string', description: 'The text to fill into the field.' },
      },
      required: ['selector', 'text'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['fill', String(input.selector), String(input.text)]);
      return { content: [{ type: 'text', text: out || `Filled "${input.selector}" with "${input.text}"` }] };
    },
  },

  // ── browser_type ──────────────────────────────────────────────────────
  {
    name: 'browser_type',
    title: 'Browser: Type',
    description: 'Type text into the currently focused element with real keystrokes. Unlike fill, this does not clear the field first. Use press first if you need to focus an element.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type with real keystrokes (no selector needed).' },
      },
      required: ['text'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['keyboard', 'type', String(input.text)]);
      return { content: [{ type: 'text', text: out || `Typed "${input.text}"` }] };
    },
  },

  // ── browser_press ─────────────────────────────────────────────────────
  {
    name: 'browser_press',
    title: 'Browser: Press Key',
    description: 'Press a keyboard key. Useful for Enter, Tab, Escape, arrow keys, and keyboard shortcuts (e.g. "Control+a", "Enter", "Tab", "Escape", "ArrowDown").',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press. Examples: "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Control+a".' },
      },
      required: ['key'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['press', String(input.key)]);
      return { content: [{ type: 'text', text: out || `Pressed "${input.key}"` }] };
    },
  },

  // ── browser_select ────────────────────────────────────────────────────
  {
    name: 'browser_select',
    title: 'Browser: Select Option',
    description: 'Select an option from a dropdown/select element by its value.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the select element.' },
        value: { type: 'string', description: 'The option value to select.' },
      },
      required: ['selector', 'value'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['select', String(input.selector), String(input.value)]);
      return { content: [{ type: 'text', text: out || `Selected "${input.value}" in "${input.selector}"` }] };
    },
  },

  // ── browser_scroll ────────────────────────────────────────────────────
  {
    name: 'browser_scroll',
    title: 'Browser: Scroll',
    description: 'Scroll the page up, down, left, or right. Optionally scroll a specific element into view.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Scroll direction.', enum: ['up', 'down', 'left', 'right'] },
        pixels: { type: 'number', description: 'Number of pixels to scroll (default: 300).' },
        selector: { type: 'string', description: 'Optional CSS selector to scroll an element into view (then direction/pixels are ignored).' },
      },
      required: ['direction'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const args: string[] = ['scroll', String(input.direction)];
      if (input.pixels !== undefined) args.push(String(input.pixels));
      if (input.selector) args.push('--selector', String(input.selector));
      const out = await run(args);
      return { content: [{ type: 'text', text: out || `Scrolled ${input.direction}` }] };
    },
  },

  // ── browser_hover ─────────────────────────────────────────────────────
  {
    name: 'browser_hover',
    title: 'Browser: Hover',
    description: 'Hover the mouse over an element. Use before clicking or to trigger hover-based UI (tooltips, dropdowns, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the element to hover over.' },
      },
      required: ['selector'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['hover', String(input.selector)]);
      return { content: [{ type: 'text', text: out || `Hovered "${input.selector}"` }] };
    },
  },

  // ── browser_run_js ────────────────────────────────────────────────────
  {
    name: 'browser_run_js',
    title: 'Browser: Run JavaScript',
    description: 'Execute JavaScript code in the browser page context. Use this to extract data, manipulate the DOM, or get information not available through other tools. The result is returned as text.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute in the page context. Use return to get a value back, e.g. "return document.title" or "return JSON.stringify(window.__INITIAL_STATE__)".' },
      },
      required: ['code'],
    },
    risk: 'high',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['eval', String(input.code)]);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_get_info ──────────────────────────────────────────────────
  {
    name: 'browser_get_info',
    title: 'Browser: Get Page Info',
    description: 'Get information about the current page: title, URL, or both. Useful after navigation to confirm where you are.',
    inputSchema: {
      type: 'object',
      properties: {
        info: { type: 'string', description: 'What info to get: "title", "url", or "all".', enum: ['title', 'url', 'all'], default: 'all' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const what = String(input.info ?? 'all');
      const parts: string[] = [];

      if (what === 'title' || what === 'all') {
        const title = await run(['get', 'title']).catch(() => '(unavailable)');
        parts.push(`Title: ${title}`);
      }
      if (what === 'url' || what === 'all') {
        const url = await run(['get', 'url']).catch(() => '(unavailable)');
        parts.push(`URL: ${url}`);
      }

      return { content: [{ type: 'text', text: parts.join('\n') }] };
    },
  },

  // ── browser_wait ──────────────────────────────────────────────────────
  {
    name: 'browser_wait',
    title: 'Browser: Wait',
    description: 'Wait for a condition on the page: a CSS selector to appear, text to appear, a URL pattern, or a JavaScript condition. Use this after navigation or interaction before reading the page.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'What to wait for: "selector" (CSS element visible), "text" (text substring), "url" (URL pattern), "js" (JS condition), "load" (page load state).',
          enum: ['selector', 'text', 'url', 'js', 'load'],
        },
        value: { type: 'string', description: 'The value for the wait condition. For selector: CSS selector. For text: text substring to appear. For url: URL glob pattern like "**/dash". For js: JavaScript condition like "window.ready === true". For load: "load", "domcontentloaded", or "networkidle".' },
        timeout: { type: 'number', description: 'Maximum wait time in milliseconds (default: 10000).' },
      },
      required: ['type', 'value'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const type = String(input.type);
      const value = String(input.value);
      const args: string[] = ['wait'];

      if (type === 'selector') args.push(value);
      else if (type === 'text') args.push('--text', value);
      else if (type === 'url') args.push('--url', value);
      else if (type === 'js') args.push('--fn', value);
      else if (type === 'load') args.push('--load', value);

      if (input.timeout !== undefined) args.push('--timeout', String(input.timeout));

      const out = await run(args, (input.timeout as number ?? 10_000) + 5000);
      return { content: [{ type: 'text', text: out || `Waited for ${type}: ${value}` }] };
    },
  },

  // ── browser_close ─────────────────────────────────────────────────────
  {
    name: 'browser_close',
    title: 'Browser: Close',
    description: 'Close the browser session. Call this when you are done with the browser to free up resources.',
    inputSchema: {
      type: 'object',
      properties: {
        all: { type: 'boolean', description: 'Close all active browser sessions instead of just the current one.' },
      },
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const args: string[] = ['close'];
      if (input.all) args.push('--all');
      const out = await run(args, 10_000);
      return { content: [{ type: 'text', text: out || 'Browser closed.' }] };
    },
  },

  // ── browser_check ─────────────────────────────────────────────────────
  {
    name: 'browser_check',
    title: 'Browser: Check Status',
    description: 'Check whether agent-browser CLI is installed and whether Chrome is available. Shows version info and installation status. Call this first if browser tools are not working.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'low',
    async execute() {
      const installed = isAgentBrowserAvailable();
      if (!installed) {
        return {
          content: [{
            type: 'text',
            text: [
              '❌ agent-browser is not installed.',
              '',
              'To install:',
              '  1. Install the CLI:  npm install -g agent-browser',
              '  2. Download Chrome:  agent-browser install',
              '',
              'Or via Homebrew:  brew install agent-browser && agent-browser install',
            ].join('\n'),
          }],
        };
      }

      try {
        const version = await run(['--version'], 5_000);
        return {
          content: [{
            type: 'text',
            text: `✅ agent-browser is installed.\n\nVersion: ${version}\n\nUse the browser tools to navigate, read, screenshot, and interact with web pages.`,
          }],
        };
      } catch {
        return { content: [{ type: 'text', text: '⚠️ agent-browser is installed but version info could not be retrieved.' }] };
      }
    },
  },
];

// ── Activation ──────────────────────────────────────────────────────────────

export function activate(ctx: finch.MiniToolContext): void {
  for (const tool of tools) {
    ctx.subscriptions.push(
      ctx.tools.register({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as finch.JsonSchema,
        risk: tool.risk as 'low' | 'medium' | 'high',
        async execute(input, exec) {
          try {
            return await tool.execute(input as Record<string, unknown>, exec);
          } catch (err) {
            if (err instanceof ToolNotInstalledError) {
              return {
                content: [{
                  type: 'text',
                  text: [
                    '❌ agent-browser is not installed on this system.',
                    '',
                    'To get started:',
                    '  1. npm install -g agent-browser',
                    '  2. agent-browser install',
                    '',
                    'Then ask me to try again. Or use the /browser_check tool to verify installation.',
                  ].join('\n'),
                }],
                isError: true,
              };
            }
            const msg = err instanceof Error ? err.message : String(err);
            ctx.logger.error(`[${tool.name}] ${msg}`);
            return error(`Browser tool "${tool.name}" failed: ${msg}`);
          }
        },
      }),
    );
  }

  ctx.logger.info(`agent-browser extension activated with ${tools.length} tools`);
}

export function deactivate(): void {
  // agent-browser daemon persists independently — no cleanup needed.
}