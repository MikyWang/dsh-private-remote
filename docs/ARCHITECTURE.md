# 架构

## 1. 目标与边界

目标是在官方 Desktop 里继续操作另一台 Harness Host 的工作区和会话。实现原则：

- **官方界面不复制**：不新建会话页面，复用官方 conversation UI、侧栏、审批和提问卡片。
- **Host 是权威**：模型请求、工具执行、项目文件、会话日志、工作区注册表都在 Host 的
  官方服务里；客户端只做转发和展示。
- **一条连接、两种角色**：同一个包按 `role` 配置成 `client` 或 `host`；`both` 只用于
  本机测试。
- **默认拒绝**：远程 Peer 只能调用白名单端点；断线时失败，不回退本地。

## 2. 进程与组件

### 2.1 客户端（官方 Desktop 所在机器）

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| 浏览器 UI 插件 | `src/client.js` | 注册“私人远程”面板、状态胶囊、会话标题胶囊；通过 `ctx.connection.rpc.call('/private-remote', ...)` 调用本机控制通道；调用官方 `uiWorkspace.openWorkspace` 打开远端工作区。 |
| 控制通道 | `src/host/control-route.js` | 在官方 `webServer` 上注册 `/private-remote/*` 前缀路由；用官方 `connection.admit(req)` 校验浏览器 cookie，并要求 Peer 等于 `connection.browserPeer`。 |
| 控制器 | `src/host/controller.js` | 读取配置；创建/关闭 BridgeClient；安装/卸载 Gateway switch；维护 remote/host 状态；持久化 URL/标签；管理 Host 令牌轮换等。 |
| Gateway switch | `src/host/gateway-switch.js` | 替换本机 `typertGateway.dispatchRpc` 和 `openWireStream` 两个数据路径函数。 |
| BridgeClient | `src/host/bridge-client.js` | 与远端 Host 握手、建立 SSE 下行、加密帧、流队列、取消和断线处理。 |

控制通道动作：`status`、`test`、`connect`、`disconnect`、`useLocal`、`reconnect`、
`hostInfo`、`rotateToken`、`dropClients`、`forgetHostToken`。它只接受本机已认证浏览器
Peer；远端桥不能调用控制通道。

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
| `sidebar.panellist` | `private-remote` | 中文“私人远程”侧栏入口和图标。 |
| `main` | key `private-remote` | 主面板：连接表单、Host 信息、工作区列表、断开/切回本机。 |
| `shell.overlay` | `private-remote-status` | 右下角状态胶囊：本地/远程/离线/Host。 |
| `conversation.session.header.utilities` | `private-remote-workspace` | 会话标题旁的 Host/工作区胶囊。 |

连接、断开、切回本机后，面板调用 `window.location.reload()`，让官方 UI 的 store 重新从
当前生效的 Host 拉取工作区/会话，避免把上一模式的内存状态继续画出来。

## 4. 连接生命周期

```text
local ──connect──► remote ──disconnect──► remote-offline ──reconnect──► remote
  ▲                    │                         │
  └──── useLocal ◄─────┴─────────────────────────┘
```

- `local`：switch 未安装；官方 `/api` 走本机。
- `remote`：switch 已安装；BridgeClient 已认证；所有浏览器调用走远端。
- `remote-offline`：switch 仍安装，BridgeClient 为空；所有调用失败并返回
  `remote/offline`。这是防止“远端断了就悄悄在本机执行”的关键状态。
- 客户端重启后，如果磁盘上有 URL/标签，控制器直接恢复为 `remote-offline`，不会自动
  拿旧令牌重连；用户必须重新输入令牌（令牌只在内存）或显式切回本机。
- `useLocal`：断开 BridgeClient、卸载 switch、删除 `client.json`、清空内存令牌。
- `disconnect`：只断开连接，保留 switch 和 URL/标签，进入 `remote-offline`。

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
- 没有独立审计日志；连接历史只在 Host 内存（`clientInfos`）和日志行里。
- 没有自动重连；断线后必须显式“重新连接”，且需要内存中的令牌。
- HTTP 传输依赖 Tailscale/私网或 SSH 隧道；插件不做 TLS 终止，公网地址必须显式
  `https://`，由反向代理负责证书。
