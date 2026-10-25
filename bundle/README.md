# dsh-private-remote

在另一台电脑的官方 DeepSeek Harness 界面里，通过 **Tailscale** 使用本机 Host 的工作区、会话、模型和工具。保留官方界面，不复制会话数据库，不另做网页。

> 当前版本 `0.1.0`，Harness `0.2.1-rc.3`。
> **没有配对令牌，也不支持任意监听地址**：Host 只绑定本机检测到的 Tailscale IPv4，安全边界是 Tailscale 设备身份和 ACL。任何能访问该端口的 tailnet 设备都会被当作 Host 的 owner。

## 一、两种角色

| 角色 | 位置 | 作用 |
| --- | --- | --- |
| `client` | 你正在看的官方 Desktop | 把本机 Gateway 的 `/api` 和 `/api/remote.mux` 切到远端 Host；提供顶部状态胶囊和设置页。 |
| `host` | 另一台电脑上的 Harness | 在 Tailscale 地址上监听，只转发白名单内的官方会话、工作区、审批/提问接口；不复制会话数据库。 |
| `both` | 同一台机器 | 既提供 Host，又连接另一台 Host。 |

核心路径是：

```text
官方 UI → 本机 Harness Gateway → 远端 Harness Gateway → 官方 session/workspace API
```

## 二、前提

1. 两台机器都安装并登录 **同一个 tailnet** 的 Tailscale。
2. 两台机器都安装 **DeepSeek Harness 0.2.1-rc.3**。
3. Host 端必须有 Tailscale IPv4（`100.64.0.0/10`）；没有就启动/登录 Tailscale。
4. 用 **Tailscale ACL** 限制哪些设备能访问 Host 的端口。没有应用层令牌可以替代这一步。

## 三、安装

在 Host 和 Client 两台机器上安装同一个 bundle：

1. 打开官方 **插件 / Plugins** 页面。
2. 添加 GitHub 仓库地址（不是旧的 `v0.1.0` Release 资产）：
   `https://github.com/MikyWang/dsh-private-remote`
3. 启用 `dsh-private-remote`。

本机开发也可以用 `link:` 指向 `C:/git/dsh-private-remote/bundle`。

## 四、Host 设置

1. 打开 **设置 → 私人远程**。
2. 运行模式选 **Host** 或 **两者**。
3. 端口默认 `18082`，可改；Host 只监听本机 Tailscale IPv4，不能选回环/私网/公网地址。
4. 保存后 Host 桥自动启动。页面显示：
   - Tailscale 监听地址：`http://100.x.y.z:18082`
   - 本机设备名（来自系统主机名/握手）
   - 已连接设备
5. Windows 防火墙只放行 **Tailscale 网段** 到该 TCP 端口；不要映射到公网。

Host 端没有令牌、没有“显示/轮换令牌”，也没有“删除令牌”。需要停止监听时点 **停止 Host 桥**；再点 **启动 Host 桥** 恢复。

## 五、Client 设置

1. 在 Client 的 **设置 → 私人远程**，运行模式选 **客户端** 或 **两者**。
2. 在“Host 地址”填 Host 页面显示的 Tailscale 地址：
   `http://100.x.y.z:18082`
   可以省略 `http://` 和端口；默认端口 `18082`。
3. 点 **测试连接**，成功后点 **进入远程**。页面会刷新，官方侧栏显示远端工作区。
4. 顶部状态胶囊显示 `远程 · <Host>`；会话标题旁显示远端工作区。
5. 没有令牌输入框，也没有“显示标签”；远端显示名来自 Host 的设备名。

### 断开与重连

- **断开连接**：关闭远端连接，卸载 Gateway switch，回到 **本地模式**；保留上次的 Host 地址以便预填。
- **切换回本机**：回到本地并清除保存的 Host 地址。
- **意外断线**：已加载页面进入 `remote-offline`，提交被拒绝，不会悄悄在本机执行；点断开/重新连接。
- **Host 进程重启**：客户端回到本地模式，只预填地址；重新点“进入远程”即可，不需要令牌。
- 页面重载沿用当前 Host 进程内存里的 switch 状态；remote active 仍是 remote，local 仍是 local。

## 六、安全模型（重要）

