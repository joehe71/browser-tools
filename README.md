# Agent Browser · Finch Mini Tool

Control a real browser from Finch — navigate, click, fill forms, take screenshots, read page content, and more. Powered by [agent-browser](https://github.com/vercel-labs/agent-browser) (Vercel Labs).

## Requirements

- **Node.js 18+** (for the agent-browser CLI)
- **agent-browser CLI** installed globally

```bash
npm install -g agent-browser
agent-browser install   # Downloads Chrome for Testing (first time only)
```

## Tools

| Tool | Description | Risk |
|---|---|---|
| `browser_navigate` | Open a URL in the browser | medium |
| `browser_read` | Read page content as agent-friendly text | low |
| `browser_snapshot` | Get accessibility tree with element refs | low |
| `browser_screenshot` | Take a screenshot of the current page | low |
| `browser_click` | Click an element by CSS selector or snapshot ref | medium |
| `browser_fill` | Clear and fill a form field | medium |
| `browser_type` | Type text with real keystrokes | medium |
| `browser_press` | Press a keyboard key (Enter, Tab, etc.) | medium |
| `browser_select` | Select an option from a dropdown | medium |
| `browser_scroll` | Scroll the page or scroll element into view | low |
| `browser_hover` | Hover over an element | low |
| `browser_run_js` | Execute JavaScript in page context | high |
| `browser_get_info` | Get page title and/or URL | low |
| `browser_wait` | Wait for a page condition (selector, text, URL, JS) | low |
| `browser_close` | Close the browser session | medium |
| `browser_check` | Check agent-browser installation status | low |

## Workflow

A typical browser automation flow:

1. **`browser_check`** — Verify agent-browser is installed
2. **`browser_navigate`** — Open the target URL
3. **`browser_snapshot`** — Get the page structure with element refs
4. **`browser_fill` / `browser_click`** — Interact with the page using refs
5. **`browser_screenshot`** — Visually verify the state
6. **`browser_read`** — Extract readable content
7. **`browser_close`** — Clean up when done

## Privacy

The mini tool shells out to the `agent-browser` CLI on your machine. No data leaves your machine beyond what agent-browser itself does when visiting URLs you specify.

## License

MIT