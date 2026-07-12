# Changelog

## [1.0.0](https://github.com/joehe71/browser-tools/compare/v0.2.1...v1.0.0) (2026-07-12)


### ⚠ BREAKING CHANGES

* Removed all 23 shell exec wrapper tools. Browser automation is now provided by chrome-devtools-mcp MCP server, registered via Finch's mcp.client capability. Tools are exposed as mcp__chrome-devtools__* and discovered by the Agent via ToolSearch with source:"mcp".

### Features

* refactor to MCP tool — register chrome-devtools-mcp via mcp.client ([fa26aeb](https://github.com/joehe71/browser-tools/commit/fa26aeba22168e0d23e90dfa7687281abf9e817d))


### Bug Fixes

* i18n for form field descriptions in browser_setup ([ae4ecc0](https://github.com/joehe71/browser-tools/commit/ae4ecc0e6b05bfc5d859f91a8da516c3dca10798))
* i18n toast message for browser_setup success ([e2f1cd6](https://github.com/joehe71/browser-tools/commit/e2f1cd638914ee4f8781581331fd3f856cdab2e4))
* remove slash prefix from promptGuides — backtick-wrap tool names instead ([2f03b93](https://github.com/joehe71/browser-tools/commit/2f03b9370d1c515316594b397d7f0254f8ea02d6))

## [0.2.0](https://github.com/joehe71/browser-tools/compare/v0.1.0...v0.2.0) (2026-07-10)


### Features

* systemPrompt 兼容 macOS/Linux/Windows 三平台 Chrome 检测和启动 ([b85e0bd](https://github.com/joehe71/browser-tools/commit/b85e0bd72007741f55535e53018d6718714ceb40))
* systemPrompt 增加 Chrome 安装检测，connect 前先确认浏览器可用 ([a27c5b0](https://github.com/joehe71/browser-tools/commit/a27c5b0291cf5a3f29465be85fefaf7ac5ce3c8e))
* systemPrompt 增加实时操作提示，用户想看操作时引导使用 browser_connect ([bfb2a6f](https://github.com/joehe71/browser-tools/commit/bfb2a6f557fd74c8c90fb51acb68f403de60730d))
* systemPrompt 改为 agent 自己启动 Chrome 带调试端口，不需用户手动操作 ([c582841](https://github.com/joehe71/browser-tools/commit/c5828415eacf24427a5da66a0e222ea1648346ef))
* 添加 browser_connect 工具，支持 CDP 连接可见浏览器 ([e494635](https://github.com/joehe71/browser-tools/commit/e49463598b4b1285b33c4748f249faf6c75c59d5))
* 添加 browser_setup 工具，支持 npm/homebrew/curl 三种安装方式，本地二进制优先 ([f683f1f](https://github.com/joehe71/browser-tools/commit/f683f1fded01f5e86caab7cc80b55f51c35fa65a))
* 添加 i18n 支持，扩展名改为 browser-tools ([3cc2e78](https://github.com/joehe71/browser-tools/commit/3cc2e78466afaf1b79a4d634aae5d96b98722e0a))
* 用 chrome-devtools-mcp 完全替换 agent-browser ([6a252fa](https://github.com/joehe71/browser-tools/commit/6a252fa9b2ecc49d2e9d11c7f5e7855387647640))
* 补齐 agent-browser 缺失的浏览器自动化工具 ([a694cec](https://github.com/joehe71/browser-tools/commit/a694cec75c4c51bd5672bacf9c7b4fc2f7f05b88))


### Bug Fixes

* deactivate 时停止 chrome-devtools daemon ([7dd6d7f](https://github.com/joehe71/browser-tools/commit/7dd6d7fbf94e3f17b6e84fa50993748dab0a6576))
* set git identity in CI for finch-releases sync ([cce9a4a](https://github.com/joehe71/browser-tools/commit/cce9a4a73dc6a3461dc1a6032aa59e6592fc6273))
* set git token auth for finch-releases push ([030f9d6](https://github.com/joehe71/browser-tools/commit/030f9d65368f9ce340440de07fedf6241d33be27))
* skip npm publish if version already exists ([ee23d2c](https://github.com/joehe71/browser-tools/commit/ee23d2c9969d02d003cd2aa42a9f9ee3450d73e7))
