/**
 * @finch.app/browser-tools v0.2.0
 *
 * Finch mini tool that wraps the `chrome-devtools` CLI (Google Chrome DevTools MCP)
 * into discrete Agent tools for browser automation.
 *
 * Requirements:
 *   npm install -g chrome-devtools-mcp
 */
import type * as finch from 'finch';
import { execFile, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let _extensionPath = '';

// ── Binary resolution ──────────────────────────────────────────────────────

function getBinDir(): string {
  return join(_extensionPath, 'bin');
}

function getBinPath(): string {
  const suffix = process.platform === 'win32' ? 'chrome-devtools.exe' : 'chrome-devtools';
  return join(getBinDir(), suffix);
}

function getCLI(): string {
  const local = getBinPath();
  if (existsSync(local)) {
    try {
      execSync(`"${local}" --version`, { timeout: 5000, stdio: 'pipe' });
      return local;
    } catch { /* fall through */ }
  }
  return 'chrome-devtools';
}

function isAvailable(): boolean {
  const local = getBinPath();
  if (existsSync(local)) {
    try {
      execSync(`"${local}" --version`, { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch { /* fall through */ }
  }
  try {
    execSync('which chrome-devtools', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function run(args: string[], timeout = 30_000): Promise<string> {
  const cli = getCLI();
  const { stdout, stderr } = await execFileAsync(cli, args, { timeout, maxBuffer: 10 * 1024 * 1024 });
  if (stderr) {
    return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  }
  return stdout.trim();
}

async function runJson<T = unknown>(args: string[], timeout = 30_000): Promise<T> {
  const out = await run([...args, '--output-format=json'], timeout);
  return JSON.parse(out) as T;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tempScreenshotPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'browser-tools-'));
  return join(dir, 'screenshot.png');
}

function error(msg: string): finch.ToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function requireCLI(): void {
  if (!isAvailable()) {
    throw new CLINotInstalledError();
  }
}

class CLINotInstalledError extends Error {
  constructor() {
    super('chrome-devtools-mcp is not installed');
    this.name = 'CLINotInstalledError';
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
    description: 'Navigate the current page to a URL, or open a new page. The browser daemon starts automatically on first use.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to.' },
        newTab: { type: 'boolean', description: 'Open in a new tab instead of navigating the current page.' },
      },
      required: ['url'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const url = String(input.url);
      if (input.newTab) {
        const out = await run(['new_page', url]);
        return { content: [{ type: 'text', text: out || `Opened new page: ${url}` }] };
      }
      const out = await run(['navigate_page', url]);
      return { content: [{ type: 'text', text: out || `Navigated to ${url}` }] };
    },
  },

  // ── browser_snapshot ──────────────────────────────────────────────────
  {
    name: 'browser_snapshot',
    title: 'Browser: Snapshot',
    description: 'Get the accessibility tree of the current page with element UIDs. This is the BEST way to understand page structure — use the UIDs in subsequent click/fill/hover commands.',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include all possible information in the tree.' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const args: string[] = ['take_snapshot'];
      if (input.verbose) args.push('--verbose');
      const out = await run(args, 60_000);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_screenshot ────────────────────────────────────────────────
  {
    name: 'browser_screenshot',
    title: 'Browser: Screenshot',
    description: 'Take a screenshot of the current page and save it to a file. Returns the file path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output file path. If omitted, a temporary path is used.' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const filePath = input.path ? String(input.path) : tempScreenshotPath();
      const out = await run(['take_screenshot', '--filePath', filePath], 60_000);
      return { content: [{ type: 'text', text: out || `Screenshot saved to ${filePath}` }] };
    },
  },

  // ── browser_click ─────────────────────────────────────────────────────
  {
    name: 'browser_click',
    title: 'Browser: Click',
    description: 'Click an element on the page by its UID from a snapshot. Use browser_snapshot first to get element UIDs.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The element UID from a snapshot (e.g. "element-uid-123").' },
        dblClick: { type: 'boolean', description: 'Set to true for double clicks.' },
      },
      required: ['uid'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const args: string[] = ['click', String(input.uid)];
      if (input.dblClick) args.push('--dblClick');
      const out = await run(args);
      return { content: [{ type: 'text', text: out || `Clicked "${input.uid}"` }] };
    },
  },

  // ── browser_fill ──────────────────────────────────────────────────────
  {
    name: 'browser_fill',
    title: 'Browser: Fill',
    description: 'Clear a form field and fill it with text. Use the element UID from a snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The element UID from a snapshot.' },
        text: { type: 'string', description: 'The text to fill into the field.' },
      },
      required: ['uid', 'text'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const out = await run(['fill', String(input.uid), String(input.text)]);
      return { content: [{ type: 'text', text: out || `Filled "${input.uid}" with "${input.text}"` }] };
    },
  },

  // ── browser_type ──────────────────────────────────────────────────────
  {
    name: 'browser_type',
    title: 'Browser: Type',
    description: 'Type text with real keystrokes into the currently focused element.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type with real keystrokes.' },
      },
      required: ['text'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const out = await run(['type_text', String(input.text)]);
      return { content: [{ type: 'text', text: out || `Typed "${input.text}"` }] };
    },
  },

  // ── browser_press ─────────────────────────────────────────────────────
  {
    name: 'browser_press',
    title: 'Browser: Press Key',
    description: 'Press a keyboard key (Enter, Tab, Escape, arrow keys, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press. Examples: "Enter", "Tab", "Escape", "ArrowDown".' },
      },
      required: ['key'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const out = await run(['press_key', String(input.key)]);
      return { content: [{ type: 'text', text: out || `Pressed "${input.key}"` }] };
    },
  },

  // ── browser_hover ─────────────────────────────────────────────────────
  {
    name: 'browser_hover',
    title: 'Browser: Hover',
    description: 'Hover the mouse over an element by UID. Use before clicking or to trigger hover-based UI.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The element UID from a snapshot.' },
      },
      required: ['uid'],
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const out = await run(['hover', String(input.uid)]);
      return { content: [{ type: 'text', text: out || `Hovered "${input.uid}"` }] };
    },
  },

  // ── browser_run_js ────────────────────────────────────────────────────
  {
    name: 'browser_run_js',
    title: 'Browser: Run JavaScript',
    description: 'Execute JavaScript code in the browser page context. Use return to get a value back.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute. Use return to get a value.' },
      },
      required: ['code'],
    },
    risk: 'high',
    async execute(input) {
      requireCLI();
      const out = await run(['evaluate_script', String(input.code)]);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_get_info ──────────────────────────────────────────────────
  {
    name: 'browser_get_info',
    title: 'Browser: Get Page Info',
    description: 'List all open pages in the browser with their titles and URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'low',
    async execute() {
      requireCLI();
      const out = await run(['list_pages']);
      return { content: [{ type: 'text', text: out || 'No pages open.' }] };
    },
  },

  // ── browser_get ───────────────────────────────────────────────────────
  {
    name: 'browser_get',
    title: 'Browser: Get Element Info',
    description: 'Get text content or attributes of a specific element by UID from a snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The element UID from a snapshot.' },
      },
      required: ['uid'],
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const out = await run(['take_snapshot', '--uid', String(input.uid)]);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_find ──────────────────────────────────────────────────────
  {
    name: 'browser_find',
    title: 'Browser: Find Element',
    description: 'Get a verbose snapshot to find elements by their accessible names, roles, or text content. Then use the UIDs with other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include all possible information (default: true).' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const args: string[] = ['take_snapshot'];
      if (input.verbose !== false) args.push('--verbose');
      const out = await run(args, 60_000);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_wait ──────────────────────────────────────────────────────
  {
    name: 'browser_wait',
    title: 'Browser: Wait',
    description: 'Wait for a condition: an element to appear, text to show, or a navigation to complete.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'What to wait for.',
          enum: ['selector', 'text', 'url', 'load'],
        },
        value: { type: 'string', description: 'The value to wait for (CSS selector, text, URL pattern, or "load").' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 10000).' },
      },
      required: ['type', 'value'],
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const type = String(input.type);
      const value = String(input.value);
      const args: string[] = ['wait_for', type, value];
      if (input.timeout !== undefined) args.push('--timeout', String(input.timeout));
      const out = await run(args, (input.timeout as number ?? 10_000) + 5000);
      return { content: [{ type: 'text', text: out || `Waited for ${type}: ${value}` }] };
    },
  },

  // ── browser_upload ────────────────────────────────────────────────────
  {
    name: 'browser_upload',
    title: 'Browser: Upload Files',
    description: 'Upload files to a file input element by UID.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The file input element UID from a snapshot.' },
        files: {
          type: 'string',
          description: 'Comma-separated file paths to upload.',
        },
      },
      required: ['uid', 'files'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const files = String(input.files).split(',').map(s => s.trim()).filter(Boolean);
      if (files.length === 0) return error('At least one file path is required.');
      const out = await run(['upload_file', String(input.uid), ...files]);
      return { content: [{ type: 'text', text: out || `Uploaded ${files.length} file(s)` }] };
    },
  },

  // ── browser_drag ──────────────────────────────────────────────────────
  {
    name: 'browser_drag',
    title: 'Browser: Drag and Drop',
    description: 'Drag an element and drop it onto another element by UIDs.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'The source element UID to drag.' },
        target: { type: 'string', description: 'The target element UID to drop onto.' },
      },
      required: ['source', 'target'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const out = await run(['drag', String(input.source), String(input.target)]);
      return { content: [{ type: 'text', text: out || `Dragged "${input.source}" to "${input.target}"` }] };
    },
  },

  // ── browser_set_checkbox ──────────────────────────────────────────────
  {
    name: 'browser_set_checkbox',
    title: 'Browser: Set Checkbox',
    description: 'Check or uncheck a checkbox/radio element by clicking it.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The checkbox element UID from a snapshot.' },
      },
      required: ['uid'],
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const out = await run(['click', String(input.uid)]);
      return { content: [{ type: 'text', text: out || `Toggled checkbox "${input.uid}"` }] };
    },
  },

  // ── browser_scroll ────────────────────────────────────────────────────
  {
    name: 'browser_scroll',
    title: 'Browser: Scroll',
    description: 'Scroll the page or an element using JavaScript.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: 'Scroll direction.',
          enum: ['up', 'down'],
        },
        pixels: { type: 'number', description: 'Number of pixels to scroll (default: 300).' },
      },
      required: ['direction'],
    },
    risk: 'low',
    async execute(input) {
      requireCLI();
      const dir = String(input.direction);
      const px = input.pixels ?? 300;
      const script = `window.scrollBy(0, ${dir === 'up' ? '-' : ''}${px})`;
      const out = await run(['evaluate_script', script]);
      return { content: [{ type: 'text', text: out || `Scrolled ${dir} ${px}px` }] };
    },
  },

  // ── browser_console ───────────────────────────────────────────────────
  {
    name: 'browser_console',
    title: 'Browser: Console Messages',
    description: 'List all console messages from the current page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'low',
    async execute() {
      requireCLI();
      const out = await run(['list_console_messages']);
      return { content: [{ type: 'text', text: out || 'No console messages.' }] };
    },
  },

  // ── browser_network ───────────────────────────────────────────────────
  {
    name: 'browser_network',
    title: 'Browser: Network Requests',
    description: 'List all network requests for the current page since last navigation.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'low',
    async execute() {
      requireCLI();
      const out = await run(['list_network_requests']);
      return { content: [{ type: 'text', text: out || 'No network requests.' }] };
    },
  },

  // ── browser_new_page ──────────────────────────────────────────────────
  {
    name: 'browser_new_page',
    title: 'Browser: New Page',
    description: 'Open a new browser tab/page with an optional URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to open in the new page.' },
      },
    },
    risk: 'medium',
    async execute(input) {
      requireCLI();
      const args = input.url ? ['new_page', String(input.url)] : ['new_page'];
      const out = await run(args);
      return { content: [{ type: 'text', text: out || 'Opened new page.' }] };
    },
  },

  // ── browser_close ─────────────────────────────────────────────────────
  {
    name: 'browser_close',
    title: 'Browser: Close',
    description: 'Stop the browser daemon and close all pages.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'medium',
    async execute() {
      requireCLI();
      const out = await run(['stop'], 10_000);
      return { content: [{ type: 'text', text: out || 'Browser closed.' }] };
    },
  },

  // ── browser_check ─────────────────────────────────────────────────────
  {
    name: 'browser_check',
    title: 'Browser: Check Status',
    description: 'Check whether chrome-devtools-mcp is installed and the browser daemon is running.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'low',
    async execute() {
      if (!isAvailable()) {
        return {
          content: [{
            type: 'text',
            text: [
              '❌ chrome-devtools-mcp is not installed.',
              '',
              'To install automatically, call the `browser_setup` tool.',
              '',
              'To install manually:',
              '  npm install -g chrome-devtools-mcp',
            ].join('\n'),
          }],
        };
      }
      try {
        const out = await run(['status'], 5_000);
        return {
          content: [{
            type: 'text',
            text: `✅ chrome-devtools-mcp is installed.\n\n${out}`,
          }],
        };
      } catch {
        return { content: [{ type: 'text', text: '⚠️ chrome-devtools-mcp is installed but status check failed.' }] };
      }
    },
  },

  // ── browser_setup ─────────────────────────────────────────────────────
  {
    name: 'browser_setup',
    title: 'Browser: Setup',
    description: 'Install chrome-devtools-mcp globally via npm. This is a one-time setup. The browser daemon starts automatically on first use.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    risk: 'medium',
    async execute() {
      if (isAvailable()) {
        try {
          const out = await run(['status'], 5_000);
          return {
            content: [{
              type: 'text',
              text: `✅ chrome-devtools-mcp is already installed.\n\n${out}\n\nNo setup needed.`,
            }],
          };
        } catch { /* fall through to install */ }
      }

      try {
        execSync('npm install -g chrome-devtools-mcp', { timeout: 120_000, stdio: 'pipe' });
        const out = await run(['status'], 5_000);
        return {
          content: [{
            type: 'text',
            text: `✅ chrome-devtools-mcp installed successfully!\n\n${out}`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: 'text',
            text: [
              `❌ Failed to install chrome-devtools-mcp: ${msg}`,
              '',
              'Manual install:',
              '  npm install -g chrome-devtools-mcp',
            ].join('\n'),
          }],
          isError: true,
        };
      }
    },
  },
];

// ── Activation ──────────────────────────────────────────────────────────────

export function activate(ctx: finch.MiniToolContext): void {
  _extensionPath = ctx.extension.extensionPath;

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
            if (err instanceof CLINotInstalledError) {
              return {
                content: [{
                  type: 'text',
                  text: [
                    '❌ chrome-devtools-mcp is not available.',
                    '',
                    'Call the `browser_setup` tool to install it automatically.',
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

  ctx.logger.info(`browser-tools activated with ${tools.length} tools`);
}

export function deactivate(): void {
  try {
    execSync('chrome-devtools stop', { timeout: 5000, stdio: 'pipe' });
  } catch {
    // ignore errors if daemon is not running
  }
}
