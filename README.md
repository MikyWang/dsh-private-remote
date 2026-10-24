# 私人远程 · dsh-private-remote

一个供个人使用的 DeepSeek Harness 远程连接插件。它把另一台电脑上的官方 Harness
Host 接到当前官方 Desktop 里：工作区、会话历史、模型请求、工具执行、审批和提问
仍然由远端 Host 管理，界面仍然使用官方现有的会话界面，而不是另做一个网页或只显示
连接状态的面板。

- 包名：`dsh-private-remote`
- 界面名称：私人远程
- 版本：`0.1.0`（协议 1）
- 已验证的 Harness：`0.2.1-rc.3`
- 仓库：<https://github.com/MikyWang/dsh-private-remote>
- 当前状态：已构建、已安装到本机官方 Desktop 的 `desktop` profile，并完成本机双实例
  联调；真实 Windows + macOS 双机尚未验证（见“验证状态”）。

## 一、它做什么

同一套代码按配置承担两种角色：

| 角色 | 运行位置 | 作用 |
| --- | --- | --- |
| `client` | 你正在看的官方 Desktop | 保留官方界面；把本机 Gateway 的普通 `/api` 调用和 `/api/remote.mux` 流统一切换到已配对的远端 Host；提供“私人远程”面板和状态显示。 |
| `host` | 另一台电脑上的 Harness | 在私网/Tailscale IP 上另开一个认证桥，只转发白名单内的官方会话、工作区、审批和提问接口；不复制会话数据库，不重写 Agent 循环。 |

连上远端后：

- 官方侧栏、会话列表、历史、输入框、流式回复、停止按钮、审批卡片和提问卡片仍然由
  官方 UI 渲染。
- 所有模型请求、工具执行、项目文件和权威会话记录都在远端 Host 上发生。
- 客户端页面顶部/底部和会话标题旁会显示当前 Host、工作区和连接状态。
- 远端断开时，提交会被拒绝并显示“远端已断开”，不会悄悄改在本机执行。
- 点“切换回本机”后，官方 UI 恢复读取本机的工作区和会话；Host 上正在跑的任务不会
  被取消。

## 二、不做什么

第一版明确不包含：

- 公共账号平台、自建打洞/中继服务、手机 App；
- 远程桌面、独立浏览器页面、PWA 或 `dsh web` 访问说明；
- 文件同步、文件预览、远程终端、模型/插件设置页面；
- 多活动远端 Host 同时切换（同一时刻只保留一个）；
- 把 Host 的模型 API Key 复制到客户端；
- 自动批准工具调用，或绕过官方审批/提问流程。

## 三、工作方式（一页）

```text
官方 Desktop（客户端机器）                         远端 Harness Host（另一台机器）
┌──────────────────────────────┐                  ┌──────────────────────────────┐
│ 官方会话 UI                  │                  │ 官方会话 UI（本地使用）      │
│   │ /api、/api/remote.mux    │                  │                              │
│   ▼                          │                  │                              │
│ 本机 Typert Gateway          │                  │ 本机 Typert Gateway          │
│   │ Gateway switch（插件）   │   加密 HTTP/SSE  │   ▲                          │
│   ▼                          │  ──────────────► │   │ BridgeServer（插件）     │
│ 本机 BridgeClient ───────────┼──────────────────┼───┘ 只转发白名单端点        │
│ 控制通道 /private-remote     │                  │ 独立端口，绑定私网/Tailscale │
└──────────────────────────────┘                  └──────────────────────────────┘
```

客户端不是“改一个 URL”：普通 RPC、WebSocket 流、事件流、认证、会话选择都经过同一个
已认证桥；远端工作区/会话/缓存以 Host 身份隔离。实现细节见
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 四、安装

### 4.1 本机（已完成的安装）

当前这台 macOS 上的官方 Desktop 使用 `desktop` profile。插件已经以本地链接方式安装：

```text
~/.dsh/profiles/desktop/package.json
  dsh.profile.bundles: [..., "dsh-private-remote"]
  dependencies: { "dsh-private-remote": "link:/Users/wangqiyuan/Documents/git/dsh-private-remote/bundle" }
```

安装动作本身走官方插件的 bundle 机制；没有修改官方安装目录，也没有分叉官方客户端。
本仓库重新构建后，`bundle/` 是链接目标；Host 侧的代码需要重启 Harness 才会重新加载，
客户端 UI 在刷新页面后加载新的 `client.js`。

