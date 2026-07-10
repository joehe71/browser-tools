# 浏览器工具

从 Finch 控制真实浏览器——导航、点击、填写表单、截图、读取页面内容、调试等。基于 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)（Google）。

## 要求

- **Node.js 18+**
- 全局安装 **chrome-devtools-mcp**

```bash
npm install -g chrome-devtools-mcp
```

或使用 `/browser_setup` 工具自动安装。

## 工具（22 个）

| 工具 | 说明 | 风险 |
|---|---|---|
| `browser_navigate` | 导航到 URL 或打开新页面 | medium |
| `browser_new_page` | 打开新标签页 | medium |
| `browser_snapshot` | 获取带 UID 的可访问性树 | low |
| `browser_screenshot` | 截取当前页面 | low |
| `browser_click` | 通过 UID 点击元素 | medium |
| `browser_fill` | 清空并填写表单字段 | medium |
| `browser_type` | 模拟真实键盘输入 | medium |
| `browser_press` | 按下键盘按键 | medium |
| `browser_hover` | 悬停在元素上 | low |
| `browser_run_js` | 执行 JavaScript | high |
| `browser_get_info` | 列出所有打开的页面 | low |
| `browser_get` | 获取元素信息 | low |
| `browser_find` | 获取详细快照以查找元素 | low |
| `browser_wait` | 等待条件（selector、text、url） | low |
| `browser_upload` | 上传文件 | medium |
| `browser_drag` | 拖拽元素 | medium |
| `browser_set_checkbox` | 切换复选框/单选框 | medium |
| `browser_scroll` | 滚动页面 | low |
| `browser_console` | 查看控制台消息 | low |
| `browser_network` | 查看网络请求 | low |
| `browser_close` | 停止浏览器 daemon | medium |
| `browser_check` | 检查安装状态 | low |
| `browser_setup` | 安装 chrome-devtools-mcp | medium |

## 元素选择

Chrome DevTools MCP 使用 **UID**（而非 CSS 选择器）来标识元素。先用 `browser_snapshot` 获取元素 UID，再传给 `browser_click`、`browser_fill` 等工具。

## 工作流

1. **`browser_check`** / **`browser_setup`** — 检查/安装 chrome-devtools-mcp
2. **`browser_navigate`** — 打开目标 URL（daemon 自动启动）
3. **`browser_snapshot`** — 获取元素 UID
4. **`browser_click`** / **`browser_fill`** — 使用 UID 交互
5. **`browser_screenshot`** — 可视化验证状态
6. **`browser_console`** / **`browser_network`** — 调试（如需要）
7. **`browser_close`** — 清理

## 可见浏览器

Chrome DevTools MCP 默认启动可见浏览器窗口。所有操作都在浏览器窗口中实时执行，无需额外配置。

## 调试

Chrome DevTools MCP 提供调试能力：

- **`browser_console`** — 查看带 source-mapped 堆栈的控制台消息
- **`browser_network`** — 分析网络请求
- **`browser_run_js`** — 执行任意 JavaScript
- **`browser_snapshot`** — 获取完整可访问性树

## 隐私

该 Mini Tool 通过 shell 调用本机的 `chrome-devtools` CLI。除了浏览器访问你指定的 URL 时产生的数据外，不会有其他数据离开本机。

## 许可证

MIT