- **没有应用层配对令牌**。Host 桥接受任何能连上 `TailscaleIP:port` 的客户端，并把它当作 owner 等价 Peer。
- 传输层仍有一个固定的公开协议 key，用于协议分帧/版本隔离，**不是认证秘密**；真正的认证是 Tailscale 的 WireGuard 设备身份。
- 远程只读 `settings/describe` 由 Host API controller 强制 redact secrets；`settings/update|mutate|replace` 仍拒绝。
- 白名单限制会话/工作区/审批/提问等官方端点；终端、文件预览、插件管理、模型 Key、任意服务调用仍不暴露。
- 任何拿到该 Tailscale 地址访问权的人都能操作 Host 上白名单内的会话和工作区。**请用 Tailscale ACL/设备授权限制**，不要把端口暴露到公网。
- 日志不记录业务负载、cookie 或模型 Key；只记录控制动作名、设备名、IP、错误码。

## 七、验证状态

- `npm run check`：43 个 JS 文件通过语法/静态检查。
- `npm test`：35 个单元测试通过（需要本机有 Tailscale IPv4）。
- `npm run build` / `npm run verify`：23 个文件的 bundle。
- `npm run test:e2e`：本机两个隔离 Harness 实例，Tailscale 桥在 `100.68.241.8:18084`：
  - Host 只绑定 Tailscale；没有令牌；
  - 客户端重启保持 local，不会在启动时安装 switch；
  - 设置页 role/port 保存、Host 桥启停、occupied 端口拒绝；
  - `settings/describe`、`remoteAccess/follow` 启动读取转发；
  - 远端工作区、会话、发送/流式回复、停止、审批（Windows `pwsh`）、提问；
  - 显式断开回 local，保留 URL；切换本机清空。
- 真实 macOS + Windows 双机连接仍需人工验收；macOS 此前的 web-boot 崩溃已修复（启动保持 local + 放行启动读取 + Desktop main owner API Peer 只读）。

## 八、故障排查

| 现象 | 处理 |
| --- | --- |
| `host/tailscale-missing` | 本机没有 Tailscale IPv4；启动并登录 Tailscale，确认 `tailscale ip -4` 有 `100.x` 地址。 |
| Host 设置保存失败 `host/config-invalid` / `host/bind-invalid` | 端口必须是 1-65535 且空闲。本机 WSL2 mirrored 网络保留了 44620-48715，47821 可能不可用；用 18082 等段外端口。 |
| Host 桥启动失败 | 看设置页错误；确认端口未被占用，Tailscale 地址属于本机。 |
| 客户端测试连接失败 | Host 是否启动、地址是否是 Host 当前的 Tailscale IP/端口、防火墙是否放行 Tailscale 网段；`tailscale ping <host>`。 |
| 连接成功但页面打不开/启动 pending | 更新到最新 main 的客户端；旧版可能在启动时安装 remote-offline switch 或拒绝 `settings/describe`。 |
| macOS 启动报 `50 entries did not activate` / locale loading | 退出应用，删除 `~/.dsh/private-remote/client.json` 后重启，或点错误页“禁用第三方插件、备份 profile patch 并重启”；移除旧插件并从 GitHub 仓库重装新版本后再连接。 |
| 远端页面刷新后断开 | 页面重载沿用 Host 进程状态；如果 Host 进程已重启，重新点“进入远程”。 |
| 旧 Release 安装后没有新界面 | `v0.1.0` Release 资产早于本次简化；用 GitHub 仓库地址安装最新提交。 |

## 九、目录

```text
src/client.js                浏览器插件：顶部状态、设置页、远端会话胶囊
src/host.js                  Host 入口
src/host/controller.js       角色、Host 桥、客户端连接、状态
src/host/config.js           role/port、Tailscale 地址检测、URL 校验
src/host/settings.js         官方 configEditor 保存/重置
src/host/bridge-server.js    Host 桥（Tailscale 监听、白名单）
src/host/bridge-client.js    客户端桥
src/host/gateway-switch.js   本机 Gateway 切换
src/shared/allowlist.js      远端端点白名单
bundle/                      构建产物
```

## 十、卸载

1. 客户端先点 **切换回本机**。
2. Host 点 **停止 Host 桥**。
3. 在插件页移除 `dsh-private-remote`。
4. 如需清理本机状态，删除 `$DSH_HOME/private-remote/`（`client.json`、`host-meta.json`）；没有令牌文件。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [兼容性](docs/COMPATIBILITY.md)
- [协议](docs/PROTOCOL.md)
- [安全](docs/SECURITY.md)
- [测试报告](docs/TEST-REPORT.md)

> `docs/` 中 0.1.0 早期“令牌/任意绑定地址”的描述属于历史版本；当前行为以本 README 和最新 `main` 为准。
