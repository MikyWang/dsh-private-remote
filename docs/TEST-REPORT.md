# 测试报告

- 日期：2026-10-24（Asia/Shanghai）
- 插件：`dsh-private-remote@0.1.0`，协议 `1`
- 目标 Harness：`0.2.1-rc.3`
- 环境：macOS `27.0.1` arm64，官方 Desktop `0.2.1-rc.3`，Node `v24.21.0`，
  pnpm `11.28.5`，本地 Ollama（`deepseek-v4.1-flash:1017-cloud`）

本报告把证据分成四层：**代码检查 / 自动化单元测试 / 本机双实例 / 真实双机**。前三层
已执行；第四层**没有执行**，因此不能声称“端到端全部通过”或“真实双机验证完成”。

## 1. 代码检查

命令：

```bash
npm run check
```

结果（最终，文档补齐后）：

```text
checked syntax: 27 JS files
static checks passed
```

覆盖：

- 所有 `src/`、`scripts/`、`test/` 的 JS 语法；
- `client.js` 必须是 ModuleLoader 经典脚本，不得出现 ESM import；
- 禁止 `dangerouslySetInnerHTML`、`localStorage`、官方安装目录硬编码；
- 协议/控制通道/面板 id/版本/角色/语言文件/入口检查；
- 秘密模式扫描（`sk-*`、GitHub/AWS/Slack token、私钥块）；
- 根 `package.json` 无运行时依赖、ESM；
- 文档存在性检查（现在 6 篇文档均存在）。

## 2. 自动化单元测试

命令：

```bash
npm test
```

结果：

```text
tests 30
pass 30
fail 0
```

覆盖范围：

| 测试文件 | 覆盖 |
| --- | --- |
| `allowlist.test.mjs` | 会话/工作区/事件/提问端点正例；危险命名空间反例；排序/去重。 |
| `secure-channel.test.mjs` | 随机秘密格式、双向 proof 确定性/绑定、HKDF 方向密钥、双向帧、篡改、重放/旧序号、窗口内乱序、方向错误、超大帧、未知帧类型、协议版本。 |
| `bridge.test.mjs` | 握手认证、白名单 unary/stream、拒绝非法端点（使用模拟 Gateway/Connection）。 |
| `config.test.mjs` | role/port/label、bind 地址（loopback/RFC1918/Tailscale/IPv6 私网）、拒绝通配/公网、remote URL 规则。 |
| `gateway-switch.test.mjs` | switch 安装幂等、卸载恢复、离线 dispatch/stream 失败且不触本机、活动远端只接受 browserPeer、关闭 bridge 后离线。 |
| `paths.test.mjs` | Windows 大小写/分隔符、按 Host 平台的路径包含、最深工作区匹配。 |

注意：这些是进程内测试，不替代真实 Harness 实例；真实实例证据在第 3 节。

## 3. 本机双实例联调

命令：

```bash
npm run test:e2e
# 等价于 node scripts/e2e-local.mjs
```

该命令：

- 用 `.tmp/e2e-home`（Host）和 `.tmp/e2e-client-home`（Client）两个隔离 `DSH_HOME`；
- 通过官方 `dsh plugin --profile web add` 安装/复用本仓库 `bundle/`；
- 启动 Host `127.0.0.1:47311`（桥 `47821`）和 Client `127.0.0.1:47312`；
- 用 Host 本机 Ollama 的真实模型跑少量短 turn（测试 Host patch 只引用 dummy 环境变量，
  不含真实 Key）；
- 不打印启动 token / 配对 token / cookie。

本轮最终运行删除了旧的两个隔离 home，从空目录重新初始化 profile、创建测试 workspace
和 seed session，再运行完整联调；因此不是依赖上一次运行残留的会话。

最终 clean-room 运行结果（从空的隔离 home 开始，token/cookie 已省略）：

