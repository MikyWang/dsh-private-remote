# 测试报告

> 当前版本为 **Tailscale-only、无配对令牌**，最新验证：
> 43 个 JS 文件、35 个单元测试、23 个 bundle 文件；本机双实例 E2E 的 Host 桥在
> `100.68.241.8:18084`，覆盖 Tailscale-only 绑定、role/port 保存、Host stop/start、
> `settings/describe`/`remoteAccess/follow` 转发、远端会话/工作流/审批/提问、断开回 local。
> 下文 0.1.0 早期关于令牌、bindHost、47821 的日志属于历史记录。

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
checked syntax: 57 JS files
static checks passed
```

覆盖：

- 所有 `src/`、`scripts/`、`test/` 的 JS 语法；
- `client.js` 必须是 ModuleLoader 经典脚本，不得出现 ESM import；
- 禁止 `dangerouslySetInnerHTML`、`localStorage`、官方安装目录硬编码；
- 协议/控制通道/设置页 id/顶部状态/版本/角色/语言文件/入口检查；
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

> 注：第 1 条是 0.1.0 早期的 `remote-offline` 恢复行为；当前版本改为重启保持 local
> 并只预填 URL/标签，见 8.6。其余路径仍适用。

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

- `%DSH_HOME%\profiles\desktop\package.json` 的 `dsh.profile.bundles` 包含
  `dsh-private-remote`，依赖是
  `"dsh-private-remote": "link:C:/git/dsh-private-remote/bundle"`；
- 安装动作通过官方插件管理器的 `install_bundle` 完成，没有修改官方安装目录或分叉客户端。

用 Cordis Inspect 对运行中的官方 Desktop 查询 Slot（本机 live 页面），3 个 occupant
均为 `active: true`：

| Slot | occupant |
| --- | --- |
| `conversation.header.leading` | `private-remote` 顶部状态胶囊（单槽位） |
| `settings.section` | `private-remote`（order 30） |
| `conversation.session.header.utilities` | `private-remote-workspace`（order 20） |

侧栏入口、主面板和右下角悬浮胶囊已移除。这说明“安装到官方 Desktop + 顶部状态胶囊 +
设置页 + 会话标题挂载”已经在真实运行实例中生效。**人工视觉验收**（顶部胶囊、设置页、
连接、看卡片样式）仍建议由用户完成。

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

### 4.2 GitHub 仓库地址安装验证（官方“添加插件”对话框）

仓库根目录现在是合法 bundle（`package.json` 含 `dsh.bundle` / `dsh.client`，runtime
文件在根目录）。在另一个全新的 `DSH_HOME=/tmp/dsh-github-test2` 中执行：

```bash
dsh plugin --profile web add https://github.com/MikyWang/dsh-private-remote
```

结果：

```text
dependencies:
+ dsh-private-remote 0.1.0
dsh --profile web --dump-config:
  # == dsh-private-remote
  - id: private-remote
```

安装目录包含 `index.js`、`client.js`、`cordis.patch.yml`、`host/`、`shared/`、
`locale/`；`package.json.dsh.bundle.patch` 指向 `./cordis.patch.yml`。这对应官方
Desktop“插件 → 添加插件”对话框的 GitHub 仓库地址输入，不需要 npm 发布或 Release
资产。Windows 上的 `desktop` profile 同样要先由 Desktop 初始化，安装时完全退出。

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

- **已实现并验证**：构建/静态检查/单元测试/本机双实例完整闭环/官方 Desktop 3 个挂载点
  （顶部状态胶囊、`settings.section`、会话标题胶囊）/Settings 保存、恢复默认与远端
  active 拒绝保存（Windows 复测见第 8 节）。
- **已实现但待验证**：真实 Windows + macOS 双机、Tailscale/防火墙、人工视觉验收、
  计时提问分支、Windows 路径细节。
- **尚未实现**：文件预览、远程终端、除本插件设置外的模型/插件设置、斜杠命令执行、
  多 Host 同时切换、按设备吊销、审计日志、自动重放修改类请求。

本报告不把第 3 节的本机双实例称为“真实双机”，也不把第 4 节的挂载点称为“人工视觉
验收完成”。

## 8. Windows 复测（2026-10-25，Settings 设置页）

环境：Windows 11 x64，官方 Desktop `0.2.1-rc.3`，Node `v24.16.0`（构建）/ `v24.21.0`
（Desktop 运行时），pnpm `11.25.0`，本地 Ollama `deepseek-v4.1-flash:1017-cloud`。
隔离 E2E 使用 `.tmp/e2e-home` / `.tmp/e2e-client-home`，端口 18080（Host web）、
18081（Client web）、18082（Host 桥）、18083（Client 作为 Host 时的桥）。

### 8.1 静态检查与单元测试

```text
npm run check
checked syntax: 45 JS files
static checks passed

