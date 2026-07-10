# 浏览器工具

从 Finch 控制真实浏览器——导航、点击、填写表单、截图、读取页面内容、上传文件、保存 PDF、拖拽等。基于 [agent-browser](https://github.com/vercel-labs/agent-browser)（Vercel Labs）。

## 要求

- **Node.js 18+**（用于运行 agent-browser CLI）
- 全局安装 **agent-browser CLI**

```bash
npm install -g agent-browser
agent-browser install   # 首次运行下载 Chrome for Testing
```

## 工具（27 个）

| 工具 | 说明 | 风险 |
|---|---|---|
| `browser_navigate` | 在浏览器中打开 URL | medium |
| `browser_read` | 以适合 Agent 阅读的格式读取页面内容 | low |
| `browser_snapshot` | 获取可访问性树及元素引用 | low |
| `browser_screenshot` | 截取当前页面 | low |
| `browser_click` | 通过 CSS 选择器或快照引用点击元素 | medium |
| `browser_dblclick` | 双击元素 | medium |
| `browser_fill` | 清空并填写表单字段 | medium |
| `browser_type` | 在当前焦点元素上模拟真实键盘输入 | medium |
| `browser_focus` | 聚焦元素，便于后续输入 | low |
| `browser_press` | 按下键盘按键（Enter、Tab 等） | medium |
| `browser_select` | 从下拉框中选择选项 | medium |
| `browser_set_checkbox` | 勾选或取消勾选复选框/单选框 | medium |
| `browser_scroll` | 滚动页面或元素 | low |
| `browser_scroll_into_view` | 将指定元素滚动到可视区域 | low |
| `browser_hover` | 悬停在元素上 | low |
| `browser_run_js` | 在页面上下文中执行 JavaScript | high |
| `browser_get_info` | 获取页面标题和/或 URL | low |
| `browser_get` | 获取元素 text/html/value/attribute/count/box/styles | low |
| `browser_find` | 按 selector/role/text 查找元素，并可选择执行动作 | medium |
| `browser_wait` | 等待页面条件（selector、text、URL、JS） | low |
| `browser_upload` | 上传文件到文件输入框 | medium |
| `browser_drag` | 拖拽元素到目标位置 | medium |
| `browser_pdf` | 将当前页面保存为 PDF | low |
| `browser_close` | 关闭浏览器会话 | medium |
| `browser_check` | 检查 agent-browser 安装状态 | low |
| `browser_connect` | 通过 CDP 连接到已打开的浏览器 | medium |

### `browser_navigate` 选项

除 `url` 外，还支持启动参数：

- `headless` — 无窗口运行
- `windowSize` — 例如 `"1280x720"`
- `userAgent` — 自定义 User Agent
- `proxy` — 例如 `"http://localhost:8080"`
- `profile` — Chrome 配置文件名，用于复用 Cookie/登录状态
- `noBlock` — 禁用默认广告/追踪拦截
- `block` — 启用严格拦截

### `browser_screenshot` 选项

- `fullPage` — 截取完整可滚动页面
- `format` — `"png"`（默认）或 `"jpeg"`
- `quality` — JPEG 质量，0-100
- `annotate` — 在截图上标注带编号的元素标签

## 工作流

典型的浏览器自动化流程：

1. **`browser_check`** — 确认 agent-browser 已安装
2. **`browser_navigate`** — 打开目标 URL
3. **`browser_snapshot`** — 获取页面结构及元素引用
4. **`browser_fill` / `browser_click`** — 使用引用与页面交互
5. **`browser_screenshot`** —  visually 验证状态
6. **`browser_read`** — 提取可读内容
7. **`browser_close`** — 用完后清理

## 隐私

该 Mini Tool 通过 shell 调用本机的 `agent-browser` CLI。除了 agent-browser 访问你指定的 URL 时产生的数据外，不会有其他数据离开本机。

## 许可证

MIT
