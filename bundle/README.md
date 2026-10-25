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
- 当前状态：已构建，并在本机官方 Desktop 的 `desktop` profile 中安装；Windows 上的
  本机双实例联调和官方 Settings 设置页已实现。真实 Windows + macOS 双机尚未验证
  （见“验证状态”）。

## 一、它做什么

同一套代码按配置承担三种角色：

| 角色 | 运行位置 | 作用 |
| --- | --- | --- |
| `client` | 你正在看的官方 Desktop | 保留官方界面；把本机 Gateway 的普通 `/api` 调用和 `/api/remote.mux` 流统一切换到已配对的远端 Host；提供顶部状态胶囊和 Settings 设置页。 |
| `host` | 另一台电脑上的 Harness | 在私网/Tailscale IP 上另开一个认证桥，只转发白名单内的官方会话、工作区、审批和提问接口；不复制会话数据库，不重写 Agent 循环。 |
| `both` | 同一台机器 | 同时运行 Host 桥和客户端切换；适合一台机器既被其他电脑连接，又连接远端 Host。 |

`role` 默认是 `client`。现在打开 **设置 → 私人远程** 就能在客户端 / Host / 两者之间
切换，并填写 Host 的监听地址、端口和本机设备名；Host 不再需要手改 YAML 或为改设置而
重启 Harness。

连上远端后：

- 官方侧栏、会话列表、历史、输入框、流式回复、停止按钮、审批卡片和提问卡片仍然由
  官方 UI 渲染。
- 所有模型请求、工具执行、项目文件和权威会话记录都在远端 Host 上发生。
- 客户端页面顶部状态胶囊和会话标题旁会显示当前 Host、工作区和连接状态。
- 远端断开时，提交会被拒绝并显示“远端已断开”，不会悄悄改在本机执行。
- 点“切换回本机”后，官方 UI 恢复读取本机的工作区和会话；Host 上正在跑的任务不会
  被取消。

## 二、不做什么

第一版明确不包含：

- 公共账号平台、自建打洞/中继服务、手机 App；
- 远程桌面、独立浏览器页面、PWA 或 `dsh web` 访问说明；
- 文件同步、文件预览、远程终端，以及除本插件自身设置外的模型/插件设置页面；
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

当前这台 Windows 上的官方 Desktop 使用 `desktop` profile，本机已把插件 link 到本仓库的
`bundle/`（开发期间重新构建即可，不需要重新安装）：

```text
%DSH_HOME%\profiles\desktop\package.json
  dsh.profile.bundles: [..., "dsh-private-remote"]
  dependencies: { "dsh-private-remote": "link:C:/git/dsh-private-remote/bundle" }
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

1. 先按 4.3 或 4.4 在 Windows 上安装插件（Release 资产、GitHub 仓库地址或本地 `bundle/`）。
2. 打开官方 **设置 → 私人远程**，运行模式选 **Host** 或 **两者**，监听地址填该机的
   Tailscale IP。端口默认 47821，但 **本机 WSL2 保留了 44620-48715，47821 在其中，
   请填 18082**；设备名可选，点 **保存并应用**。保存会写入当前 profile 并自动重载
   插件，不需要手改 YAML，也不需要为改设置而重启 Harness。
3. Host 桥启动后，设置页应显示监听地址和配对令牌；顶部状态胶囊显示 **Host · 监听中**。
4. Windows 防火墙只放行 Tailscale 私网到你在界面里选择的 TCP 端口（示例为 18082，
   管理员 PowerShell）：

```powershell
New-NetFirewallRule -DisplayName "DSH Private Remote" `
  -Direction Inbound -Protocol TCP -LocalPort 18082 `
  -RemoteAddress 100.64.0.0/10 -Action Allow -Profile Private
