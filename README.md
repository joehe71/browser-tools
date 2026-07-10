# Browser Tools

Control a real browser from Finch — navigate, click, fill forms, take screenshots, read page content, debug, and more. Powered by [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) (Google).

## Requirements

- **Node.js 18+**
- **chrome-devtools-mcp** installed globally

```bash
npm install -g chrome-devtools-mcp
```

Or use the `/browser_setup` tool to install automatically.

## Tools (22)

| Tool | Description | Risk |
|---|---|---|
| `browser_navigate` | Navigate to a URL or open a new page | medium |
| `browser_new_page` | Open a new browser tab | medium |
| `browser_snapshot` | Get accessibility tree with element UIDs | low |
| `browser_screenshot` | Take a screenshot of the current page | low |
| `browser_click` | Click an element by UID | medium |
| `browser_fill` | Clear and fill a form field by UID | medium |
| `browser_type` | Type text with real keystrokes | medium |
| `browser_press` | Press a keyboard key | medium |
| `browser_hover` | Hover over an element by UID | low |
| `browser_run_js` | Execute JavaScript in page context | high |
| `browser_get_info` | List all open pages | low |
| `browser_get` | Get element info by UID | low |
| `browser_find` | Get verbose snapshot to find elements | low |
| `browser_wait` | Wait for a condition (selector, text, url) | low |
| `browser_upload` | Upload files to a file input | medium |
| `browser_drag` | Drag and drop elements | medium |
| `browser_set_checkbox` | Toggle checkbox/radio | medium |
| `browser_scroll` | Scroll the page | low |
| `browser_console` | List console messages | low |
| `browser_network` | List network requests | low |
| `browser_close` | Stop the browser daemon | medium |
| `browser_check` | Check installation status | low |
| `browser_setup` | Install chrome-devtools-mcp | medium |

## Element Selection

Chrome DevTools MCP uses **UIDs** (not CSS selectors) to identify elements. Use `browser_snapshot` first to get element UIDs, then pass them to `browser_click`, `browser_fill`, etc.

## Workflow

1. **`browser_check`** / **`browser_setup`** — Verify/install chrome-devtools-mcp
2. **`browser_navigate`** — Open the target URL (daemon starts automatically)
3. **`browser_snapshot`** — Get element UIDs
4. **`browser_click`** / **`browser_fill`** — Interact using UIDs
5. **`browser_screenshot`** — Visually verify the state
6. **`browser_console`** / **`browser_network`** — Debug if needed
7. **`browser_close`** — Clean up when done

## Visible Browser

Chrome DevTools MCP starts a visible browser window by default. All operations happen in real time in the browser window. No extra configuration needed.

## Debugging

Chrome DevTools MCP provides debugging capabilities:

- **`browser_console`** — View console messages with source-mapped stack traces
- **`browser_network`** — Analyze network requests
- **`browser_run_js`** — Execute arbitrary JavaScript
- **`browser_snapshot`** — Get the full accessibility tree

## Privacy

The mini tool shells out to the `chrome-devtools` CLI on your machine. No data leaves your machine beyond what the browser itself does when visiting URLs you specify.

## License

MIT
