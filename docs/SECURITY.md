# 安全模型

本文说明“私人远程”保护什么、信任什么、拒绝什么，以及第一版明确接受的残余风险。
实现以 `0.1.0` / 协议 1 / Harness `0.2.1-rc.3` 为准。

## 1. 资产与信任边界

需要保护的资产：

- Host 上的会话历史、工作区文件、工具执行结果和项目内容；
- Host 上官方凭据服务里的模型 Key、账号凭据等（插件不读取、不转发）；
- 配对令牌（Host 侧）和客户端内存中的令牌；
- Host 的 Agent 执行权限（审批/提问不能被绕过或答错请求）。

信任边界：

```text
[客户端浏览器] ── 本机 cookie/Peer ── [客户端 Harness 进程]
                                          │  加密桥（令牌认证）
                                          ▼
                                   [Host Harness 进程] ── 官方 Gateway ── 官方会话/工具
```

- 私网/Tailscale 只提供网络可达性，**不构成认证**。
- 客户端浏览器与本机 Harness 之间沿用官方 cookie/Peer 认证；插件控制通道只接受
  `connection.browserPeer`。
- 客户端 Harness 与 Host Harness 之间由插件自己的令牌认证和加密通道保护。
- Host 内部仍由官方 Gateway 做端点权限、Peer 生命周期和审批检查；插件没有关闭这些检查。

## 2. 认证与传输

### 2.1 握手

1. 客户端生成 32 字节 `clientNonce`，POST `/private-remote/handshake`，携带协议版本、
   客户端名和版本。
2. Host 生成 32 字节 `serverNonce` 和 16 字节 `sessionId`，返回
   `serverProof = HMAC-SHA256(token, "dsh-private-remote" || version || "server" ||
   clientNonce || serverNonce || sessionId)`。
3. 客户端先验证 `serverProof`，确认对端持有令牌；然后用自己的
   `clientProof`（额外绑定 clientName、clientHarnessVersion、pluginVersion）作为
   SSE GET 的 `x-private-remote-proof` 头。
4. Host 常量时间比较 clientProof；失败计数，3 次后丢弃 pending 会话；同一 IP 每分钟
   最多 10 次握手。
5. 双方用 HKDF-SHA256（salt = clientNonce|serverNonce|sessionId）派生独立的
   C2S/S2C AES-256-GCM 密钥。

令牌本身从不在网络上传输，也不写入日志。Host 先证明自己，避免客户端把 proof 送给
冒充的 Host。

### 2.2 帧

- 12 字节头：协议版本、方向、帧类型、保留字节、64 位序号；头部作为 GCM AAD。
- 96 位 nonce 由方向和序号派生；每个方向独立密钥、独立序号。
- 滑动重放窗口 1024：允许并发 POST 乱序到达，拒绝重复和过旧序号。
- 篡改/认证失败立即关闭会话（`remote/tampered`）。
- 单帧上限 32 MiB，POST 上限 16 MiB，握手 8 KiB；超限在本地拒绝。

### 2.3 传输选择

- `http://` 只允许回环、RFC1918、Tailscale `100.64/10`、IPv6 私网或 `*.ts.net` 等
  私网地址；公网地址必须 `https://`。
- 推荐 Tailscale：它提供 WireGuard 传输加密，插件的应用层加密再保护业务帧。
- 如用 SSH 隧道，把 Host 的 loopback 端口转发到客户端本机即可，不改变认证模型。
- 插件不做 TLS 终止；若通过反向代理暴露，证书和访问控制由代理负责。

## 3. 端点白名单

远程 Peer 被构造为 owner 等价身份后，**白名单是唯一权限边界**。当前只允许：