```

不要绑定 `0.0.0.0`，也不要把端口映射到公网。设置页只接受回环、RFC1918、
Tailscale `100.64/10` 或 IPv6 私网地址。

本机特别说明：WSL2 使用 `networkingMode=mirrored` 时，Windows 会保留 WSL Linux 的
临时端口范围。当前 Ubuntu-22.04 的 `net.ipv4.ip_local_port_range` 是
`44620 48715`，所以 44620-48715 内的端口（包括 47821）即使没有进程监听也会
`EADDRINUSE`。实测 44619/48716/18082 可以绑定；Host 端口用 **18082** 即可。

无界面/CLI 环境仍可在 profile 的 `cordis.patch.yml` 写同样的 role/bindHost/port/label；
界面保存会写 profile 覆盖并优先于 bundle 默认值，等价于：

```yaml
- id: private-remote
  config:
    role: host
    bindHost: 100.68.241.8
    port: 18082
    label: Windows 工作站
```

### 4.3 从 GitHub Release 直接安装（Windows / 任意机器）

仓库与发布页：<https://github.com/MikyWang/dsh-private-remote>

发布资产：`dsh-private-remote-0.1.0.tgz`

`v0.1.0` 的 Release 资产早于本次 Settings 设置页；要使用设置页，请用 GitHub 仓库地址
（4.4）或本地 `bundle/` 安装。下一次发布 Release 时会更新资产。

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

安装完成后重新打开 Desktop，打开 **设置 → 私人远程**。
macOS/Linux 把同一 URL 交给 `dsh plugin --profile <profile> add` 即可。`desktop` profile
必须由 Desktop 初始化过，并且安装时 Desktop 要完全退出；这是官方 CLI 的限制。

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
在 **设置 → 私人远程** 里配置。如果对话框更愿意接收本地目录，也可以填本仓库的绝对路径。
如果 GitHub 地址安装受网络影响失败，回退到 4.3 的 Release 资产 URL。

## 五、连接

### 5.1 网络

推荐并按当前设计采用 **Tailscale IP 绑定**：

1. 两台机器安装 Tailscale，登录同一个 tailnet。
2. Host 上执行 `tailscale ip -4`，得到 `100.x.y.z`。
3. 在 Host 电脑打开 **设置 → 私人远程**，运行模式选 Host/两者，监听地址填该
   Tailscale IP，端口选一个空闲端口（默认 47821；本机不可用时改 18082 等），保存。
4. 在客户端电脑打开 **设置 → 私人远程** → 客户端设置，远端地址填
   `http://100.x.y.z:47821`（或你选的端口）；令牌从 Host 设置页的“显示令牌”复制。
5. Host 设置页确认“已连接设备”出现客户端；顶部状态胶囊显示 Host 监听状态，客户端
   设置页/顶部状态胶囊确认模式为“远程”、显示 Host 名称和平台。

如果已有可用的 SSH 隧道，也可以把远端桥的 loopback 端口转发到客户端本机，再填
`http://127.0.0.1:18082`（或你选的端口）；第一版不额外实现多套传输方案。

### 5.2 客户端操作

1. 打开 **设置 → 私人远程**；顶部状态胶囊显示 Host/远程状态，侧栏工作区列表显示远端工作区。
2. 在“客户端设置”填远端地址、配对令牌、可选显示标签。
3. “测试连接”只做握手和兼容性检查；“进入远程”会切换 Gateway 并刷新页面。
4. 刷新后官方侧栏显示远端工作区；点工作区，官方会话列表和历史来自远端 Host。
5. 在官方输入框发送消息；流式回复、工具状态、停止、审批和提问都在官方会话界面里完成。
6. 顶部状态胶囊和会话标题旁的胶囊显示当前 Host/工作区/在线状态。
7. “断开连接”保留远端模式但标记离线，拒绝继续提交；“重新连接”需要内存中的令牌，
   重新认证并重新读取状态。
8. “切换回本机”删除配对和本机持久化的 URL/标签，恢复本机数据；Host 任务不取消。

