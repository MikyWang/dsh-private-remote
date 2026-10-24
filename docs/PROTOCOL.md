# 协议 v1

本文描述客户端 Harness 与 Host Harness 之间的私有桥协议，以及浏览器插件使用的本机控制
通道。协议版本 `1`，插件 `0.1.0`。所有多字节整数为大端；二进制帧在 JSON 里用
base64url（无填充）表示。

## 1. 角色与端点

| 角色 | 谁 | 说明 |
| --- | --- | --- |
| Client | 客户端 Harness 的 `BridgeClient` | 主动连接 Host，发起 RPC/流。 |
| Host | Host Harness 的 `BridgeServer` | 监听私网 IP，认证并转发白名单端点。 |

桥固定在 URL 根路径下：

```text
POST /private-remote/handshake   握手（JSON，明文）
GET  /private-remote/events      下行 SSE（加密帧）
POST /private-remote/rpc         上行 RPC（加密帧，JSON 包装）
```

桥不挂到官方 `webServer`，也不接受带 `Origin` 头的浏览器请求。

## 2. 握手

### 2.1 请求

```json
{
  "v": 1,
  "clientNonce": "<32 字节 base64url>",
  "clientName": "MacBook-Pro.local",
  "clientHarnessVersion": "0.2.1-rc.3",
  "pluginVersion": "0.1.0"
}
```

`clientName` 最长 128，版本字段最长 64，均会去掉控制字符；缺失时用默认值。
请求体上限 8 KiB，Content-Type 必须是 `application/json`，不接受压缩。

### 2.2 响应

```json
{
  "v": 1,
  "sessionId": "<16 字节 base64url>",
  "serverNonce": "<32 字节 base64url>",
  "serverProof": "<32 字节 base64url>"
}
```

失败返回 `{ok:false,error:{code,message}}` 和 HTTP 状态（400/401/403/409/413/429/503）。

### 2.3 证明

`HMAC-SHA256`，key 为令牌的 UTF-8 字节。先 update 字面量
`dsh-private-remote`，然后对每个字段依次 update 一个 NUL 字节和字段字符串：

```text
serverProof = HMAC(token, "dsh-private-remote" \0 version \0 "server"
                   \0 clientNonce \0 serverNonce \0 sessionId)

clientProof = HMAC(token, "dsh-private-remote" \0 version \0 "client"
                   \0 clientNonce \0 serverNonce \0 sessionId
                   \0 clientName \0 clientHarnessVersion \0 pluginVersion)
```

版本字段是十进制字符串 `"1"`。proof 编码为 32 字节 base64url。

客户端先验证 `serverProof`；验证失败立即断开，不发送 clientProof。
clientProof 作为 `x-private-remote-proof` 头出现在 SSE GET 上。Host 常量时间比较，
失败 3 次丢弃该 pending 会话；pending 15 秒过期；同一 IP 每分钟最多 10 次握手。

### 2.4 密钥派生

```text
salt = clientNonce + "|" + serverNonce + "|" + sessionId
c2s  = HKDF-SHA256(ikm=token, salt, info="dsh-private-remote/v1/c2s", 32)
s2c  = HKDF-SHA256(ikm=token, salt, info="dsh-private-remote/v1/s2c", 32)
```

Client 用 c2s 加密、s2c 解密；Host 相反。

## 3. 帧格式

```text
偏移  长度  字段
0     1     版本（1）
1     1     方向（1=C2S，2=S2C）
2     1     帧类型（ASCII）
3     1     保留（0）
4     8     序号（uint64 大端）
12    N     密文（AES-256-GCM）
12+N  16    GCM tag
```

- 12 字节头同时作为 AAD。
- nonce（12 字节）：前 4 字节方向，后 8 字节序号。
- 明文是 JSON（`undefined` 编码为 `null`）。
- 单帧上限 32 MiB（含头/tag）；超限本地拒绝。
- 每个方向独立序号，从 0 开始；接收窗口 1024，允许乱序，拒绝重复/过旧。
- 认证失败或方向/版本/保留字节错误 → 关闭会话（`remote/tampered`/`remote/protocol`）。

## 4. 帧类型