手动安装（任意 profile）可用官方 CLI：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-private-remote/bundle
```

或在当前 Desktop 里用插件管理器的 `install_bundle` 指向 `bundle/` 目录。`desktop`
profile 由 Electron 独占启动，不能直接用 `dsh --profile desktop` 启动；安装/管理请走
官方插件管理器或 `dsh plugin`。

### 4.2 Windows Host

1. 先按 4.3 或 4.4 在 Windows 上安装插件（Release 资产或 GitHub 仓库地址，不需要复制源码目录）。
2. 在 profile 的 `cordis.patch.yml` 增加 Host 配置（`bindHost` 改成该机的 Tailscale IP）：

```yaml
- id: private-remote
  config:
    role: host
    bindHost: 100.68.241.8
    port: 47821
    label: Windows 工作站
```

3. 重启 Harness。打开“私人远程”面板，应看到“监听中”、监听地址和配对令牌。
4. Windows 防火墙只放行 Tailscale 私网到 TCP 47821（示例，管理员 PowerShell）：

```powershell
New-NetFirewallRule -DisplayName "DSH Private Remote" `
  -Direction Inbound -Protocol TCP -LocalPort 47821 `
  -RemoteAddress 100.64.0.0/10 -Action Allow -Profile Private
```

不要绑定 `0.0.0.0`，也不要把端口映射到公网。插件的配置校验只接受回环、RFC1918、
Tailscale `100.64/10`、IPv6 私网或 `*.ts.net` 这类私网地址。

### 4.3 从 GitHub Release 直接安装（Windows / 任意机器）

仓库与发布页：<https://github.com/MikyWang/dsh-private-remote>

发布资产：`dsh-private-remote-0.1.0.tgz`

Windows 上先正常打开一次官方 Desktop，让 `desktop` profile 初始化，然后**完全退出**
Desktop（不是最小化），在 PowerShell 中执行：

```powershell
dsh plugin --profile desktop add `
  https://github.com/MikyWang/dsh-private-remote/releases/download/v0.1.0/dsh-private-remote-0.1.0.tgz
```

`dsh` 不在 PATH 时，换成官方 Desktop 自带的 CLI 完整路径。也可以从仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

安装完成后重新打开 Desktop，打开“私人远程”。macOS/Linux 把同一 URL 交给
`dsh plugin --profile <profile> add` 即可。`desktop` profile 必须由 Desktop 初始化过，
并且安装时 Desktop 要完全退出；这是官方 CLI 的限制。

发布资产就是 `bundle/` 的 `npm pack` 结果；安装时不需要构建，也不需要 npm 账号。

如果要从源码安装：

```bash
git clone https://github.com/MikyWang/dsh-private-remote.git
cd dsh-private-remote
npm run build
dsh plugin --profile <profile> add "$PWD/bundle"
```

### 4.4 在官方“添加插件”对话框里直接添加

仓库根目录现在就是合法的 DSH bundle（`package.json` 含 `dsh.bundle` 和 `dsh.client`），
所以可以直接使用官方 Desktop 的 **插件 → 添加插件** 对话框：

```text
输入：https://github.com/MikyWang/dsh-private-remote
安装源：npm 官方源（默认）
```

点“安装”。插件管理器会把仓库作为 profile 层安装；安装完成后重启/刷新 Desktop，
侧栏出现“私人远程”。如果对话框更愿意接收本地目录，也可以填本仓库的绝对路径。
如果 GitHub 地址安装受网络影响失败，回退到 4.3 的 Release 资产 URL。

## 五、连接

### 5.1 网络

推荐并按当前设计采用 **Tailscale IP 绑定**：

1. 两台机器安装 Tailscale，登录同一个 tailnet。
2. Host 上执行 `tailscale ip -4`，得到 `100.x.y.z`。
3. 把该地址填入 Host profile 的 `bindHost`，重启 Harness。
4. 客户端面板填 `http://100.x.y.z:47821`；令牌从 Host 面板的“显示令牌”复制。
5. Host 面板确认“已连接设备”出现客户端；客户端面板确认模式为“远程”、显示 Host 名称和
   平台。

如果已有可用的 SSH 隧道，也可以把远端桥的 loopback 端口转发到客户端本机，再填
`http://127.0.0.1:47821`；第一版不额外实现多套传输方案。

### 5.2 客户端操作

1. 打开官方侧栏的“私人远程”（中文界面；英文界面显示 Private Remote）。
2. 填远端地址、配对令牌、可选显示标签。
3. “测试连接”只做握手和兼容性检查；“进入远程”会切换 Gateway 并刷新页面。
4. 刷新后官方侧栏显示远端工作区；点工作区，官方会话列表和历史来自远端 Host。
5. 在官方输入框发送消息；流式回复、工具状态、停止、审批和提问都在官方会话界面里完成。
6. 右上角状态胶囊和会话标题旁的胶囊显示当前 Host/工作区/在线状态。
7. “断开连接”保留远端模式但标记离线，拒绝继续提交；“重新连接”需要内存中的令牌，
   重新认证并重新读取状态。