修改运行模式或 Host 设置会重载插件；如果正在连接远端，设置页会拒绝保存并提示先
“切换回本机”。有 Host 客户端连接时保存也会先确认断开。

### 5.3 Host 操作

Host 设置页显示监听地址、设备名、平台、版本、配对令牌和已连接设备；顶部状态胶囊显示
Host 监听状态。监听地址/端口/设备名和令牌操作都在设置页：

- “显示令牌 / 复制”：令牌是机密，不要截图或发到聊天里。
- “轮换令牌”：立即断开所有客户端，旧令牌失效。
- “断开所有客户端”：只断开连接，不取消 Host 上正在跑的任务。
- “删除令牌并停止 Host 桥”：删除官方凭据中的令牌并停止桥；之后点“启动 Host 桥”会
  生成新令牌，不需要重启 Harness。
- “启动 Host 桥”：用于删除令牌后恢复，或绑定失败修正后重试。

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
  设置页只把 role/bindHost/port/label 写入 profile 的 `cordis.patch.yml`，不写令牌。
- **设置通道只在本机**：`saveSettings` / `resetSettings` / `startHost` 走本机 control route，
  只接受 `connection.browserPeer`；写入走官方 `configEditor`，且只编辑本插件的 profile 行。
  远端桥不能调用这些动作。
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
- `npm test`：38 个单元测试全部通过。
- `npm run build` / `npm run verify`：生成并校验 24 个文件的 bundle。
- `npm run test:e2e`：本机两个隔离 Harness 实例（Host + Client）跑通：
  设置页 configEditor 保存/重置、role=both、Host 桥启停、令牌恢复、远端 active 拒绝
  设置写入、远端工作区基线、会话列表/历史、新建会话、发送/流式回复、停止、审批、提问、
  断开后拒绝本地回退、显式切回本机。
- 官方 Desktop 当前 profile 中 3 个 UI 挂载点均为 active：
  `conversation.header.leading`（顶部状态胶囊）、`settings.section`（设置页）、
  `conversation.session.header.utilities`（会话标题旁的远端工作区胶囊）。
- Windows 本机双实例 E2E（`.tmp` 隔离 `DSH_HOME`）也跑通：设置页 configEditor 写入/
  重置、role=both、Host 桥在 18083 启动、令牌删除/启动恢复，以及远端工作区、会话、
  流式回复、停止、审批（Windows 使用 `pwsh`）和提问。因为本机 WSL2 mirrored 网络保留了
  44620-48715 的 Linux 临时端口段（47821 在其中），测试改用 18080/18081/18082。
  真实 Tailscale 双机仍未验证。
- GitHub Release `v0.1.0` 资产已发布；在全新的 `DSH_HOME` 中用官方 CLI 从 Release URL
  安装成功，`--dump-config` 出现 `private-remote` 行。该 Release 资产早于设置页，见 4.3。
- 仓库根目录已改成合法 bundle；用官方 CLI 直接安装
  `https://github.com/MikyWang/dsh-private-remote` 成功，`--dump-config` 同样出现
  `private-remote`。这对应官方“添加插件”对话框的 GitHub 仓库地址输入。

### 已实现但待真实双机验证

- Windows Host + macOS 客户端经 Tailscale 的真实双机连接（本机没有第二台
  Windows/Tailscale 机器）。
- 官方 Desktop 里的人工视觉验收：顶部状态胶囊样式、设置页样式、工作区打开、审批/提问
  卡片在真实会话中的显示（自动化已经走过同一套 `/api` 和 mux 路径；slot 注册已检查，
  像素级视觉仍需要你打开“设置 → 私人远程”确认）。
- Windows 路径大小写/分隔符、Windows 防火墙和 Tailscale 接口绑定行为（本机 WSL2
  mirrored 网络保留 44620-48715，E2E 只验证了 loopback 的 18xxx 端口）。