| 类型 | 方向 | payload | 说明 |
| --- | --- | --- | --- |
| `I` INVOKE | C→S | `{id, endpoint, payload}` | 普通 RPC。`payload` 是官方 Gateway 的 `{args:...}` 形状。 |
| `R` RESULT | S→C | `{id, result}` | 普通 RPC 的官方结果信封 `{ok,value}`/`{ok:false,error}`。 |
| `O` STREAM_OPEN | C→S | `{id, endpoint, payload}` | 打开一个流。 |
| `F` STREAM_FRAME | S→C | `{id, frame}` | 官方流的下一帧。 |
| `E` STREAM_END | S→C | `{id}` | 正常结束。 |
| `X` STREAM_ERROR | S→C | `{id, error}` | 流失败，`error` 为 `{code,message,details}`。 |
| `C` STREAM_CANCEL | C→S | `{id}` | 取消流；Host abort 官方 iterator。 |
| `Y` READY | S→C | `{host}` | SSE 建立后的第一帧，携带 Host 信息。 |
| `B` BYE | 双向 | `{reason?}` | 主动关闭；Host 轮换令牌时发 `token-rotated`。 |

`id` 是客户端生成的随机字符串（每个客户端内唯一）。Host 对 `STREAM_OPEN` 先回一个
`R`（`{ok:true,value:true}`），之后帧走 SSE；打开失败也回 `R` 错误。

`READY.host`：

```json
{
  "deviceName": "Windows 工作站",
  "hostname": "DESKTOP-...",
  "platform": "win32",
  "harnessVersion": "0.2.1-rc.3",
  "pluginVersion": "0.1.0",
  "protocol": 1,
  "compat": { "ok": true, "missing": [], "compatId": "dsh-0.2.1-rc.3",
              "supportedHarness": "0.2.1-rc.3", "harnessVersion": "0.2.1-rc.3" },
  "deviceId": "<hostId>",
  "listen": { "host": "100.x.y.z", "port": 47821, "url": "http://100.x.y.z:47821" }
}
```

客户端要求 `protocol === 1`、`compat.ok === true`；若双方都报告了 Harness 版本且不同，
拒绝连接（`remote/version-mismatch`）。版本为空（测试环境）时不做该比较。

## 5. SSE 下行

`GET /private-remote/events?session=<sessionId>`，头：

```text
x-private-remote-proof: <clientProof>
```

成功返回 `200 text/event-stream`，`cache-control: no-cache, no-transform`，
`x-accel-buffering: no`，`Connection: keep-alive`。每条消息：

```text
data: <base64url(encrypted frame)>\n\n
```

注释行 `: ping\n\n` 每 20 秒一次；60 秒无活动视为死连接。SSE 关闭会清理该会话的
Peer、流和 pending 请求。

## 6. 上行 RPC

`POST /private-remote/rpc`，头 `x-private-remote-session: <sessionId>`，body：

```json
{ "frame": "<base64url(encrypted frame)>" }
```

成功时 HTTP 200，body 是 `{ "frame": "<base64url(encrypted RESULT)>" }`。
帧解密/格式错误会直接关闭会话；白名单拒绝返回 `remote/endpoint-denied` 的 RESULT，
不关闭连接。

## 7. 白名单与转发

Host 对 `INVOKE` 要求 `isAllowed(endpoint,'unary')`，对 `STREAM_OPEN` 要求
`isAllowed(endpoint,'stream')`；不匹配立即失败。通过后使用该连接的 owner Peer 调用：

```text
dispatchThroughGateway(gateway, peer, endpoint, payload, signal)
openStreamThroughGateway(gateway, peer, endpoint, payload, signal, control)
```

Host 不解析/改写官方业务参数，不重新实现 Agent 循环。流帧来自官方 AsyncIterable。

上限：4 个客户端；每客户端 32 个活动流；每流 512 帧/16 MiB 积压；超限
`remote/stream-overflow`。请求超时 120 秒。

## 8. 本机控制通道（浏览器 ↔ 客户端 Harness）

浏览器插件用官方 `ctx.connection.rpc.call('/private-remote', action, payload, signal)`
发送，落到官方 `webServer` 的 `/private-remote/<action>`：

