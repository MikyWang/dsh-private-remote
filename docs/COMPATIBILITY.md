# 兼容性

> 当前版本为 **Tailscale-only、无配对令牌**。设置页只保存 role/port；Host 自动绑定
> 检测到的 Tailscale IPv4；客户端只填 Host 的 Tailscale URL。本文中 token、bindHost、
> label 的历史段落已过时，以 README 为准。

## 1. 已验证组合

| 组件 | 版本/环境 | 状态 |
| --- | --- | --- |
| DeepSeek Harness Desktop | `0.2.1-rc.3`（Windows 11 x64，Electron） | 已验证安装、本机双实例 E2E、设置页 configEditor、3 个 UI 挂载点 |
| 随 Desktop 的 Harness/CLI | `0.2.1-rc.3` | 已验证 |
| Cordis | `4.0.5` | 由官方 Desktop 提供，未单独锁定 |
| Node.js | `v24.21.0`（Desktop 运行时）/ `v24.16.0`（本机构建） | 已验证构建/测试 |
| pnpm | `11.28.5`（Desktop 内置）/ `11.25.0`（本机） | 已验证 profile 安装 |
| 插件 | `0.1.0`，协议 `1` | 已验证（含 Settings 设置页） |
| macOS 客户端 | `0.2.1-rc.3` | 早期版本已验证；本次设置页变更未在 macOS 复测 |
| Windows Host | Windows 11 x64 | 本机 loopback E2E 已验证；Tailscale/防火墙真实双机未验证 |
| 其他 DSH 版本 | — | **不支持**；见第 5 节 |

本机环境（早期验证）：macOS `27.0.1` arm64，Desktop Host `127.0.0.1`，
`DSH_HOME=/Users/wangqiyuan/.dsh`，`DSH_PROFILE=desktop`。本轮环境：Windows 11 x64，
Desktop `0.2.1-rc.3`，`DSH_HOME=C:\Users\milkspun\.dsh`，`DSH_PROFILE=desktop`；
隔离 E2E 使用 `.tmp/e2e-home` / `.tmp/e2e-client-home`，端口 18080/18081/18082。
这些事实来自已安装版本，不是仓库主干假设。

## 2. 依赖的官方契约

### 2.1 公开/半公开扩展点

| 契约 | 用途 | 稳定性判断 |
| --- | --- | --- |
| `export const inject` / `apply(ctx, config)` | Host 插件入口 | 官方插件模型 |
| `ctx.effect(fn, label)` / `ctx.inject([...], fn)` | 生命周期/服务注入 | 官方 Cordis 用法 |
| `ctx.webServer.register({kind:'prefix', path, handler})` | 控制通道 | 官方 webServer 服务 |
| `ctx.connection.admit(req)`、`ctx.connection.browserPeer` | 浏览器 cookie/Peer 校验 | 官方 connection 服务 |
| `ctx.connection.rpc.call(channel, endpoint, payload, signal)` | 浏览器插件调用本机控制通道 | 官方客户端 connection 服务；POST `<channel>/<endpoint>`，body 的 `method` 是裸 endpoint（如 `status`），不把 channel 写进 method |
| `ctx.configEditor.entries()` / `edit(entry, change)` | Settings 保存 role/port，写 profile 并重载 | 官方 configEditor 服务；只适用于 root-Include 的唯一 entry |
| `ctx.slots.register({ name: 'settings.section', ... })` | 官方 Settings 页 | 官方 Slot 系统；shell 提供内边距/滚动，页面自带标题 |
| `ctx.credentials.resolve/set/unset` | Host 令牌存储 | 官方 credentials 服务；引用名需匹配 `/^[A-Za-z_][A-Za-z0-9_]*$/` |
| `ctx.slots.inject/register` | 顶部状态胶囊、设置页、会话标题胶囊 | 官方 Slot 系统 |
| `ctx.locale.register/bind/subscribe` | 中英文案 | 官方 locale 服务 |
| `ctx.uiWorkspace.openWorkspace(id)` | 打开远端工作区 | 官方工作区 UI 服务 |
| `package.json` 的 `dsh.bundle.patch`、`dsh.client`、`./client` 导出 | bundle 安装与浏览器加载 | 官方 bundle/ModuleLoader 契约 |