```text
- preparing isolated profiles in .tmp/e2e-home and .tmp/e2e-client-home
- starting isolated Host on 127.0.0.1:47311 (bridge 47821)
- starting isolated Client on 127.0.0.1:47312
- seed: created Host session session-...
- running local two-instance integration test
- host bridge listening on 127.0.0.1:47821
- persisted pairing restored as remote-offline; no local fallback
- client starts in local mode
- wrong pairing token rejected; mode stays local
- control channel rejects an unauthenticated browser
- paired with E2E Host (darwin, version unknown)
- remote mode active in the local Host switch
- non-allowlisted endpoint denied through the switch
- remote workspace baseline through local mux: 1 workspace(s)
- remote session list through local /api: 1 entries; target found
- remote session page through local /api: 20 records
- new remote session created through the switch: session-...
- $events stream through local mux forwarded to the remote Host
- session/follow stream through local mux forwarded to the remote Host
- prompt accepted; assistant streaming frames delivered through the switched mux
- remote assistant reply through local /api: "REMOTE-OK-..."
- remote cancel confirmed by the Host: turn ended as aborted; task stopped, not misreported
- new remote session created through the switch: session-...
- remote approval/request delivered through the switched mux (bash)
- approval answered through the switch; the Host executed the approved tool call
- new remote session created through the switch: session-...
- remote user-questions/request delivered through the switched mux (q1)
- blocking question answered through $events/result; the Host tool call received the reply
- disconnect keeps remote mode offline; no local fallback
- explicit local mode restored local /api (0 local sessions)
PASS local two-instance integration (token and cookie redacted)
```

### 3.1 该运行实际验证的路径

客户端所有调用都走**它自己本机 Host** 的 `/api` 和 `/api/remote.mux`，与官方会话 UI
使用的路径相同；不是直接访问远端桥：

1. 持久化配对恢复为 `remote-offline`，调用被拒绝且不落本地；显式 `useLocal` 恢复。
2. 错误配对令牌被拒绝，客户端仍是 `local`；无浏览器 cookie 的控制请求返回 401。
3. 正确配对后进入 `remote`；本机 Gateway 把 `session/*`、`workspace/*`、`$events`、
   `session/follow` 转发到远端 Host。
4. 非白名单端点 `commands/execute` 在本机被 bridge 拒绝
   （`remote/endpoint-denied`），没有到达远端 Gateway。
5. `workspace/follow` 基线返回远端工作区（1 个）。
6. `session/list` 返回远端会话；`session/page` 读到 25 条历史记录。
7. 通过 `session/create` 新建远端会话，并继续在其中操作。
8. `session/prompt` 发送标记文本；`session/follow` 收到 `assistant-stream` 和
   `turn/end`；`session/page` 读到助手回复中的标记。
9. 长生成开始后 `session/cancel`；Host 返回 `turn/end {reason:{kind:"aborted"}}`，
   没有伪造完成。
10. 新会话中让模型调用 `bash` 并显式请求 `sandbox_permissions: danger-full-access`；
    `$events` 收到 `approval/request`；用 `$events/result {outcome:{kind:"result",
    value:"allowed-once"}}` 回答；Host 执行工具，日志出现 `approval/decided
    allowed-once` 和 `tool/result`。
11. 另一新会话中让模型调用 `ask_user_question`；`$events` 收到
    `user-questions/request`；用 `$events/result {outcome:{kind:"result",
    value:{answers:[{id:"q1",selected:["OK"]}]}}}` 回答；Host 的 `tool/result`
    携带该答案，turn 正常完成。
12. `disconnect` 后 `session/list` 返回 `remote/offline`，没有本地回退；
    `useLocal` 恢复本机 `/api`。

### 3.2 未覆盖

- 真实 Windows Host、真实 Tailscale 链路、Windows 防火墙/路径；
- 真实官方 Desktop 窗口里的人工点击/视觉验收（自动化走的是同一套 API/mux 路径，
  但没有截图或人工确认卡片样式）；
- 计时提问分支（`userQuestions/attachWait` + `userQuestions/answer`）：本机隔离 Host
  暴露的是阻塞式 `ask_user_question` schema，自动化覆盖的是 `$events/result` 分支；
- 斜杠命令（`commands/execute` 被有意拒绝）；
- 多客户端并发、令牌轮换后重连、Host 崩溃恢复等长尾场景。

## 4. 官方 Desktop 安装与挂载点

安装：