8. “切换回本机”删除配对和本机持久化的 URL/标签，恢复本机数据；Host 任务不取消。

### 5.3 Host 操作

Host 面板显示监听地址、设备名、平台、版本、配对令牌和已连接设备：

- “显示令牌 / 复制”：令牌是机密，不要截图或发到聊天里。
- “轮换令牌”：立即断开所有客户端，旧令牌失效。
- “断开所有客户端”：只断开连接，不取消 Host 上正在跑的任务。
- “删除令牌并停止 Host 桥”：删除官方凭据中的令牌并停止桥，需重启才会生成新令牌。

## 六、安全模型（摘要）

- **私网不等于认证**：桥有自己的应用层认证。握手使用共享令牌的 HMAC 双向证明，
  令牌本身从不传输；随后用 HKDF-SHA256 派生双向密钥，AES-256-GCM 加密每个帧，
  64 位序号 + 滑动窗口拒绝重放/旧帧。
- **客户端先验证 Host**：Host 先出示 `serverProof`，客户端确认后才发送自己的证明，
  避免把凭据送给冒充的端点。
- **只转发白名单端点**：不提供任意 `ctx.invoke`、服务反射、终端、凭据、插件管理或
  通用工具远程入口。白名单见 [docs/SECURITY.md](docs/SECURITY.md)。
- **审批/提问沿用官方流程**：转发官方 `$events` 瀑布事件，答案通过 `$events/result`
  回到同一个 `clientId + eventId`；不默认自动批准。
- **凭据**：Host 令牌保存在官方 credentials 服务（引用名
  `private_remote_host_token`）；客户端令牌只在 Host 进程内存中，不写配置文件或
  localStorage。客户端磁盘只保存远端 URL 和显示标签（`$DSH_HOME/private-remote/client.json`）。
- **日志**：不记录业务负载、令牌、cookie 或模型 Key；只记录控制动作名、连接设备名、
  平台和错误码。
- **已知边界**：客户端重启后必须重新输入令牌；没有按设备单独吊销（只能轮换全部或断开
  全部）；没有独立审计日志；HTTP 只允许私网/Tailscale，公网地址必须 HTTPS；Tailscale
  本身提供 WireGuard 传输加密。

完整威胁模型和“为什么可以创建 owner 等价 Peer”的说明见
[docs/SECURITY.md](docs/SECURITY.md)。

## 七、验证状态

### 已实现并验证

- `npm run check`：语法、静态规则、秘密扫描通过。
- `npm test`：30 个单元测试全部通过。
- `npm run build` / `npm run verify`：生成并校验 23 个文件的 bundle。
- `npm run test:e2e`：本机两个隔离 Harness 实例（Host + Client）跑通：
  远端工作区基线、会话列表/历史、新建会话、发送/流式回复、停止、审批、提问、
  断开后拒绝本地回退、显式切回本机。
- 官方 Desktop 当前 profile 中 4 个挂载点均为 active：
  `sidebar.panellist`、`main`、`shell.overlay`、
  `conversation.session.header.utilities`。
- GitHub Release `v0.1.0` 资产已发布；在全新的 `DSH_HOME` 中用官方 CLI 从 Release URL
  安装成功，`--dump-config` 出现 `private-remote` 行。
- 仓库根目录已改成合法 bundle；用官方 CLI 直接安装
  `https://github.com/MikyWang/dsh-private-remote` 成功，`--dump-config` 同样出现
  `private-remote`。这对应官方“添加插件”对话框的 GitHub 仓库地址输入。

### 已实现但待真实双机验证

- Windows Host + macOS 客户端经 Tailscale 的真实双机连接（本机没有第二台
  Windows/Tailscale 机器）。
- 官方 Desktop 里的人工视觉验收：面板样式、工作区打开、审批/提问卡片在真实会话中的
  显示（自动化已经走过同一套 `/api` 和 mux 路径）。
- 计时提问（`ask_user_question` 带 `timeout`）的 `userQuestions/attachWait` +
  `userQuestions/answer` 分支。端点已加入白名单，但本机隔离 Host 暴露的是阻塞式提问
  schema，自动化覆盖的是阻塞分支。
- Windows 路径大小写/分隔符、Windows 防火墙和 Tailscale 接口绑定行为。

### 尚未实现及原因

- 文件预览、远程终端、模型/插件设置：第一版明确不包含。
- 斜杠命令执行（`commands/execute`）：未加入白名单；普通文字消息、停止、审批、提问
  已覆盖。需要时可评估加入。