```text
$events                         stream
$events/result                  unary
agentPresets/list               unary
agentPresets/read               unary
commands/list                   unary
directoryPicker/createDirectory unary
directoryPicker/list            unary
directoryPicker/pick            unary
fileReferences/list             unary
permissionPresets/catalog       unary
session/attachment              unary
session/canOpenWorkspacePath    unary
session/cancel                  unary
session/control                 stream
session/create                  unary
session/follow                  stream
session/fork                    unary
session/initializeDefaultModel  unary
session/list                    unary
session/modelCatalog            unary
session/openWorkspacePath       unary
session/page                    unary
session/projections             unary
session/prompt                  unary
session/rename                  unary
session/search                  unary
session/selectModel             unary
session/updateQueue             unary
session/workspacePathApplications unary
skills/list                     unary
userQuestions/answer            unary
userQuestions/attachWait        stream
workspace/archiveSession        unary
workspace/create                unary
workspace/delete                unary
workspace/follow                stream
workspace/initializeDefault     unary
workspace/insertBefore          unary
workspace/insertSessionBefore   unary
workspace/pinSession            unary
workspace/rename                unary
workspace/unarchiveSession      unary
workspace/unpinSession          unary
```

明确不提供（示例）：`credentials/*`、`settings/*`、`terminal/*`、
`workspaceFiles/*`、`fileUploads/*`、`plugins/*`、`pluginManager/*`、
`inspector/*`、`account/*`、`llm/*`、`subagents/*`、`jobs/*`、`schedules/*`、
`goals/*`、任意 `ctx.invoke`/服务反射/通用工具入口。

白名单中的工作区写操作（create/delete/rename/archive/pin 等）是官方侧栏的显式用户
动作；`directoryPicker/list`/`pick` 是官方“添加工作区”选择器在 Host 上浏览目录所需，
会向已配对客户端暴露 Host 的目录名。它们不是通用文件读取接口，但属于需要理解的
能力面。`session/attachment` 是官方会话附件读取能力，可能返回附件内容。

## 4. 为什么可以构造 owner 等价 Peer

客户端与 Host 之间没有官方账号/设备账号体系可直接复用。用户在方案确认时接受了
“把已配对设备视为该 Host 的 owner 等价客户端”的决定，因此 Host 在**完成上述双向令牌
证明之后**，为该连接创建一个：

```js
connection.createPeer({ principal: { kind: 'owner' }, interactions: 'answer' })
```

这不是：

- 对未认证请求伪造 `owner` 标志；
- 修改 `connection.admit`、`remoteAccess` 或关闭官方权限检查；
- 把公网匿名请求提升为 owner。

它的含义是：持有 Host 配对令牌的设备被视为该 Host 的主人。令牌泄露等同于该设备的
远程访问权泄露。为了限制影响：

- 连接只存在于这个独立的 BridgeServer 会话中，断开即 dispose Peer；
- 只能调用白名单端点；
- 模型凭据、插件管理、终端、任意文件读写等都没有暴露；
- 令牌可轮换、可删除、可断开所有客户端；
- 最多 4 个并发客户端。

残余风险：没有按设备细粒度授权/审计；任何拿到令牌的人都能以 owner 等价身份操作
白名单内的会话和工作区。这是第一版有意接受的范围，不把它描述成多用户隔离。

## 5. 审批与提问

- Host 官方 waterfall 通过 `$events` 转发；请求带 `eventId`、`agentId` 和工具/问题内容。
- 回答走 `$events/result`，payload 严格为 `{args:{clientId, eventId, outcome}}`。
- Host Gateway 校验：Peer 必须是发起该 `$events` 流的同一个 Peer、`interactions` 必须
  是 `answer`、`principal.kind` 必须是 `owner`；`clientId` 必须对应活动事件流。
- 插件不自动批准，不把审批广播给其他客户端，不缓存答案。
- 审批 outcome 使用官方词汇：`allowed-once`、`rejected` 等；拒绝/取消都会写回官方
  会话日志。
- 计时提问的 `userQuestions/attachWait`/`answer` 也绑定 `agentId`/`callId`；阻塞提问
  走 `$events/result` 的 `{answers:[...]}`。
- 请求/响应的 id 由 Host 生成，客户端不能指定任意 `clientId` 去答别人的请求。