```text
POST /private-remote/<action>
Content-Type: application/json
Cookie: <官方浏览器会话 cookie>

{"type":"client-request","rpcId":"...","method":"private-remote/<action>","payload":{...}}
```

成功：

```json
{"type":"server-response","rpcId":"...","result":{"ok":true,"value":{...}}}
```

动作：`status`、`test`、`connect`、`disconnect`、`useLocal`、`reconnect`、`hostInfo`、
`rotateToken`、`dropClients`、`forgetHostToken`。路由先调用官方
`connection.admit(req)`，并要求 admission 的 Peer 恰好是 `connection.browserPeer`；
其他 Peer 一律 403。body ≤ 1 MiB；动作名、方法名、Content-Type 都校验。

`status.value` 的关键字段：

```json
{
  "mode": "local | remote | remote-offline | host",
  "remote": { "installed": true, "active": true, "connected": true,
              "host": { ... }, "url": "...", "label": "...", "error": null,
              "generation": 3 },
  "host": { "enabled": false, "listening": false, ... },
  "clientConfig": { "url": "...", "label": "..." },
  "config": { "role": "client", "bindHost": "127.0.0.1", "port": 47821, "label": "" },
  "configError": null,
  "compat": { ... },
  "protocol": 1,
  "pluginVersion": "0.1.0",
  "supportedHarness": "0.2.1-rc.3",
  "localHarnessVersion": "..."
}
```

`remote.generation` 只在状态里递增，用于显示/调试；数据帧的隔离依靠关闭旧
BridgeClient/SSE/流，而不是客户端侧 generation 过滤。

## 9. 错误码

| code | 含义 |
| --- | --- |
| `remote/offline` | 远端未连接/已断开；调用被拒绝，绝不回退本地。 |
| `remote/outcome-unknown` | 请求超时或中断，Host 可能已执行；先核对远端会话。 |
| `remote/auth-failed` | 令牌不匹配、proof 失败或会话不存在。 |
| `remote/auth-rotated` | Host 轮换了令牌，旧会话被关闭。 |
| `remote/version-mismatch` | 协议/Harness 版本不兼容。 |
| `remote/unsupported` | 官方内部契约缺失，Host 桥未启动。 |
| `remote/endpoint-denied` | 端点不在白名单。 |
| `remote/forbidden` | Peer 不是本机浏览器 Peer，或访问了别的 Peer 的事件。 |
| `remote/payload-too-large` | 帧/请求体超限。 |
| `remote/stream-overflow` | 流积压或流数量超限。 |
| `remote/replay` | 帧序号重复/过旧。 |
| `remote/tampered` | GCM 认证失败。 |
| `remote/protocol` | 帧/握手/JSON 格式错误。 |
| `host/token-missing` | Host 令牌不存在或客户端内存没有令牌。 |
| `host/credentials-unavailable` | 官方 credentials 服务不可用。 |
| `host/bind-invalid` | `bindHost` 不是允许的私网地址。 |
| `host/busy` | 达到最大客户端数。 |
| `host/not-configured` | Host 桥未启动/配置错误。 |
| `host/client-disabled` | 当前实例是 host 角色，客户端动作不可用。 |
| `remote/already-connected` | 该握手会话已经连接。 |

官方 Gateway 的错误码（如 `gateway/bad-request`、`gateway/arguments-invalid`）原样透传。

## 10. 版本与兼容

- 协议版本是每个加密帧头和握手的一部分；不匹配直接拒绝。
- Harness 版本来自 `DSH_CLIENT_VERSION`/`DSH_VERSION`；两端都非空且不同则拒绝。
- 内部官方契约集中在 `host/compat/dsh-0.2.1-rc.3.js`，Host 启动时探针；
  缺失时 `compat.ok=false`，Host 桥不启动。见 [COMPATIBILITY.md](COMPATIBILITY.md)。

## 11. 不在协议内

- 多 Host 路由/中继、NAT 打洞、账号登录；
- 文件同步/上传协议；
- 任意服务调用或通用工具 RPC；
- TLS 握手（由 Tailscale/反向代理/SSH 隧道提供传输层）。