- `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 包含
  `dsh-private-remote`，依赖是
  `"dsh-private-remote": "link:/Users/wangqiyuan/Documents/git/dsh-private-remote/bundle"`；
- 安装动作通过官方插件管理器的 `install_bundle` 完成，没有修改官方安装目录或分叉客户端。

用 Cordis Inspect 对运行中的官方 Desktop 查询 Slot（本机 live 页面），4 个 occupant
均为 `active: true`：

| Slot | occupant |
| --- | --- |
| `sidebar.panellist` | `private-remote`（order 20） |
| `main` | key `private-remote` |
| `shell.overlay` | `private-remote-status`（order 100） |
| `conversation.session.header.utilities` | `private-remote-workspace`（order 20） |

这说明“安装到官方 Desktop + 中文 Remote 入口 + 面板/状态/会话标题挂载”已经在真实运行
实例中生效。**人工视觉验收**（点开面板、连接、看卡片样式）仍建议由用户完成。

### 4.1 GitHub Release 资产安装验证

发布页：<https://github.com/MikyWang/dsh-private-remote/releases/tag/v0.1.0>

资产：`dsh-private-remote-0.1.0.tgz`（49,941 字节，
SHA256 `847a54974f83239311dc726373af51c0c8af639568f2c705c470eae1d7f63007`）。

在一个全新的 `DSH_HOME=/tmp/dsh-url-test` 中执行：

```bash
dsh plugin --profile web add \
  https://github.com/MikyWang/dsh-private-remote/releases/download/v0.1.0/dsh-private-remote-0.1.0.tgz
```

结果：pnpm 从 GitHub Release 下载并安装 `dsh-private-remote 0.1.0`，
`dsh --profile web --dump-config` 输出 `# == dsh-private-remote` 和
`- id: private-remote`。这证明 Windows 可以按 README 4.3 的同一 URL 安装，不需要
克隆仓库或本地构建。`desktop` profile 的安装还需遵守官方限制：先由 Desktop 初始化，
安装时完全退出 Desktop。

## 5. 真实双机

**未执行。** 原因：本机没有第二台 Windows/Tailscale 机器可供测试；不能把本机两个
隔离实例当成“真实双机成功”。

提供的准备步骤见 [README.md](../README.md#42-windows-host) 和
[COMPATIBILITY.md](COMPATIBILITY.md)。真实双机验收至少应覆盖：

1. Windows Host 绑定 Tailscale IP，防火墙只放行 tailnet 到 47821；
2. macOS 客户端从另一台机器连接、看 Host 名称/平台/版本；
3. 远端工作区列表、历史、新建、发送、流式、停止；
4. 审批卡和提问卡在官方会话界面出现，答复回到同一个请求；
5. 拔网/断 Tailscale 后显示离线、拒绝提交、不落本地；重连后重新认证并核对历史；
6. 退出 Remote 后本机工作区/会话不受污染。

## 6. 构建与产物

命令：

```bash
npm run build
npm run verify
```

结果：

```text
built bundle/ (23 files, 0.1.0, protocol 1)
bundle verified: dsh-private-remote@0.1.0, 23 hashed files
```

`bundle/` 包含：`index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`、`host/`、
`shared/`、`locale/`、`package.json`、`BUILD-INFO.json`、README、LICENSE、
THIRD_PARTY_NOTICES。`verify` 检查元数据、导出、入口、无 node_modules、无运行时依赖、
客户端 ModuleLoader、无 localStorage/dangerouslySetInnerHTML、秘密模式。

## 7. 结论与声明边界

- **已实现并验证**：构建/静态检查/单元测试/本机双实例完整闭环/官方 Desktop 4 个挂载点。
- **已实现但待验证**：真实 Windows + macOS 双机、Tailscale/防火墙、人工视觉验收、
  计时提问分支、Windows 路径细节。
- **尚未实现**：文件预览、远程终端、模型/插件设置、斜杠命令执行、多 Host 同时切换、
  按设备吊销、审计日志、自动重放修改类请求。

本报告不把第 3 节的本机双实例称为“真实双机”，也不把第 4 节的挂载点称为“人工视觉
验收完成”。
