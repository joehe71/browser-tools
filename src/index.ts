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
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let _extensionPath = '';

// ── Binary resolution ──────────────────────────────────────────────────────

/** Get the extension's bin directory. */
function getBinDir(): string {
  return join(_extensionPath, 'bin');
}

/** Get the local agent-browser binary path. */
function getBinPath(): string {
  const suffix = process.platform === 'win32' ? 'agent-browser.exe' : 'agent-browser';
  return join(getBinDir(), suffix);
}

/** Resolve the agent-browser binary: local bin first, then PATH. */
function getAgentBrowserBinary(): string {
  const local = getBinPath();
  if (existsSync(local)) {
    try {
      execSync(`"${local}" --version`, { timeout: 5000, stdio: 'pipe' });
      return local;
    } catch {
      // Binary exists but doesn't work — fall through to PATH
    }
  }
  return 'agent-browser';
}

const PLATFORM_BINARY_MAP: Record<string, string> = {
  'darwin-arm64': 'agent-browser-darwin-arm64',
  'darwin-x64': 'agent-browser-darwin-x64',
  'linux-arm64': 'agent-browser-linux-arm64',
  'linux-x64': 'agent-browser-linux-x64',
  'linux-musl-arm64': 'agent-browser-linux-musl-arm64',
  'linux-musl-x64': 'agent-browser-linux-musl-x64',
  'win32-x64': 'agent-browser-win32-x64.exe',
};

