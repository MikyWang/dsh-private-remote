# 架构

## 1. 目标与边界

目标是在官方 Desktop 里继续操作另一台 Harness Host 的工作区和会话。实现原则：

- **官方界面不复制**：不新建会话页面，复用官方 conversation UI、侧栏、审批和提问卡片。
- **Host 是权威**：模型请求、工具执行、项目文件、会话日志、工作区注册表都在 Host 的
  官方服务里；客户端只做转发和展示。
- **一条连接、多种角色**：同一个包按 `role` 配置成 `client`、`host` 或 `both`；`both`
  是正式支持的“既被连又连远端”模式，可在官方 Settings 页选择。
- **默认拒绝**：远程 Peer 只能调用白名单端点；断线时失败，不回退本地。

## 2. 进程与组件

### 2.1 客户端（官方 Desktop 所在机器）

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| 浏览器 UI 插件 | `src/client.js` | 注册顶部状态胶囊、官方 Settings 设置页、会话标题胶囊；通过 `ctx.connection.rpc.call('/private-remote', ...)` 调用本机控制通道；调用官方 `uiWorkspace.openWorkspace` 打开远端工作区。 |
| 设置页 | `src/client.js` 的 `settings.section` | 客户端/Host/两者模式、监听地址/端口/设备名、保存/恢复默认、客户端连接和令牌管理。 |
| 控制通道 | `src/host/control-route.js` | 在官方 `webServer` 上注册 `/private-remote/*` 前缀路由；用官方 `connection.admit(req)` 校验浏览器 cookie，并要求 Peer 等于 `connection.browserPeer`。 |
| 控制器 | `src/host/controller.js` | 读取配置；创建/关闭 BridgeClient；安装/卸载 Gateway switch；维护 remote/host 状态；持久化 URL/标签；管理 Host 令牌轮换、设置保存和 Host 启动等。 |
| 设置持久化 | `src/host/settings.js` + 官方 `configEditor` | 合并 role/bindHost/port/label，预检监听地址/端口，写入 profile 的 `cordis.patch.yml` 并由 Loader 重载插件。 |
| Gateway switch | `src/host/gateway-switch.js` | 替换本机 `typertGateway.dispatchRpc` 和 `openWireStream` 两个数据路径函数。 |
| BridgeClient | `src/host/bridge-client.js` | 与远端 Host 握手、建立 SSE 下行、加密帧、流队列、取消和断线处理。 |

控制通道动作：`status`、`test`、`connect`、`disconnect`、`useLocal`、`reconnect`、
`hostInfo`、`rotateToken`、`dropClients`、`forgetHostToken`、`saveSettings`、
`resetSettings`、`startHost`。它只接受本机已认证浏览器 Peer；远端桥不能调用控制通道。