npm test
tests 39
pass 39
fail 0
```

新增 `test/unit/settings.test.mjs` 覆盖：设置 entry 查找、配置合并保留未知字段、
设置比较、私网/Tailscale/ULA 地址过滤与排序、`probeBind` 占用/空闲端口、
`assertLocalBindAddress` 的本机接口校验。`config.test.mjs` 增加 client 模式保留
bindHost、role=both 和非法地址。

### 8.2 构建与产物

```text
npm run build
built bundle/ (24 files, 0.1.0, protocol 1)

npm run verify
bundle verified: dsh-private-remote@0.1.0, 24 hashed files
```

`bundle/` 新增 `host/settings.js`；`verify` 增加 `settings.section` 和该文件的检查。

### 8.3 本机双实例 E2E（PASS）

```text
- host bridge listening on 127.0.0.1:18082
- persisted pairing stays local at boot; local /api works; no boot-time Gateway switch
- settings editor writable; 6 local address suggestion(s)
- public bind address rejected before the profile was written
- occupied Host bridge port rejected before reload
- settings saved without restart; role=both Host bridge listens on 127.0.0.1:18083
- Host token removal and startHost recovery work
- settings reset removed the profile override and stopped the Host bridge
- wrong pairing token rejected; mode stays local
- control channel rejects an unauthenticated browser
- paired with E2E Host (win32, version unknown)
- remote mode active in the local Host switch
- settings write blocked while remote is active; remote mode unchanged
- remote settings/describe forwarded for the Desktop locale/bootstrap
- remoteAccess/follow owner baseline through local mux
- non-allowlisted endpoint denied through the switch
- remote workspace baseline through local mux: 1 workspace(s)
- remote session list through local /api: N entries; target found
- remote session page through local /api: N records
- new remote session created through the switch: session-...
- $events stream through local mux forwarded to the remote Host
- session/follow stream through local mux forwarded to the remote Host
- prompt accepted; assistant streaming frames delivered through the switched mux
- remote assistant reply through local /api: "REMOTE-OK-..."
- remote cancel confirmed by the Host: turn ended as aborted; task stopped, not misreported
- new remote session created through the switch: session-...
- remote approval/request delivered through the switched mux (pwsh)
- approval answered through the switch; the Host executed the approved tool call
- new remote session created through the switch: session-...
- remote user-questions/request delivered through the switched mux (q1)
- blocking question answered through $events/result; the Host tool call received the reply
- explicit disconnect returns to local mode, keeps the saved URL and restores local /api
- explicit local mode restored local /api (0 local sessions)
PASS local two-instance integration (token and cookie redacted)
```

> 注：第 3 节的 `persisted pairing restored as remote-offline` 是 0.1.0 早期行为；
> 当前版本重启保持 local，原因见 8.6。

补充说明：

- 本机 44620-48715 端口段被 WSL2 保留，不是进程占用：`.wslconfig` 使用
  `networkingMode=mirrored`，WSL Ubuntu-22.04 的 `net.ipv4.ip_local_port_range` 正好是
  `44620 48715`。plain Node 在 44620/45000/47821/48715 上 `listen` 都返回
  `EADDRINUSE`，而 44619/48716/18082/58080 可以绑定；`Get-NetTCPConnection`、
  `netstat -ano` 都看不到 47821 的监听者，TCP connect 也失败。非 exclusive 的 .NET
  TcpListener 返回 WSAEACCES（`access permissions`），与 Windows 端口保留一致。因此
  E2E 改用 18xxx；默认 47821 在这台 Windows 上不可用，Host 端口用 18082。
- 审批测试在 Windows 上使用 `pwsh` 工具，而不是 macOS 的 `bash`；测试已按平台选择。
- E2E 的隔离 Host/Client 都禁用 HMR（`test/e2e/host-patch.yml` /
  `test/e2e/client-patch.yml`），避免 Windows 上 profile `package.json` 写入触发
  webserver 二次绑定；生产 profile 的 HMR 不受影响。
- 测试脚本不打印启动 token、配对 token 或 cookie。

### 8.4 真实 Desktop 设置页的 method 修复

首次在真实官方 Desktop 打开 **设置 → 私人远程** 时，状态请求报
“操作失败：方法与控制端点不一致”。根因不在设置页，而在控制路由的 envelope 校验：

- 官方 `@deepseek-ai/dsh-client-connection` 的
  `ctx.connection.rpc.call('/private-remote', 'status', ...)` 向
  `/private-remote/status` POST，body 的 `method` 是**裸 endpoint `status`**；
- 控制路由当时却要求 `method === 'private-remote/status'`；
- 旧的 E2E `control()` helper 恰好也写了带前缀的 `private-remote/status`，所以自动化
  没有覆盖真实客户端的格式。

修复：

- `src/host/control-route.js` 同时接受裸 `status` 和旧的 `private-remote/status`；
- `test/e2e/local-two-instance.mjs` 的 helper 改成官方裸 `method`，后续 E2E 会覆盖
  真实客户端的 envelope；
- `docs/PROTOCOL.md` 的控制通道示例改为 `method: "<action>"`。

修复后 `npm run check`、`npm test`（38）和完整 E2E（含设置页保存/重置、远端 active
拒绝、审批/提问）再次通过。live Desktop 的 plugin row 已重新加载，`settings.section`
仍为 active。

### 8.5 真实双机与人工视觉

仍未执行：本机没有第二台 Tailscale 机器。官方 Desktop 的 Settings 页注册、保存、
Host 桥启停已经通过 live slot/控制通道检查；像素级样式和真实双机连接需要人工验收。

本机 `desktop` profile 已安装为 `link:C:/git/dsh-private-remote/bundle`。安装后通过
Cordis Inspect 查询 `settings.section`，occupant `private-remote`（order 30）为 active；
`conversation.header.leading` 的顶部状态胶囊为 active，`conversation.session.header.utilities`
的 `private-remote-workspace` 也保持 active。`sidebar.panellist`、`main` 和 `shell.overlay`
的旧挂载已移除。Host 侧保存/重置由第 8.3 节 E2E 覆盖；官方 Desktop 页面里的实际点击和
像素验收仍需人工完成。

### 8.6 macOS web-boot 启动失败修复（2026-10-25）

用户提供的 macOS crash log：
`/Users/wangqiyuan/Library/Logs/DeepSeek Harness/crash-2026-10-25T06-14-47-677Z-web-boot.log`
（也复制到本机 `C:\Users\milkspun\Desktop\crash-2026-10-25T06-14-47-677Z-web-boot.log`）。

日志要点：

```text
Error: web boot: 50 entries did not activate
@deepseek-ai/dsh-client-locale: loading
@deepseek-ai/dsh-client-ui-*: pending (waiting for service: locale)
```

说明不是某个 UI 组件报错，而是官方客户端启动时 **locale 服务一直 loading**，其余 50 个
client 插件都在等它。根因有三条：

1. 旧版 Host 进程启动/重启时只要 `client.json` 存在，就会安装 Gateway switch 并进入
   `remote-offline`；旧版显式 `disconnect` 也保留这个状态。此时页面重载会触发官方客户端
   的 `$events`/settings 启动请求，被 switch 拦截/失败，client 插件树无法 activation；
   设置页也打不开，用户无法切回本机。
2. 远端桥的 allowlist 拒绝了 `settings/describe`。官方 Desktop 的 `__DSH_LOCALE__.read()`
   会通过 `/api/settings/describe` 读取语言偏好；没有这个只读端点，即使远端连接 active，
   locale bootstrap 也会失败/pending。
3. Desktop 主进程的 welcome/locale bootstrap 用本地 owner API Peer 发
   `settings/describe`；switch 原来只接受 `connection.browserPeer`，会拒绝这个非浏览器
   Peer。现在只对 `settings/describe` 放行 owner API Peer，其他端点和流仍只接受
   browserPeer。

修复：

- `ensureSwitch` 不再仅凭 `client.json` 安装 switch；Host 进程重启后保持 **local**，
  `client.json` 只预填设置页的 URL/标签，用户必须重新输入令牌并显式连接；页面重载沿用
  当前 Host 进程内存里的 switch 状态。
- 显式 `disconnect` 卸载 switch、回到 local，保留 `client.json` 的 URL/标签；
  `remote-offline` 只保留给已加载页面上的意外断线。
- allowlist 增加只读 `settings/describe`（Host API controller 固定
  `redactSecrets: true`）和 `remoteAccess/follow`（owner 基线流）；`settings` 写操作仍拒绝。
- switch 对 `settings/describe` 放行本地 owner API Peer（Desktop welcome/locale
  bootstrap），其他端点和所有流仍只接受 browserPeer；新增单元测试覆盖 owner/browser/
  viewer 三种 Peer。
- E2E 现在会在启动前 seed 一个无令牌的 `client.json`，断言：
  - `mode=local`、`remote.installed=false`、本地 `/api` 可用；
  - 远端 active 时 `settings/describe` 和 `remoteAccess/follow` 都转发成功；
  - `settings/describe` 响应含 `locale` namespace（Desktop locale bootstrap 需要）；
  - 显式 `disconnect` 回 local 并保留 URL，`useLocal` 清空。

macOS 恢复/更新步骤（旧版已装，需换到修复版）：

1. 错误页点 **“禁用第三方插件、备份 profile patch 并重启”**；或完全退出应用后删除
   `~/.dsh/private-remote/client.json` 再启动。不要再点只“重启”，否则旧版会继续装
   remote-offline switch。
2. 应用回到本地后，在插件页**移除**旧的 `dsh-private-remote`，再从
   `https://github.com/MikyWang/dsh-private-remote` 安装最新提交；只重新启用旧安装副本
   仍然会跑旧代码。
3. Windows Host 也要 reload 到包含新 allowlist 的版本（插件 row 重启或重启 Desktop）。
4. Mac 打开 **设置 → 私人远程**，填 Windows 的 `http://100.68.241.8:18082` 和 Host 令牌，
   测试连接后进入远程。