/** Get the platform key for the current system. */
function getPlatformKey(): string {
  if (process.platform === 'linux') {
    try {
      const lddOut = execSync('ldd --version 2>&1 || true', { timeout: 3000, encoding: 'utf-8' });
      if (lddOut.includes('musl')) {
        const muslKey = `linux-musl-${process.arch}`;
        if (PLATFORM_BINARY_MAP[muslKey]) return muslKey;
      }
    } catch { /* fall through */ }
  }
  return `${process.platform}-${process.arch}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Check if agent-browser is available (local bin or PATH). */
function isAgentBrowserAvailable(): boolean {
  const local = getBinPath();
  if (existsSync(local)) {
    try {
      execSync(`"${local}" --version`, { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch { /* fall through */ }
  }
  try {
    execSync('which agent-browser', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Run agent-browser with args and return stdout. */
async function run(args: string[], timeout = 30_000): Promise<string> {
  const binary = getAgentBrowserBinary();
  const { stdout, stderr } = await execFileAsync(binary, args, { timeout, maxBuffer: 10 * 1024 * 1024 });
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

/** Create a temp file path for PDF output. */
function tempPdfPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-browser-'));
  const path = join(dir, 'page.pdf');
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
    description: 'Open a URL in the browser. Launches the browser if not already running. Use this to load a webpage before reading, screenshotting, or interacting with it. Supports headless mode, viewport size, custom user agent, proxy, and ad-blocker settings.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to navigate to (e.g. https://example.com).' },
        profile: { type: 'string', description: 'Optional Chrome profile name to reuse login state (e.g. "Default", "Work"). Only used on first launch.' },
        headless: { type: 'boolean', description: 'Run in headless mode (no visible window).' },
        windowSize: { type: 'string', description: 'Browser window size, e.g. "1280x720".' },
        userAgent: { type: 'string', description: 'Custom user agent string.' },
        proxy: { type: 'string', description: 'Proxy server, e.g. "http://localhost:8080".' },
        noBlock: { type: 'boolean', description: 'Disable the default ad/tracker blocker.' },
        block: { type: 'boolean', description: 'Enable strict blocking of ads/trackers.' },
      },
      required: ['url'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const url = String(input.url ?? '');
      const args: string[] = [];
      if (input.profile) args.push('--profile', String(input.profile));
      if (input.headless) args.push('--headless');
      if (input.windowSize) args.push('--window-size', String(input.windowSize));
      if (input.userAgent) args.push('--user-agent', String(input.userAgent));
      if (input.proxy) args.push('--proxy', String(input.proxy));
      if (input.noBlock) args.push('--no-block');
      if (input.block) args.push('--block');
      args.push('open', url);
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
        annotate: { type: 'boolean', description: 'Annotate screenshot with numbered element labels from the accessibility tree.' },
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
        if (input.annotate) args.push('--annotate');

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
    description: 'Check whether agent-browser CLI is installed and whether Chrome is available. Shows version info and installation status. Call this first if browser tools are not working. If agent-browser is not installed, call `browser_setup` to install it automatically.',
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
              'To install automatically, call the `browser_setup` tool.',
              '',
              'To install manually:',
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

  // ── browser_setup ─────────────────────────────────────────────────────
  {
    name: 'browser_setup',
    title: 'Browser: Setup',
    description: 'Install the agent-browser CLI and download Chrome for Testing. This is a one-time setup. Supports npm (default, global install), homebrew (system-wide), or curl (downloads binary directly to the extension bin/ directory and does not pollute PATH). Call this if browser_check shows agent-browser is not installed.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description: 'Installation method.',
          enum: ['npm', 'homebrew', 'curl'],
          default: 'npm',
        },
      },
    },
    risk: 'medium',
    async execute(input) {
      if (isAgentBrowserAvailable()) {
        try {
          const version = await run(['--version'], 5_000);
          return {
            content: [{
              type: 'text',
              text: [
                `✅ agent-browser is already installed.`,
                `Version: ${version}`,
                '',
                'No setup needed — all browser tools are ready to use.',
              ].join('\n'),
            }],
          };
        } catch {
          // fall through to install
        }
      }

      const method = String(input.method ?? 'npm');

      try {
        if (method === 'homebrew') {
          execSync('brew install agent-browser', { timeout: 120_000, stdio: 'pipe' });
        } else if (method === 'curl') {
          // Download the npm tarball and extract the native binary to extPath/bin/
          const tmpDir = mkdtempSync(join(tmpdir(), 'agent-browser-setup-'));
          try {
            const tarballPath = join(tmpDir, 'package.tgz');
            // Download using npm pack (avoids extra deps)
            execSync(`npm pack agent-browser --pack-destination "${tmpDir}"`, { timeout: 120_000, stdio: 'pipe' });
            const tgzFiles = readdirSync(tmpDir).filter(f => f.startsWith('agent-browser-') && f.endsWith('.tgz'));
            if (tgzFiles.length === 0) throw new Error('Failed to download agent-browser tarball');
            execSync(`tar -xzf "${join(tmpDir, tgzFiles[0])}" -C "${tmpDir}"`, { timeout: 30_000, stdio: 'pipe' });

            const platformKey = getPlatformKey();
            const binaryName = PLATFORM_BINARY_MAP[platformKey];
            if (!binaryName) throw new Error(`Unsupported platform: ${platformKey}`);

            const binDir = getBinDir();
            mkdirSync(binDir, { recursive: true });
            copyFileSync(join(tmpDir, 'package', 'bin', binaryName), getBinPath());
            chmodSync(getBinPath(), 0o755);
          } finally {
            rmSync(tmpDir, { recursive: true, force: true });
          }
        } else {
          // npm (default)
          execSync('npm install -g agent-browser', { timeout: 120_000, stdio: 'pipe' });
        }

        // Download Chrome for Testing (use the just-installed binary)
        const binary = getAgentBrowserBinary();
        execSync(`"${binary}" install`, { timeout: 300_000, stdio: 'pipe' });

        const version = await run(['--version'], 5_000);
        const methodLabel =
          method === 'npm' ? 'npm global install' :
          method === 'homebrew' ? 'Homebrew' : 'curl (local bin/)';
        const successLines = [
          `✅ agent-browser installed successfully! (${methodLabel})`,
          `Version: ${version}`,
        ];
        if (method === 'curl') {
          successLines.push(`Location: \`${getBinPath()}\``);
        }
        successLines.push(
          '',
          'All browser tools are now ready to use.',
        );
        return {
          content: [{
            type: 'text',
            text: successLines.join('\n'),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: 'text',
            text: [
              `❌ Failed to install agent-browser: ${message}`,
              '',
              '**Manual install alternatives:**',
              '```bash',
              '# npm',
              'npm install -g agent-browser',
              'agent-browser install',
              '',
              '# Homebrew',
              'brew install agent-browser',
              'agent-browser install',
              '',
              '# Cargo',
              'cargo install agent-browser',
              'agent-browser install',
              '```',
              '',
              'After installing, restart Finch or re-enable the extension.',
            ].join('\n'),
          }],
          isError: true,
        };
      }
    },
  },

  // ── browser_connect ──────────────────────────────────────────────────
  {
    name: 'browser_connect',
    title: 'Browser: Connect',
    description: 'Connect to an existing browser via Chrome DevTools Protocol (CDP). First launch Chrome with --remote-debugging-port, then use this tool to connect agent-browser to it. This lets you see all automation operations in a visible browser window.',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: 'The CDP debugging port to connect to (default: 9222).',
          default: 9222,
        },
      },
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const port = input.port ?? 9222;
      const out = await run(['connect', String(port)]);
      return { content: [{ type: 'text', text: out || `Connected to browser on port ${port}` }] };
    },
  },

  // ── browser_dblclick ──────────────────────────────────────────────────
  {
    name: 'browser_dblclick',
    title: 'Browser: Double Click',
    description: 'Double-click an element on the page. Use a CSS selector (e.g. "#row-1") or a snapshot ref (e.g. "@e5"). Useful for opening items, selecting text, or map interactions.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref (e.g. "@e5").' },
      },
      required: ['selector'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['dblclick', String(input.selector)]);
      return { content: [{ type: 'text', text: out || `Double-clicked "${input.selector}"` }] };
    },
  },

  // ── browser_focus ─────────────────────────────────────────────────────
  {
    name: 'browser_focus',
    title: 'Browser: Focus',
    description: 'Focus an element on the page. Use before typing with browser_type (keyboard type), or to trigger focus-based UI. Accepts a CSS selector or snapshot ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref (e.g. "@e3").' },
      },
      required: ['selector'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['focus', String(input.selector)]);
      return { content: [{ type: 'text', text: out || `Focused "${input.selector}"` }] };
    },
  },

  // ── browser_set_checkbox ──────────────────────────────────────────────
  {
    name: 'browser_set_checkbox',
    title: 'Browser: Set Checkbox',
    description: 'Check or uncheck a checkbox or radio element. Use a CSS selector or snapshot ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the checkbox element.' },
        checked: { type: 'boolean', description: 'True to check, false to uncheck.' },
      },
      required: ['selector', 'checked'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const checked = Boolean(input.checked);
      const cmd = checked ? 'check' : 'uncheck';
      const out = await run([cmd, String(input.selector)]);
      return { content: [{ type: 'text', text: out || `${checked ? 'Checked' : 'Unchecked'} "${input.selector}"` }] };
    },
  },

  // ── browser_get ───────────────────────────────────────────────────────
  {
    name: 'browser_get',
    title: 'Browser: Get Element Info',
    description: 'Get information about a specific element: text content, innerHTML, input value, attribute, matching count, bounding box, or computed styles. Safer than run_js for element data extraction.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'What to get about the element.',
          enum: ['text', 'html', 'value', 'attr', 'count', 'box', 'styles'],
          default: 'text',
        },
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the target element.' },
        attribute: { type: 'string', description: 'Attribute name to read when type is "attr" (e.g. "href", "src").' },
      },
      required: ['type', 'selector'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const type = String(input.type ?? 'text');
      const selector = String(input.selector);
      const args: string[] = ['get', type];
      if (type === 'attr') {
        if (!input.attribute) {
          return error('When type is "attr", the "attribute" field is required.');
        }
        args.push(selector, String(input.attribute));
      } else {
        args.push(selector);
      }
      const out = await run(args);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_find ──────────────────────────────────────────────────────
  {
    name: 'browser_find',
    title: 'Browser: Find Element',
    description: 'Find an element by selector, role/name, or text. Optionally perform an action (click, fill, type, select, etc.) on the found element. More robust than CSS selectors on dynamic or accessible sites.',
    inputSchema: {
      type: 'object',
      properties: {
        by: {
          type: 'string',
          description: 'How to find the element.',
          enum: ['selector', 'role', 'text', 'all'],
          default: 'selector',
        },
        selector: { type: 'string', description: 'CSS selector or snapshot ref when by="selector" or by="all".' },
        role: { type: 'string', description: 'ARIA role when by="role", e.g. "button", "link", "textbox".' },
        name: { type: 'string', description: 'Accessible name to match when by="role".' },
        text: { type: 'string', description: 'Text substring when by="text".' },
        action: {
          type: 'string',
          description: 'Optional action to perform on the found element.',
          enum: ['click', 'dblclick', 'fill', 'type', 'select', 'check', 'uncheck', 'hover'],
        },
        value: { type: 'string', description: 'Value for fill/type/select actions.' },
      },
      required: ['by'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const by = String(input.by);
      const args: string[] = ['find'];

      if (by === 'role') {
        args.push('role', String(input.role));
        if (input.name) args.push('--name', String(input.name));
      } else if (by === 'text') {
        args.push('text', String(input.text));
      } else if (by === 'all') {
        args.push('all', String(input.selector));
      } else {
        args.push(String(input.selector));
      }

      if (input.action) {
        const action = String(input.action);
        args.push(action);
        if (['fill', 'type', 'select'].includes(action) && input.value !== undefined) {
          args.push(String(input.value));
        }
      }

      const out = await run(args);
      return { content: [{ type: 'text', text: out }] };
    },
  },

  // ── browser_scroll_into_view ──────────────────────────────────────────
  {
    name: 'browser_scroll_into_view',
    title: 'Browser: Scroll Into View',
    description: 'Scroll a specific element into view. More precise than browser_scroll for targeting a specific element. Accepts a CSS selector or snapshot ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the element to scroll into view.' },
      },
      required: ['selector'],
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['scrollintoview', String(input.selector)]);
      return { content: [{ type: 'text', text: out || `Scrolled "${input.selector}" into view` }] };
    },
  },

  // ── browser_pdf ───────────────────────────────────────────────────────
  {
    name: 'browser_pdf',
    title: 'Browser: Save PDF',
    description: 'Save the current page as a PDF. Either provide an output path or use a temporary file. Returns the path to the saved PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output file path. If omitted, a temporary path is used.' },
      },
    },
    risk: 'low',
    async execute(input) {
      requireAgentBrowser();
      const filePath = input.path ? String(input.path) : tempPdfPath();
      const out = await run(['pdf', filePath]);
      return { content: [{ type: 'text', text: out || `PDF saved to ${filePath}` }] };
    },
  },

  // ── browser_upload ────────────────────────────────────────────────────
  {
    name: 'browser_upload',
    title: 'Browser: Upload Files',
    description: 'Upload one or more files to a file input element. Paths are local file paths on the machine running agent-browser.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or snapshot ref for the file input element.' },
        files: {
          oneOf: [
            { type: 'string', description: 'Single file path or comma-separated file paths.' },
            { type: 'array', items: { type: 'string' }, description: 'Array of local file paths.' },
          ],
          description: 'File path(s) to upload.',
        },
      },
      required: ['selector', 'files'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const files = Array.isArray(input.files) ? input.files.map(String) : String(input.files).split(',').map(s => s.trim()).filter(Boolean);
      if (files.length === 0) {
        return error('At least one file path is required.');
      }
      const out = await run(['upload', String(input.selector), ...files]);
      return { content: [{ type: 'text', text: out || `Uploaded ${files.length} file(s) to "${input.selector}"` }] };
    },
  },

  // ── browser_drag ──────────────────────────────────────────────────────
  {
    name: 'browser_drag',
    title: 'Browser: Drag and Drop',
    description: 'Drag an element and drop it onto another element. Use CSS selectors or snapshot refs for both source and target.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'CSS selector or snapshot ref for the element to drag.' },
        target: { type: 'string', description: 'CSS selector or snapshot ref for the drop target.' },
      },
      required: ['source', 'target'],
    },
    risk: 'medium',
    async execute(input) {
      requireAgentBrowser();
      const out = await run(['drag', String(input.source), String(input.target)]);
      return { content: [{ type: 'text', text: out || `Dragged "${input.source}" to "${input.target}"` }] };
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
            if (err instanceof ToolNotInstalledError) {
              return {
                content: [{
                  type: 'text',
                  text: [
                    '❌ agent-browser is not available.',
                    '',
                    'Call the `browser_setup` tool to install it automatically,',
                    'or run `/browser_check` first to check the current status.',
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