## 6. 凭据与存储

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| Host 配对令牌 | Host 官方 credentials 服务，引用 `private_remote_host_token` | 32 字节 base64url 随机值；不写 profile YAML、不写日志。 |
| 客户端令牌 | 客户端 Harness 进程内存 | 连接/重连使用；断开、切回本机、进程退出后清空。 |
| 客户端 URL/标签 | `$DSH_HOME/private-remote/client.json`（0600） | 只含 URL 和显示标签，不含令牌。 |
| Host 身份 | `$DSH_HOME/private-remote/host-meta.json`（0600） | `hostId`，不含令牌。 |
| 浏览器存储 | 不使用 | 客户端 `client.js` 不含 `localStorage`/`sessionStorage` 访问。 |

客户端重启后恢复为 `remote-offline`，必须重新输入令牌；没有把令牌和密文放在一起冒充
安全存储。Host 的模型 API Key 由官方 LLM 插件管理，插件不读取、不复制到客户端。

## 7. 日志与错误

- 日志前缀 `[private-remote]`；只记录控制动作名、连接设备名、平台、IP、错误码和
  端点名，不记录业务负载、令牌、proof、cookie、工具参数或会话内容。
- 控制通道错误返回通用消息；桥错误返回错误码和简短消息，不包含令牌。
- 测试脚本不打印启动 URL 中的 token 或浏览器 cookie；`e2e-local.mjs` 捕获启动输出、
  只在内部使用 URL。
- 静态检查会扫描 `sk-*`、GitHub token、AWS key、Slack token、私钥等模式；仓库和
  bundle 不应包含真实凭据。

## 8. 拒绝服务与资源限制

| 限制 | 值 |
| --- | --- |
| 最大客户端 | 4 |
| 握手超时 / pending 有效期 | 10 s / 15 s |
| 同一 IP 握手速率 | 10 次/分钟 |
| 单帧 / POST / 握手体 | 32 MiB / 16 MiB / 8 KiB |
| 每客户端活动流 | 32 |
| 每流积压 | 512 帧或 16 MiB |
| 心跳 / 死连接 | 20 s / 60 s |
| 重放窗口 | 1024 |
| 请求超时 | 120 s |

超限会明确失败（`remote/payload-too-large`、`remote/stream-overflow`、`host/busy`），
不会无限缓冲。

## 9. 浏览器侧

- 控制通道是官方 `webServer` 上的 `/private-remote/*` 前缀路由，先调用官方
  `connection.admit(req)`，再要求 Peer 恰好是 `connection.browserPeer`。
- 只接受 POST + `application/json`，body ≤ 1 MiB；动作名在白名单内；方法与路径必须
  一致；响应 `no-store`。
- 桥服务器拒绝带 `Origin` 的请求（浏览器跨源），并设置 `nosniff`；不启用 CORS。
- 客户端 UI 不使用 `dangerouslySetInnerHTML`；所有文本由 React 转义。
- Host 令牌只在 Host 面板显示，复制走剪贴板；面板提示不要截图/发聊天。

## 10. 已知残余风险与不在第一版范围

- 令牌是 bearer secret：拿到即拥有该 Host 的白名单能力；没有二次确认、硬件密钥或
  按设备授权。
- 没有逐设备吊销；只能“断开所有客户端”或“轮换令牌”。
- 没有独立审计日志；Host 端只有内存中的连接列表和插件日志。
- 没有 TLS 终止；HTTP 仅限私网/Tailscale，公网必须由外部 HTTPS 代理保护。
- 计时提问分支已加入白名单，但本机自动化只覆盖阻塞式提问。
- 白名单中的目录选择器和附件读取会暴露有限的 Host 文件元数据/内容，这是官方 UI 的
  工作区/附件功能所需，不是通用文件接口。
- 客户端只支持一个活动远端 Host。

## 11. 验证

- 单元测试覆盖：白名单正/负例、握手证明、HKDF 方向密钥、篡改/重放/乱序、超大帧、
  配置校验、路径平台差异、Gateway switch 离线拒绝。
- 本机双实例 E2E 覆盖：错误/过期配对不能调用、审批 `allowed-once` 往返、提问答案
  绑定、断开后 `remote/offline`、显式切回本机。
- 仍待真实双机验证：Windows 防火墙/Tailscale 绑定、真实网络下的证书/隧道、人工
  审批与提问卡片显示。详见 [TEST-REPORT.md](TEST-REPORT.md)。