浏览器插件用经典脚本：

```js
window.__ModuleLoader__.load({
  id: 'dsh-private-remote',
  factory: (require) => { const React = require('react'); ... return { inject, apply }; },
});
```

### 2.2 内部兼容适配（集中管理）

这些不是公开承诺，全部集中在 `src/host/compat/dsh-0.2.1-rc.3.js`：

| 契约 | 用途 |
| --- | --- |
| `connection.createPeer({ principal:{kind:'owner'}, interactions:'answer' })` | 为已认证连接创建 owner 等价 Peer。 |
| `typertGateway.dispatchRpc(endpoint, payload, signal, peer)` | 普通 RPC 转发。 |
| `typertGateway.openWireStream(endpoint, payload, uplink, peer, signal, control)` | 流打开；`$events` 分支和普通流分支。 |
| `typertGateway.claimsEndpoint(endpoint)` | 启动探针，确认 Gateway 接管了所需端点。 |
| `gateway.wireStream.failure(error)` | 可选；流失败形状。缺失时退回 `gateway/internal`。 |

Host 启动时 `probeGateway` 检查：

- `dispatchRpc`、`openWireStream`、`claimsEndpoint` 必须是函数；
- `claimsEndpoint` 必须 claim 住 `session/page`、`session/prompt`、`session/follow`、
  `workspace/follow`、`$events/result`。

任一缺失：`compat.ok=false`，Host 设置页显示“官方 Gateway 契约不匹配”，桥不启动。插件
不会猜一个相近接口继续跑。

### 2.3 依赖的官方端点/形状

- `/api` 的客户端请求信封：`{type:'client-request', rpcId, method, payload}`；
  服务响应 `{type:'server-response', rpcId, result:{ok,value|error}}`。
- `payload` 对官方 Gateway 必须是恰好一个 `args` 字段。
- `/api/remote.mux` 的 mux 帧：`{type:'item', value:{...}}`、`{type:'open'|'end', streamId, ...}`；
  `$events` 的 `ready` 帧 `{type:'ready', clientId}`；waterfall 帧
  `{type:'waterfall', event, eventId, agentId, request}`。
- `$events/result` 的 args 必须是 `{clientId, eventId, outcome}`；outcome 为官方
  `next`/`result`/`rejected` 形状。
- 官方客户端启动还会 `POST settings/describe`（无参数；Host API settings controller
  内部固定 `redactSecrets:true`）并打开 `remoteAccess/follow` 流（owner 基线）。这两个
  必须在白名单里，否则 Desktop 的 `__DSH_LOCALE__.read()`/设置表单会一直 pending，
  整个客户端树无法启动。`settings/update|mutate|replace` 仍拒绝。
- Desktop 主进程的启动读取使用本地 owner API Peer；switch 对 `settings/describe` 放行
  owner API Peer，其他端点和所有流仍要求 browserPeer。
- `session/list` 的投影字段（`projections.asOfSeq`、`running`、`blank`、`cwd`、
  `projections.values.userQuestions` 等）。
- `session/create` 的 args 是 `{request:{cwd|workspaceId|sessionId|agentPreset}}`。
- `workspace/follow` 首帧是 `{type:'baseline', value:{items, order, archived, pinned}}`。
- `session/follow` 的 args 是 `{request:{address:{kind:'session',sessionId}, assistantStream}}`。
- 官方 approval outcome 词汇：`allowed-once`、`rejected` 等。
- 官方 UI 的 Slot 键：`conversation.header.leading`、`settings.section`、
  `conversation.session.header.utilities`。侧栏入口、主面板和右下角悬浮胶囊已移除；
  顶部状态由 `conversation.header.leading`（single、root-scope、无 registration options，
  注册只传 `{name}`）渲染。
- `settings.section` 的 shell 契约：`.options` 提供 `padding:0 24px 24px` 和滚动；
  registrant 自绘标题；声明 `locale` 才会注入 `t`，owner props 只有 `{close}`。
- `configEditor.entries()` 只返回 parent entry id 为 `include` 且 patch id 唯一的行；
  bundle insert 行在 profile 中表现为 `include:private-remote` / `options.id=private-remote`，
  `edit()` 会在 profile patch 追加/更新 `private-remote` 覆盖行。nested Include、重复 id、
  home patch/命令行覆盖会被拒绝。