- 多远端 Host 同时切换、按设备单独吊销、审计日志：第一版范围外。
- 自动重放修改类请求：没有可靠幂等依据时不自动重放；结果未知时提示用户核对远端会话。

详细测试矩阵、原始命令和环境见 [docs/TEST-REPORT.md](docs/TEST-REPORT.md)。

## 八、故障排查

| 现象 | 检查 |
| --- | --- |
| 面板显示“Host 桥未运行” | profile 里 `role` 是否为 `host`；`bindHost` 是否为合法私网 IP；重启 Harness 后看日志 `host role ready on ...`。 |
| 客户端“测试连接”失败 `remote/auth-failed` | 令牌是否从当前 Host 复制；是否已轮换；Host 是否删除了令牌。 |
| `remote/version-mismatch` | 两端 Harness 版本或协议版本不一致；当前只声明支持 `0.2.1-rc.3` + 协议 1。 |
| `host/bind-invalid` | `bindHost` 不能是 `0.0.0.0`/`::`/公网地址；用 Tailscale IP 或私网 IP。 |
| 连接后看不到远端工作区 | 确认客户端模式是“远程”；刷新页面让官方 UI 重新拉取；检查 Host 上是否已有工作区。 |
| 断开后提交报 `remote/offline` | 这是预期行为；点“重新连接”（需重新输入令牌）或“切换回本机”。 |
| Windows 连不上 | `tailscale ping <host>`；`Test-NetConnection 100.x.y.z -Port 47821`；防火墙是否只放行 Tailscale 网段；Host 是否绑定到该 Tailscale IP 而不是 `127.0.0.1`。 |

插件日志前缀为 `[private-remote][controller]`；不会打印令牌或业务负载。

## 九、回退 / 卸载

1. 在客户端面板点“切换回本机”。这会移除 Gateway switch、删除
   `$DSH_HOME/private-remote/client.json`，并恢复本机 `/api`。
2. 不再需要插件时，从 profile 移除 bundle：
   `dsh plugin --profile <profile> remove dsh-private-remote`，或插件的
   `remove_bundle`；然后重启 Harness。
3. Host 侧如需清理令牌：面板点“删除令牌并停止 Host 桥”，或删除官方 credentials 中的
   `private_remote_host_token`；`$DSH_HOME/private-remote/host-meta.json` 只是 Host 身份，
   不含令牌。
4. 回退后官方工作区和会话仍是本机的；远端 Host 的数据没有被复制或修改。

## 十、开发与测试

```bash
npm run check       # 语法/静态规则/秘密扫描
npm test            # 30 个单元测试
npm run build       # 从 src/ 生成 bundle/
npm run verify      # 校验 bundle 元数据、哈希、客户端加载方式
npm run test:e2e    # 启动两个隔离实例并跑完整联调（需要本地 Ollama）
```

生成 GitHub Release 资产：

```bash
npm run build
npm pack ./bundle --pack-destination dist
# 产物：dist/dsh-private-remote-0.1.0.tgz
```

把该 tgz 作为 `v0.1.0` Release 的资产上传后，Windows 安装命令就是第 4.3 节的 URL。
仓库根目录的 `install.ps1` / `install.sh` 只是把这个 URL 交给官方 `dsh plugin add`。

`npm run test:e2e` 使用 `.tmp/e2e-home` 和 `.tmp/e2e-client-home` 两个隔离
`DSH_HOME`，不会碰你的生产 profile；测试脚本不打印启动令牌或 cookie。测试用的模型是
本机 Ollama 的 `deepseek-v4.1-flash:1017-cloud`，Host patch 在
`test/e2e/host-patch.yml`，只含测试用 dummy key 环境变量名，不含真实密钥。

目录：

```text
src/
  client.js                 官方浏览器 UI 插件（ModuleLoader 经典脚本）
  host.js                   Host 插件入口
  host/controller.js        角色、状态、连接生命周期、控制通道
  host/bridge-server.js     远端认证桥（独立 HTTP + SSE）
  host/bridge-client.js     客户端侧桥客户端
  host/gateway-switch.js    本机 Gateway 双函数切换
  host/compat/              版本相关官方契约适配（集中管理）
  shared/                   协议、白名单、路径、加密通道
  locale/                   zh/en 界面文案
bundle/                     可安装产物（由 build 生成）
scripts/                    构建、检查、校验、双实例 E2E
test/unit/                  单元测试
test/e2e/                   本机双实例联调
docs/                       架构、安全、协议、兼容性、测试报告
install.ps1 / install.sh   从 GitHub Release 安装的辅助脚本
```

## 十一、许可证

MIT，见 [LICENSE](LICENSE)。本包不包含第三方源代码；运行时使用官方 DeepSeek Harness
提供的服务与 React，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
