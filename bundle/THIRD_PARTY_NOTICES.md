# 第三方声明

本仓库的 `src/`、`bundle/` 和测试代码不包含、也不复制任何第三方源代码，没有运行时
npm 依赖（`package.json` 没有 `dependencies`/`devDependencies`）。

运行时使用官方 DeepSeek Harness 提供的以下能力；它们的代码、许可证和版本由官方
Desktop/CLI 安装包提供，本包不再分发：

- DeepSeek Harness Desktop/CLI `0.2.1-rc.3`：插件加载、Cordis 运行时、Web 服务器、
  Connection/Peer、Typert Gateway、会话/工作区/凭据/审批/提问服务。
- Cordis `4.0.5`（随官方 Desktop）：插件生命周期和 Service/Slot 机制。
- React（随官方 Desktop 客户端 bundle）：界面渲染；本包的 `client.js` 通过官方
  `window.__ModuleLoader__` 的 `require('react')` 使用，不单独打包。
- Node.js `v24.21.0`（官方 Desktop 内置运行时）：`node:http`、`node:crypto`、
  `node:fs` 等内置模块。
- pnpm `11.28.5`（官方 Desktop 内置）：profile 安装；只在开发/安装时使用。
- Ollama 与 `deepseek-v4.1-flash:1017-cloud`：仅测试环境的本地模型提供方，不是本包的
  依赖；测试配置只引用环境变量 `E2E_OLLAMA_KEY` 的 dummy 值，不含真实 Key。

官方组件的许可证请查阅 DeepSeek Harness 安装包及其 `node_modules` 中各自的
`LICENSE`/`package.json`。如果未来把任何第三方代码复制进本仓库，必须在此处补充其
许可证文本和版权声明。

本包自身采用 MIT，见 [LICENSE](LICENSE)。