- `configEditor.edit()` 的 `reconcileProfilePatches` 会等待旧 fiber dispose 后再激活新
  fiber；插件必须在 dispose 里 await `server.close()`，否则新 listener 可能
  `EADDRINUSE`。本插件的 `BridgeServer.stop()` 已 await server/socket 关闭。

这些形状已经由本机双实例 E2E 实际跑通；升级时必须重新核对。

## 3. 版本门禁

- 握手带协议版本；每个加密帧头也带协议版本。不匹配直接拒绝。
- `ready.host.harnessVersion` 与本地 `harnessVersion()` 都非空且不同 →
  `remote/version-mismatch`。
- `harnessVersion()` 依次读 `DSH_CLIENT_VERSION`、`DSH_VERSION`；测试环境可能为空，
  此时不做 Harness 版本比较（仍比较协议版本和 compat）。
- bundle 的 `package.json` `engines.dsh = "0.2.1-rc.3"`，`SUPPORTED_HARNESS` 同值；
  安装到不满足的 profile 时，官方插件管理器/引擎检查应阻止或警告。

## 4. 安装与 profile

- 官方 Desktop 的 `desktop` profile 由 Electron 独占，不能用
  `dsh --profile desktop` 启动；安装/管理走官方插件管理器或 `dsh plugin`。
- 插件以 `link:` 方式安装到 profile，指向本仓库 `bundle/`。重新构建后 Host 侧代码需
  重启 Harness 生效；浏览器 `client.js` 刷新页面生效。
- Settings 页保存通过 `configEditor.edit()` 写当前 profile 的 `cordis.patch.yml`，并让
  Loader 重载 `private-remote` 行；不需要为改设置重启 Harness。首次保存会把完整配置
  pin 到 profile，`resetSettings` 删除覆盖。
- 隔离测试 profile 是普通 `web` profile，可用
  `dsh --profile web --patch ... --no-open --port ...` 启动。
- 官方 Desktop 的 UI 挂载点已在本机 live 校验；升级 DSH 后应重新用 Cordis Inspect
  查询 Slot，确认 3 个 occupant 仍 active（含 `settings.section`）。

## 5. 升级流程（给未来的自己）

1. 记录新 Desktop/CLI 版本、Node/pnpm、Cordis 版本和构建提交。
2. 从新版本的 `app.asar`/包导出重新核对第 2 节的契约，不参考主干文档代替。
3. 新建 `src/host/compat/dsh-<version>.js`，复制并调整探针/调用；不要在一个文件里
   用运行时分支猜多个版本。
4. 更新 `SUPPORTED_HARNESS`、`PLUGIN_VERSION`（如协议变化还要 `PROTOCOL_VERSION`）、
   `engines.dsh` 和 `docs/COMPATIBILITY.md`。
5. 重跑 `npm run check`、`npm test`、`npm run build`、`npm run verify`、
   `npm run test:e2e`。
6. 在官方 Desktop 重新安装/重载，确认 3 个 Slot、连接、会话、审批、提问、停止，以及
   设置页保存/恢复默认。
7. 记录旧版本是否仍支持；不支持就明确写在本文，不要悄悄放宽版本范围。

## 6. 已知不兼容/未验证

- Windows Host 的 Tailscale/防火墙未实测；本机 loopback E2E 已验证。本机 WSL2 使用
  `networkingMode=mirrored`，其 Linux 临时端口段 44620-48715 会被 Windows 保留；
  默认 47821 在其中，即使无进程监听也 `EADDRINUSE`。Settings 页会显示
  `host/bind-invalid`，换 18082 等段外空闲端口即可。
- 官方 Desktop 页面里的设置页像素级视觉/交互未做自动化验收；slot 注册和
  `settingsWritable` 已通过 live 检查，视觉需人工确认。
- 计时提问 schema 分支未实测；本机隔离 Host 暴露的是阻塞式 `ask_user_question`。
- 斜杠命令 `commands/execute` 不在白名单；官方 composer 的普通文字发送不受影响。
- 非 `web` 客户端平台未验证；bundle 的 `dsh.client.platform` 固定为 `web`。
- 其他 Cordis/DSH 大版本没有兼容承诺。