### 2.2 Host（另一台机器）

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| Host 入口 | `src/host.js` | 导出 `inject = ['connection']` 和 `apply(ctx, config)`。 |
| 控制器 | `src/host/controller.js` | 当 `role` 为 `host`/`both` 时，用官方 `credentials` 取/建令牌，启动 BridgeServer。 |
| BridgeServer | `src/host/bridge-server.js` | 独立 HTTP 服务，绑定私网/Tailscale IP；握手、SSE 下行、加密 RPC 上行；为每个连接创建一个 owner 等价 Peer；只转发白名单端点。 |
| 兼容适配 | `src/host/compat/dsh-0.2.1-rc.3.js` | 集中所有对官方内部契约的假设：`createPeer`、`dispatchRpc`、`openWireStream`、`claimsEndpoint`、`wireStream.failure`。 |
| 安全通道 | `src/shared/secure-channel.js` | 双向 HMAC 证明、HKDF 派生、AES-256-GCM 帧、重放窗口。 |
| 白名单 | `src/shared/allowlist.js` | 唯一权限边界；见 [SECURITY.md](SECURITY.md#3-端点白名单)。 |

Host 的官方 UI 仍然使用本机 Host，不切换到远端；BridgeServer 是**另一个** HTTP 服务，
不挂到官方 `webServer`，避免把远程入口混进官方浏览器路由和 CORS 面。

## 3. 官方会话界面是如何被复用的

官方 UI 的所有业务读取都经过本机 `ctx.typertGateway`：

- 普通调用：浏览器 POST `/api/<endpoint>` → Gateway `dispatchRpc(endpoint, payload, signal, peer)`；
- 流：浏览器 WebSocket `/api/remote.mux` → Gateway `openWireStream(endpoint, payload, uplink, peer, signal, control)`。

插件在客户端模式下只替换这两个函数，其他部分不动：

```text
remote mode active?
  ├─ no  → 返回 remote/offline（绝不调用本机原函数）
  └─ yes → peer 必须是 connection.browserPeer
             ├─ 否 → remote/forbidden
             └─ 是 → BridgeClient.request() / openStream() → 远端 Host
```

因此官方侧栏、会话页、输入框、审批卡片、提问卡片、停止按钮看到的仍然是它们熟悉的
`session/*`、`workspace/*`、`$events` 等端点，只是数据来自远端 Host。客户端没有另写
会话 UI，也没有使用 `setRemoteHost`、`ctx.remote.connect()` 这类不存在的接口。

UI 挂载点（全部由官方 Slot 系统渲染）：

| Slot | id | 作用 |
| --- | --- | --- |
| `conversation.header.leading` | 无（单槽位） | 顶部状态胶囊：Host 监听/未运行、远程已连接/已断开；本地空闲时隐藏。 |
| `settings.section` | id `private-remote`，order 30 | 官方 Settings 页：运行模式、Host 监听地址/端口/设备名、保存/恢复默认、客户端连接和令牌管理。 |
| `conversation.session.header.utilities` | `private-remote-workspace` | 会话标题旁的远端 Host/工作区胶囊。 |

连接、断开、切回本机由设置页的客户端表单/远端摘要触发；成功后调用
`window.location.reload()`，让官方 UI 的 store 重新从当前生效的 Host 拉取工作区/会话。
顶部状态胶囊只订阅 `status` 并轮询，不触发页面刷新。

官方客户端启动还会经本机 Gateway 调用 `settings/describe`（Desktop 的
`__DSH_LOCALE__` 语言 bootstrap 也走它）并打开 `remoteAccess/follow`。switch 必须把这两个
白名单端点转发到远端，否则设置表单/locale 会停在 pending，整个客户端树无法启动。
`settings/describe` 只读且 Host API controller 强制 redact secrets；`settings` 写操作
仍被拒绝。Desktop 主进程使用本地 owner API Peer 发这个启动读取，switch 只对
`settings/describe` 放行 owner API Peer；其他端点和所有流仍只接受 browserPeer。

## 4. 连接生命周期

```text
local ──connect──► remote ──disconnect──► local
  ▲                    │                      │
  └──── useLocal ◄─────┘                      │
remote ──unexpected bridge loss──► remote-offline ──reconnect/useLocal──► local
```

- `local`：switch 未安装；官方 `/api` 走本机。**客户端/Host 进程重启后也停在这里**。
- `remote`：switch 已安装；BridgeClient 已认证；所有浏览器调用走远端。
- `remote-offline`：switch 仍安装，BridgeClient 为空；所有调用失败并返回
  `remote/offline`。它只用于**已加载页面上的意外断线**，防止悄悄在本机执行；不是重启后的
  持久状态。
- 客户端/Host 进程重启后保持 `local`：`client.json` 只预填设置页的 URL/标签，用户必须
  重新输入令牌并显式连接。页面重载沿用当前 Host 进程内存里的 switch 状态（remote active
  仍是 remote，local 仍是 local）；启动时不安装 switch，避免官方客户端的
  `$events`/settings 启动请求失败、整个客户端插件树 pending，应用无法打开设置页来恢复。
- `disconnect`：断开 BridgeClient、卸载 switch、回到 `local`，保留 `client.json` 的
  URL/标签用于下次预填；不删除配对。
- `useLocal`：断开 BridgeClient、卸载 switch、删除 `client.json`、清空内存令牌。
- `reconnect`：只在当前已加载页面里、内存中还有令牌时可用；否则重新输入令牌连接。

### 4.1 设置保存生命周期

```text
Settings 页 → saveSettings
  → 校验 normalizeConfig + probeBind/地址接口检查
  → configEditor.edit(private-remote entry, raw => raw + role/bindHost/port/label)
  → profile cordis.patch.yml 追加/更新 private-remote 覆盖行
  → Loader reconcile：旧 controller dispose（await Host server.close）→ 新 controller apply
  → role 含 Host 则 Host 桥启动；role=client 则停止；client.json 只预填 Settings 表单，
    重启保持 local，不会安装 switch
  → Settings 页轮询 status 确认
```

- `resetSettings` 返回 `inherited` 配置，让 configEditor 删除 profile 覆盖、恢复 bundle 默认。
- 远端连接 active 时保存/重置被拒绝（`host/remote-active`），避免重载悄悄断开远端后
  官方 UI 继续显示远端会话。
- `saveSettings` 在绑定地址/端口变化时先 `probeBind`；如果旧 Host 桥仍占用同一端口，
  改用本机接口地址检查，避免 Windows 上第二个 listener 的 `EADDRINUSE`。
- `startHost` 用于删除令牌后、或绑定失败修正后重新启动 Host 桥；新令牌由
  `getOrCreateHostToken` 生成。

## 5. 数据路径

### 5.1 普通调用

1. 官方浏览器调用本机 `/api/<endpoint>`。
2. Gateway 调用被替换的 `dispatchRpc`。
3. switch 检查 `state.active`、`peer === connection.browserPeer`。
4. BridgeClient 生成请求 id，编码 `INVOKE` 帧，POST `/private-remote/rpc`。
5. Host BridgeServer 解密、校验白名单（`unary`），用该连接的 owner Peer 调用
   `gateway.dispatchRpc(...)`。
6. 官方 Gateway 在 Host 上执行真实业务；结果封装为 `RESULT` 帧，沿 POST 响应返回。
7. 客户端把官方结果原样交还给浏览器 UI。

超时/取消：客户端请求超时或 HTTP 中断会返回 `remote/outcome-unknown`，提示先核对远端
会话；不会自动重放修改类请求。官方 `session/prompt` 携带的 `requestId` 在 Host 侧有
幂等语义，但插件仍不主动重放。

### 5.2 流

1. 浏览器打开 `/api/remote.mux`，Gateway 调用被替换的 `openWireStream`。
2. switch 丢弃本机占位 uplink（官方 Gateway 会先 `return()` 它），调用
   BridgeClient.openStream。
3. 客户端发送 `STREAM_OPEN`；Host 校验白名单（`stream`），用官方
   `gateway.openWireStream(...)` 打开真实流，并 `ok(true)` 确认。
4. Host 的 `pumpStream` 把官方 AsyncIterable 的每个结果编码为 `STREAM_FRAME`，
   通过 SSE 下行发送；结束发 `STREAM_END`，异常发 `STREAM_ERROR`。
5. 客户端 `StreamQueue` 按序交给官方 mux；积压超过 512 帧或 16 MiB 时失败
   （`remote/stream-overflow`），不无限占内存。
6. 浏览器关闭流或切换会话时，客户端发送 `STREAM_CANCEL`；Host abort 官方流并
   `iterator.return()`。客户端断开/退出时，所有流都被取消。

`$events`、`session/follow`、`session/control`、`workspace/follow`、
`userQuestions/attachWait` 都走这条路径。`$events` 的 `ready` 帧带有 Host 生成的
`clientId`，客户端把它用于 `$events/result`。

### 5.3 审批和提问

- Host 端的官方 waterfall（`approval/request`、`user-questions/request`）通过
  `$events` 流转发给客户端；帧里有 `eventId`、`agentId` 和请求内容。
- 客户端 UI 的回答通过 `/api/$events/result` 发送，payload 严格为
  `{args:{clientId, eventId, outcome}}`；Host 端用发起该 `$events` 流的同一个 owner
  Peer 校验 `clientId`，再交给官方 Gateway 的 `receiveRemoteEventResult`。
- 审批 outcome 是官方词汇（`allowed-once`、`rejected` 等）；提问 outcome 是
  `{answers:[{id, selected, custom?}]}`。
- 插件不自动批准；不把审批请求转给别的 Peer；`clientId`/`eventId` 绑定防止答错请求。
- 计时提问（`timeout` schema）走 `userQuestions/attachWait`（stream）+
  `userQuestions/answer`（unary），同样在白名单内；本机阻塞式提问走 `$events/result`。

## 6. 状态与隔离

- **单一活动 Host**：客户端同一时刻只允许一个 BridgeClient；`connect` 会先关闭旧连接。
- **连接替换**：旧 BridgeClient 的 SSE 关闭、所有流 abort、Peer dispose；新连接使用新
  `sessionId`/nonce/密钥。旧帧没有继续进入新连接的通道。
- **页面级刷新**：进入远程/切回本机后刷新页面，官方 UI 的内存 store 重建，重新按当前
  生效的 Host 拉取；插件本身不持久化远端工作区/会话缓存。
- **配置优先级**：bundle 默认值 < profile 的 `cordis.patch.yml` 覆盖。Settings 保存写
  profile 覆盖，第一次保存会把当时的完整配置 pin 到 profile；`resetSettings` 删除覆盖。
  home patch 和命令行 overlay 优先级更高，`configEditor` 会拒绝被它们覆盖的写入。
- **Host 身份**：Host 在 `host-meta.json` 持久化 `hostId`，在 `ready.host` 中报告
  deviceName/hostname/platform/harnessVersion；客户端状态只显示最近一次成功认证的 Host。
  工作区/会话 id 由 Host 的官方服务生成，客户端不按本地路径重建。
- **路径**：`shared/paths.js` 按 Host 报告的 `platform` 处理大小写折叠和分隔符，Windows
  路径由 Windows Host 解释；客户端只用 Host 返回值做包含关系/显示。
- **任务生命周期**：客户端断开、切换、退出都不会主动取消 Host 的 turn；只有用户显式
  “停止”才发 `session/cancel`。重连后重新读历史，不伪造完成/取消。

## 7. 兼容层

所有版本相关代码都在 `src/host/compat/dsh-0.2.1-rc.3.js`，并且 Host 启动时做探针：

- `gateway.dispatchRpc`、`gateway.openWireStream`、`gateway.claimsEndpoint` 必须存在；
- 必须 claim 住 `session/page`、`session/prompt`、`session/follow`、`workspace/follow`、
  `$events/result` 这些端点；
- 任一缺失 → Host 桥不启动，状态里显示 `remote/unsupported`，不猜测接口。

客户端侧不直接依赖官方内部类，只依赖槽位、locale、`connection.rpc` 和
`uiWorkspace.openWorkspace` 这些公开/半公开服务。详见 [COMPATIBILITY.md](COMPATIBILITY.md)。

## 8. 已知架构限制

- 客户端 UI 的“远端工作区列表”来自官方 workspace store，经 `workspace/follow` 转发；
  第一版没有为每个 Host 做持久化缓存命名空间，依赖单一活动 Host + 页面刷新隔离。
- 设置保存通过 configEditor 重载整个插件行；正在连接远端时禁止保存，需先切回本机。
  重载也会断开 Host 客户端，前端会先确认。
- 没有独立审计日志；连接历史只在 Host 内存（`clientInfos`）和日志行里。
- 没有自动重连；断线后必须显式“重新连接”，且需要内存中的令牌。
- HTTP 传输依赖 Tailscale/私网或 SSH 隧道；插件不做 TLS 终止，公网地址必须显式
  `https://`，由反向代理负责证书。