- 计时提问（`ask_user_question` 带 `timeout`）的 `userQuestions/attachWait` +
  `userQuestions/answer` 分支。端点已加入白名单，但本机隔离 Host 暴露的是阻塞式提问
  schema，自动化覆盖的是阻塞分支。

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
| 设置页/顶部状态显示“Host 桥未运行” | 运行模式是否为 Host/两者；监听地址是否属于本机接口；保存时的错误信息；修正后点“启动 Host 桥”，或看日志 `host role ready on ...`。 |
| 保存 Host 设置失败 `host/config-invalid` | role/端口/bindHost 不合法；只接受 1-65535 端口和私网/回环地址。 |
| 保存 Host 设置失败 `host/config-save-failed` | 官方 configEditor 不可用，或配置被 home patch/命令行覆盖；查看错误详情，必要时改用 `cordis.patch.yml`。 |
| `host/bind-invalid` | `bindHost` 不能是 `0.0.0.0`/`::`/公网地址；端口可能已被占用或地址不属于本机接口；换一个端口或选择“检测到的地址”。如果 `netstat`/`Get-NetTCPConnection` 看不到监听进程，可能是 WSL2 mirrored 网络保留了 Linux 临时端口段（本机 44620-48715，47821 在其中），用 18082 等段外端口。 |
| 保存时报 `host/remote-active` | 正在连接远端；先“切换回本机”再改设置，保存后重新连接。 |
| 客户端“测试连接”失败 `remote/auth-failed` | 令牌是否从当前 Host 复制；是否已轮换；Host 是否删除了令牌。 |
| `remote/version-mismatch` | 两端 Harness 版本或协议版本不一致；当前只声明支持 `0.2.1-rc.3` + 协议 1。 |
| 连接后看不到远端工作区 | 确认客户端模式是“远程”；刷新页面让官方 UI 重新拉取；检查 Host 上是否已有工作区。 |
| 断开后提交报 `remote/offline` | 这是预期行为；点“重新连接”（需重新输入令牌）或“切换回本机”。 |
| Windows 连不上 | `tailscale ping <host>`；`Test-NetConnection 100.x.y.z -Port <界面端口>`；防火墙是否只放行 Tailscale 网段；Host 是否绑定到该 Tailscale IP 而不是 `127.0.0.1`。 |

插件日志前缀为 `[private-remote][controller]`；不会打印令牌或业务负载。

## 九、回退 / 卸载

1. 在客户端设置页点“切换回本机”。这会移除 Gateway switch、删除
   `$DSH_HOME/private-remote/client.json`，并恢复本机 `/api`。
2. 不再需要插件时，从 profile 移除 bundle：
   `dsh plugin --profile <profile> remove dsh-private-remote`，或插件的
   `remove_bundle`；然后重启 Harness。
3. Host 侧如需清理令牌：设置页点“删除令牌并停止 Host 桥”，或删除官方 credentials 中的
   `private_remote_host_token`；`$DSH_HOME/private-remote/host-meta.json` 只是 Host 身份，
   不含令牌。
4. 回退后官方工作区和会话仍是本机的；远端 Host 的数据没有被复制或修改。

## 十、开发与测试

```bash
npm run check       # 语法/静态规则/秘密扫描
npm test            # 38 个单元测试
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
`test/e2e/host-patch.yml`，只含测试用 dummy key 环境变量名，不含真实密钥。默认端口是
18080（Host web）/18081（Client web）/18082（Host 桥）；Windows 上把 `DSH_CLI` 设为
`...\resources\runtime\cli\bin\dsh.cmd`。47xxx 端口在部分 Windows 机器上被系统/安全
软件占用，所以测试默认改用 18xxx。

目录：

```text
src/
  client.js                 官方浏览器 UI 插件（ModuleLoader 经典脚本）
  host.js                   Host 插件入口
  host/controller.js        角色、状态、连接生命周期、控制通道、configEditor 保存
  host/settings.js          Settings 页使用的配置合并、地址检测和端口预检
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
