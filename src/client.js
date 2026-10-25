window.__ModuleLoader__.load({
  id: 'dsh-private-remote',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;

    const NS = 'private-remote';
    const CHANNEL = '/private-remote';
    const PANEL_ID = 'private-remote';
    const POLL_MS = 3000;
    const ACTION_TIMEOUT_MS = 25000;

    const zh = {
      panel: '私人远程',
      local: '本地',
      remote: '远程',
      connected: '已连接',
      disconnected: '已断开',
      host: 'Host',
      listening: '监听中',
      remoteOffline: '远程已断开',
      statusUnavailable: '状态不可用',
      loading: '正在读取状态…',
      clientTitle: '连接到远端 Host',
      clientHint: '只填 Host 的 Tailscale 地址。没有配对令牌；连接成功即以 Host owner 身份操作远端。请用 Tailscale ACL 限制能访问该端口的设备。',
      urlLabel: 'Host 地址（Tailscale）',
      urlPlaceholder: 'http://100.x.y.z:18082',
      tokenLabel: '配对令牌',
      tokenPlaceholder: '从 Host 的 设置 → 私人远程 复制',
      labelLabel: '显示标签（可选）',
      labelPlaceholder: '例如：Windows 工作站',
      test: '测试连接',
      connect: '进入远程',
      testing: '正在测试…',
      connecting: '正在连接…',
      testOk: '连接成功',
      connectOk: '已进入远程，正在刷新页面…',
      workspaces: '远端工作区',
      noWorkspaces: '远端暂无工作区。请先在 Host 上创建，或使用官方侧栏的“添加工作区”。',
      openWorkspace: '打开工作区',
      disconnect: '断开连接',
      useLocal: '切换回本机',
      useLocalConfirm: '切换回本机后，官方界面会读取这台电脑的本地工作区和会话，远端连接配置会被移除。Host 上的任务不会被取消。继续？',
      reconnect: '重新连接',
      reconnectHint: '连接断开后，提交会被拒绝，不会回退到本地执行。Host 上的任务可能仍在运行；重新连接后请核对历史。',
      hostTitle: 'Host 模式',
      hostHint: 'Host 自动监听本机的 Tailscale IPv4，不需要令牌。任何能访问这个 Tailscale 地址的设备都被视为 owner，请用 Tailscale ACL 限制。',
      listenAddress: 'Tailscale 监听地址',
      deviceName: '设备名称',
      version: '版本',
      platform: '平台',
      hostToken: '配对令牌',
      showToken: '显示令牌',
      hideToken: '隐藏令牌',
      copy: '复制',
      copied: '已复制',
      rotate: '轮换令牌',
      rotateConfirm: '轮换后所有已连接客户端会断开，旧令牌立即失效。继续？',
      dropClients: '断开所有客户端',
      dropConfirm: '断开所有已连接的远端客户端？Host 上的任务不会被取消。',
      forgetToken: '删除令牌并停止 Host 桥',
      forgetConfirm: '删除 Host 令牌并停止桥？客户端将无法再配对，需重启并生成新令牌。',
      clients: '已连接设备',
      noClients: '暂无设备连接',
      hostNotRunning: 'Host 桥未运行。请在 设置 → 私人远程 中启用 Host，或点击“启动 Host 桥”。',
      hostError: 'Host 启动失败',
      configError: '配置错误',
      controlUnavailable: '无法访问本机控制通道。',
      retry: '重试',
      remoteSession: '远程会话',
      workspace: '工作区',
      offlineBadge: '离线',
      errorOffline: '远端已断开',
      errorOutcomeUnknown: '结果未知',
      errorAuth: '认证失败',
      errorVersion: '版本不兼容',
      errorDenied: '端点被拒绝',
      errorTokenMissing: '缺少令牌',
      errorGeneric: '操作失败',
      errorForbidden: '请求被拒绝',
      errorBusy: 'Host 忙',
      errorBind: '端口无效或被占用',
      errorTailscaleMissing: '未检测到 Tailscale',
      errorNotConfigured: '未配置',
      errorProtocol: '协议错误',
      errorClientDisabled: '当前运行模式不含客户端',
      errorUnsupported: '本机 Harness 不兼容',
      errorStreamOverflow: '流积压超限',
      errorPayload: '负载过大',
      unknownHost: '未知 Host',
      unknown: '未知',
      settingsHint: 'Host / Client 设置：设置（侧栏底部）→ 私人远程',
      settingsTitle: '私人远程设置',
      settingsIntro: '配置这台电脑作为 Host、客户端或两者。保存会写回当前 profile 并立即重载插件，不需要手动改 YAML 或重启 Harness。',
      settingsLocalOnly: '这些设置只作用于当前这台电脑；远端 Host 的设置要在远端电脑上打开同一页面修改。',
      settingsWritable: '设置可编辑',
      settingsReadOnly: '官方配置编辑器不可用；请改用当前 profile 的 cordis.patch.yml 配置。',
      roleTitle: '运行模式',
      roleClient: '客户端',
      roleHost: 'Host',
      roleBoth: '两者',
      roleClientHint: '连接另一台电脑上的 Host，使用它的工作区和会话。',
      roleHostHint: '在本机 Tailscale 地址上监听，供另一台电脑连接。',
      roleBothHint: '同时提供 Host 并连接远端 Host。',
      roleWarning: '保存会重载插件；正在连接远端时请先“切换回本机”。有 Host 客户端连接时也会断开。',
      hostSettingsTitle: 'Host 设置',
      hostSettingsHint: 'Host 只监听检测到的 Tailscale IPv4 (100.64.0.0/10)；端口默认 18082。没有令牌，Tailscale ACL 是权限边界。',
      tailscaleMissing: '未检测到 Tailscale IPv4；请先启动并登录 Tailscale。',
      stopHost: '停止 Host 桥',
      bindHostPlaceholder: '100.x.y.z 或 127.0.0.1',
      portLabel: '端口',
      deviceNameLabel: '本机设备名称（可选）',
      deviceNamePlaceholder: '留空则使用系统主机名',
      deviceNameHint: '作为 Host 时显示给客户端，也会作为本机连接远端时的名称。',
      detectedAddresses: '检测到的地址',
      noDetectedAddresses: '没有检测到私网地址；请手动输入 Tailscale IP。',
      addressTailscale: 'Tailscale',
      addressPrivate: '私有网络',
      addressLoopback: '仅本机',
      addressUla: 'IPv6 私网',
      saveSettings: '保存并应用',
      savingSettings: '正在保存并重载…',
      settingsSaved: '设置已保存；Host 桥正在按新设置启动。',
      settingsUnchanged: '设置没有变化。',
      settingsMaybeSaved: '连接在重载时中断；正在确认设置是否已保存…',
      settingsConfirmClients: '当前有 Host 客户端连接；保存会断开它们。继续？',
      settingsRemoteActive: '正在连接远端；请先“切换回本机”再修改设置。',
      settingsHostNotRunning: 'Host 桥未运行。',
      hostStatusTitle: 'Host 状态',
      startHost: '启动 Host 桥',
      startingHost: '正在启动…',
      hostStopped: 'Host 桥已停止',
      hostStoppedHint: '点击“启动 Host 桥”重新监听。',
      hostTokenForgotten: 'Host 令牌已删除；启动 Host 桥会生成新令牌。',
      hostModeDisabled: '当前运行模式不含 Host；选择“Host”或“两者”后保存。',
      clientModeDisabled: '当前运行模式不含客户端；选择“客户端”或“两者”后保存。',
      clientSettingsTitle: '客户端设置',
      clientSettingsHint: '填另一台电脑的 Tailscale Host 地址；没有配对令牌。连接成功即视为该 Host 的 owner。',
      clientSectionHint: 'Host / Client 设置只作用于当前这台电脑。',
      remoteUrlHint: '只支持 Tailscale 地址（100.64.0.0/10 或 *.ts.net）的 http://；可不写端口，默认 18082。',
      settingsUndo: '撤销修改',
      settingsReset: '恢复默认',
      settingsResetConfirm: '恢复 bundle 默认配置（通常是客户端模式），会删除当前 profile 的覆盖并重载插件。继续？',
      settingsResetDone: '已恢复默认配置。',
      settingsSourceNote: '保存会写入当前 profile 的 cordis.patch.yml；首次保存会把当前完整配置固定为 profile 覆盖。',
      settingsFieldInvalid: '请检查填写内容。',
      hostClientsConfirm: '当前有 Host 客户端连接；保存会断开它们。继续？',
      openSettingsPath: '设置 → 私人远程',
      errorConfigInvalid: '配置无效',
      errorConfigSaveFailed: '配置保存失败',
      errorRemoteActive: '请先切换回本机',
      errorSettingsUnavailable: '配置编辑器不可用',
      clientDisabledByRole: '当前运行模式不含客户端。',
      hostDisabledByRole: '当前运行模式不含 Host。',
      hostBridgeStopped: 'Host 桥已停止。',
    };

    const en = {
      panel: 'Private Remote',
      local: 'Local',
      remote: 'Remote',
      connected: 'Connected',
      disconnected: 'Disconnected',
      host: 'Host',
      listening: 'Listening',
      remoteOffline: 'Remote disconnected',
      statusUnavailable: 'Status unavailable',
      loading: 'Reading status…',
      clientTitle: 'Connect to a remote Host',
      clientHint: 'Enter the Host’s Tailscale address only. There is no pairing token; a successful connection acts as the Host owner. Restrict access to this port with Tailscale ACLs.',
      urlLabel: 'Host address (Tailscale)',
      urlPlaceholder: 'http://100.x.y.z:18082',
      tokenLabel: 'Pairing token',
      tokenPlaceholder: 'Copy it from the Host’s Settings → Private Remote',
      labelLabel: 'Display label (optional)',
      labelPlaceholder: 'For example: Windows workstation',
      test: 'Test connection',
      connect: 'Enter remote',
      testing: 'Testing…',
      connecting: 'Connecting…',
      testOk: 'Connection OK',
      connectOk: 'Remote mode active; reloading…',
      workspaces: 'Remote workspaces',
      noWorkspaces: 'No remote workspaces yet. Create one on the Host, or use the official sidebar’s add-workspace action.',
      openWorkspace: 'Open workspace',
      disconnect: 'Disconnect',
      useLocal: 'Switch to local',
      useLocalConfirm: 'Switching to local makes the official UI read this computer’s local workspaces and sessions and removes the remote pairing. Host tasks are not cancelled. Continue?',
      reconnect: 'Reconnect',
      reconnectHint: 'After a disconnect, submissions are refused and never fall back to local execution. Host tasks may still be running; verify the history after reconnecting.',
      hostTitle: 'Host mode',
      hostHint: 'The Host listens on this machine’s Tailscale IPv4 automatically, with no token. Any device that can reach that Tailscale address is treated as owner; restrict it with Tailscale ACLs.',
      listenAddress: 'Tailscale listen address',
      deviceName: 'Device name',
      version: 'Version',
      platform: 'Platform',
      hostToken: 'Pairing token',
      showToken: 'Show token',
      hideToken: 'Hide token',
      copy: 'Copy',
      copied: 'Copied',
      rotate: 'Rotate token',
      rotateConfirm: 'Rotating disconnects every client and invalidates the old token immediately. Continue?',
      dropClients: 'Drop all clients',
      dropConfirm: 'Drop every connected remote client? Host tasks are not cancelled.',
      forgetToken: 'Remove token and stop bridge',
      forgetConfirm: 'Remove the Host token and stop the bridge? Clients can no longer pair until a restart creates a new token.',
      clients: 'Connected devices',
      noClients: 'No devices connected',
      hostNotRunning: 'The Host bridge is not running. Enable Host in Settings → Private Remote, or select “Start Host bridge”.',
      hostError: 'Host failed to start',
      configError: 'Configuration error',
      controlUnavailable: 'The local control channel is unavailable.',
      retry: 'Retry',
      remoteSession: 'Remote session',
      workspace: 'Workspace',
      offlineBadge: 'Offline',
      errorOffline: 'Remote offline',
      errorOutcomeUnknown: 'Outcome unknown',
      errorAuth: 'Authentication failed',
      errorVersion: 'Version mismatch',
      errorDenied: 'Endpoint denied',
      errorTokenMissing: 'Token missing',
      errorGeneric: 'Operation failed',
      errorForbidden: 'Request rejected',
      errorBusy: 'Host busy',
      errorBind: 'Port unavailable',
      errorTailscaleMissing: 'Tailscale not detected',
      errorNotConfigured: 'Not configured',
      errorProtocol: 'Protocol error',
      errorClientDisabled: 'The current mode does not include the client',
      errorUnsupported: 'Local Harness unsupported',
      errorStreamOverflow: 'Stream overflow',
      errorPayload: 'Payload too large',
      unknownHost: 'Unknown host',
      unknown: 'Unknown',
      settingsHint: 'Host / client settings: Settings (sidebar foot) → Private Remote',
      settingsTitle: 'Private Remote settings',
      settingsIntro: 'Configure this computer as a Host, a client, or both. Saving writes to the current profile and reloads the plugin immediately; no YAML edit or Harness restart is needed.',
      settingsLocalOnly: 'These settings apply to this computer only. Configure a remote Host on that remote computer, in the same page.',
      settingsWritable: 'Settings are editable',
      settingsReadOnly: 'The official configuration editor is unavailable. Edit this profile’s cordis.patch.yml instead.',
      roleTitle: 'Mode',
      roleClient: 'Client',
      roleHost: 'Host',
      roleBoth: 'Both',
      roleClientHint: 'Connect to a Host on another computer and use its workspaces and sessions.',
      roleHostHint: 'Listen on this machine’s Tailscale address for another computer.',
      roleBothHint: 'Serve a Host and connect to a remote Host at the same time.',
      roleWarning: 'Saving reloads the plugin; switch back to local first if a remote connection is active. Connected Host clients are disconnected too.',
      hostSettingsTitle: 'Host settings',
      hostSettingsHint: 'The Host only binds the detected Tailscale IPv4 (100.64.0.0/10); the default port is 18082. There is no token; Tailscale ACLs are the permission boundary.',
      tailscaleMissing: 'No Tailscale IPv4 detected; start and sign in to Tailscale first.',
      stopHost: 'Stop Host bridge',
      bindHostPlaceholder: '100.x.y.z or 127.0.0.1',
      portLabel: 'Port',
      deviceNameLabel: 'Device name (optional)',
      deviceNamePlaceholder: 'Leave empty to use the system hostname',
      deviceNameHint: 'Shown to clients while this computer is a Host; also used as this computer’s name when connecting out.',
      detectedAddresses: 'Detected addresses',
      noDetectedAddresses: 'No private address detected; enter the Tailscale IP manually.',
      addressTailscale: 'Tailscale',
      addressPrivate: 'Private network',
      addressLoopback: 'Loopback',
      addressUla: 'IPv6 private',
      saveSettings: 'Save and apply',
      savingSettings: 'Saving and reloading…',
      settingsSaved: 'Settings saved; the Host bridge is starting with the new values.',
      settingsUnchanged: 'Settings are unchanged.',
      settingsMaybeSaved: 'The connection was interrupted during reload; confirming whether the settings were saved…',
      settingsConfirmClients: 'Host clients are connected; saving disconnects them. Continue?',
      settingsRemoteActive: 'A remote connection is active; switch back to local before changing settings.',
      settingsHostNotRunning: 'The Host bridge is not running.',
      hostStatusTitle: 'Host status',
      startHost: 'Start Host bridge',
      startingHost: 'Starting…',
      hostStopped: 'Host bridge stopped',
      hostStoppedHint: 'Select “Start Host bridge” to listen again.',
      hostTokenForgotten: 'The Host token was removed; starting the Host bridge creates a new token.',
      hostModeDisabled: 'The current mode does not include Host; select “Host” or “Both” and save.',
      clientModeDisabled: 'The current mode does not include the client; select “Client” or “Both” and save.',
      clientSettingsTitle: 'Client settings',
      clientSettingsHint: 'Enter the Tailscale Host address of the other computer; there is no pairing token. A successful connection acts as that Host’s owner.',
      clientSectionHint: 'Host / client settings apply to this computer only.',
      remoteUrlHint: 'Tailscale addresses only (100.64.0.0/10 or *.ts.net) over http://; the port defaults to 18082.',
      settingsUndo: 'Undo changes',
      settingsReset: 'Restore defaults',
      settingsResetConfirm: 'Restore the bundle defaults (usually client mode), remove this profile’s override, and reload the plugin. Continue?',
      settingsResetDone: 'Defaults restored.',
      settingsSourceNote: 'Saving writes this profile’s cordis.patch.yml; the first save pins the complete current configuration as a profile override.',
      settingsFieldInvalid: 'Check the fields below.',
      hostClientsConfirm: 'Host clients are connected; saving disconnects them. Continue?',
      openSettingsPath: 'Settings → Private Remote',
      errorConfigInvalid: 'Invalid configuration',
      errorConfigSaveFailed: 'Configuration save failed',
      errorRemoteActive: 'Switch to local first',
      errorSettingsUnavailable: 'Configuration editor unavailable',
      clientDisabledByRole: 'The current mode does not include the client.',
      hostDisabledByRole: 'The current mode does not include Host.',
      hostBridgeStopped: 'The Host bridge is stopped.',
    };

    const ERROR_KEYS = {
      'remote/offline': 'errorOffline',
      'remote/outcome-unknown': 'errorOutcomeUnknown',
      'remote/auth-failed': 'errorAuth',
      'remote/version-mismatch': 'errorVersion',
      'remote/endpoint-denied': 'errorDenied',
      'remote/forbidden': 'errorForbidden',
      'host/tailscale-missing': 'errorTailscaleMissing',
      'host/busy': 'errorBusy',
      'host/bind-invalid': 'errorBind',
      'host/config-invalid': 'errorConfigInvalid',
      'host/config-save-failed': 'errorConfigSaveFailed',
      'host/remote-active': 'errorRemoteActive',
      'host/not-configured': 'errorNotConfigured',
      'host/client-disabled': 'errorClientDisabled',
      'remote/protocol': 'errorProtocol',
      'remote/unsupported': 'errorUnsupported',
      'remote/stream-overflow': 'errorStreamOverflow',
      'remote/payload-too-large': 'errorPayload',
      'remote/replay': 'errorProtocol',
      'remote/tampered': 'errorProtocol',
    };

    const CODE_MESSAGES = {
      zh: {
        'remote/offline': '远端已断开，提交被拒绝；请重新连接。',
        'remote/outcome-unknown': '远端请求结果未知；请核对远端会话后再重试。',
        'remote/auth-failed': '传输协议不匹配，或 Host 不可信。',
        'remote/version-mismatch': '本机与远端 Harness/插件版本不兼容。',
        'remote/endpoint-denied': '该操作不在私人远程的允许列表内。',
        'host/tailscale-missing': '未检测到 Tailscale IPv4；请先连接 Tailscale。',
        'host/bind-invalid': '端口不可用；请换一个空闲端口。',
      },
      en: {
        'remote/offline': 'The remote is offline; submissions are refused. Reconnect first.',
        'remote/outcome-unknown': 'The remote outcome is unknown. Verify the remote session before retrying.',
        'remote/auth-failed': 'The transport protocol does not match, or the Host is not trusted.',
        'remote/version-mismatch': 'Local and remote Harness/plugin versions are incompatible.',
        'remote/endpoint-denied': 'That operation is not on the Private Remote allowlist.',
        'host/tailscale-missing': 'No Tailscale IPv4 detected; connect to Tailscale first.',
        'host/bind-invalid': 'The port is unavailable; choose a free port.',
      },
    };

    const ERROR_CODES = new Set(Object.keys(ERROR_KEYS));

    function timeoutSignal(ms) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
      }
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    }

    function toErrorPayload(error) {
      if (error === null || error === undefined) return { code: 'remote/offline', message: '' };
      if (typeof error === 'string') return { code: 'remote/offline', message: error };
      return {
        code: typeof error.code === 'string' ? error.code : 'remote/offline',
        message: typeof error.message === 'string' ? error.message : '',
      };
    }

    function describeError(error, t) {
      if (error === null || error === undefined) return '';
      const payload = toErrorPayload(error);
      const key = ERROR_KEYS[payload.code] || 'errorGeneric';
      const base = t(key);
      const detail = payload.message.trim();
      return detail === '' || detail === base ? base : `${base}：${detail}`;
    }

    function hostName(host, t) {
      if (!host || typeof host !== 'object') return t('unknownHost');
      return typeof host.deviceName === 'string' && host.deviceName !== ''
        ? host.deviceName
        : typeof host.hostname === 'string' && host.hostname !== ''
          ? host.hostname
          : t('unknownHost');
    }

    function roleIncludesHost(role) {
      return role === 'host' || role === 'both';
    }

    function roleIncludesClient(role) {
      return role === 'client' || role === 'both';
    }

    function roleLabel(role, t) {
      if (role === 'host') return t('roleHost');
      if (role === 'both') return t('roleBoth');
      return t('roleClient');
    }

    function addressKindLabel(kind, t) {
      if (kind === 'tailscale') return t('addressTailscale');
      if (kind === 'private') return t('addressPrivate');
      if (kind === 'ula') return t('addressUla');
      return t('addressLoopback');
    }

    function normalizeRemotePath(value, platform) {
      if (typeof value !== 'string') return '';
      let normalized = value.trim().replace(/\\/g, '/');
      if (normalized === '') return '';
      if (normalized.length > 1) normalized = normalized.replace(/\/+$/g, '');
      if (normalized.length === 2 && normalized[1] === ':') normalized += '/';
      if (platform === 'win32') normalized = normalized.toLowerCase();
      return normalized;
    }

    function remoteBasename(value, platform) {
      const normalized = normalizeRemotePath(value, platform);
      if (normalized === '') return '';
      const parts = normalized.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : normalized;
    }

    function findWorkspace(items, cwd, platform) {
      if (!Array.isArray(items) || typeof cwd !== 'string') return null;
      const target = normalizeRemotePath(cwd, platform);
      if (target === '') return null;
      let best = null;
      let bestLength = -1;
      for (const item of items) {
        if (!item || typeof item.path !== 'string') continue;
        const root = normalizeRemotePath(item.path, platform);
        if (root === '') continue;
        const separator = root.endsWith('/') ? '' : '/';
        const inside = target === root || target.startsWith(root + separator);
        if (!inside) continue;
        if (root.length > bestLength) {
          best = item;
          bestLength = root.length;
        }
      }
      return best;
    }

    class ControlController {
      constructor(ctx) {
        this.ctx = ctx;
        this.snapshot = { phase: 'loading', status: null, error: null };
        this.listeners = new Set();
        this.timer = null;
        this.inflight = false;
        this.disposed = false;
      }

      subscribe(listener) {
        this.listeners.add(listener);
        try {
          listener(this.snapshot);
        } catch {
          // A component error must not stop other subscribers.
        }
        if (this.listeners.size === 1) this.start();
        return () => {
          this.listeners.delete(listener);
          if (this.listeners.size === 0) this.stop();
        };
      }

      start() {
        if (this.timer !== null || this.disposed) return;
        void this.refresh();
        this.timer = setInterval(() => {
          void this.refresh();
        }, POLL_MS);
      }

      stop() {
        if (this.timer !== null) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }

      emit() {
        for (const listener of [...this.listeners]) {
          try {
            listener(this.snapshot);
          } catch {
            // ignore
          }
        }
      }

      async call(endpoint, payload, timeoutMs = ACTION_TIMEOUT_MS) {
        const result = await this.ctx.connection.rpc.call(CHANNEL, endpoint, payload ?? {}, timeoutSignal(timeoutMs));
        if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean') {
          throw { code: 'remote/protocol', message: '控制通道响应格式无效' };
        }
        return result;
      }

      async refresh() {
        if (this.inflight || this.disposed) return;
        this.inflight = true;
        try {
          const result = await this.call('status', {}, 10000);
          if (result.ok) {
            this.snapshot = { phase: 'ready', status: result.value, error: null };
          } else {
            this.snapshot = { phase: 'error', status: this.snapshot.status, error: result.error };
          }
        } catch (error) {
          this.snapshot = { phase: 'error', status: this.snapshot.status, error: toErrorPayload(error) };
        } finally {
          this.inflight = false;
          this.emit();
        }
      }

      async act(endpoint, payload) {
        return this.call(endpoint, payload, ACTION_TIMEOUT_MS);
      }

      dispose() {
        this.disposed = true;
        this.stop();
        this.listeners.clear();
      }
    }

    function createController(ctx) {
      return new ControlController(ctx);
    }

    function useSnapshot(controller) {
      const [snapshot, setSnapshot] = React.useState(controller.snapshot);
      React.useEffect(() => controller.subscribe(setSnapshot), [controller]);
      return snapshot;
    }

    function useTranslate(ctx) {
      const [, setVersion] = React.useState(0);
      React.useEffect(() => ctx.locale.subscribe(() => setVersion((value) => value + 1)), [ctx]);
      return ctx.locale.bind(NS);
    }

    const styles = {
      panel: {
        boxSizing: 'border-box',
        minHeight: '100%',
        padding: '20px 22px 28px',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: 14,
        lineHeight: 1.55,
        overflow: 'auto',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
      },
      title: {
        margin: 0,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: 0.2,
      },
      subtitle: {
        margin: '0 0 18px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 13,
      },
      card: {
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      cardTitle: {
        margin: '0 0 10px',
        fontSize: 15,
        fontWeight: 600,
      },
      hint: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12.5,
        margin: '0 0 12px',
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        marginBottom: 12,
      },
      label: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12.5,
        fontWeight: 500,
      },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 13,
        outline: 'none',
      },
      row: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
      },
      button: {
        cursor: 'pointer',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 13,
        padding: '7px 12px',
      },
      primary: {
        cursor: 'pointer',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#ffffff',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 600,
        padding: '7px 14px',
      },
      danger: {
        cursor: 'pointer',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-state-error-primary)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        font: 'inherit',
        fontSize: 13,
        padding: '7px 12px',
      },
      error: {
        marginTop: 10,
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)',
        borderRadius: 8,
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 12.5,
        padding: '8px 10px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      notice: {
        marginTop: 10,
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)',
        borderRadius: 8,
        color: 'var(--dsw-alias-state-success-primary)',
        fontSize: 12.5,
        padding: '8px 10px',
        wordBreak: 'break-word',
      },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11.5,
        padding: '2px 8px',
      },
      dot: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-idle-primary)',
        flex: '0 0 auto',
      },
      list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      },
      wsButton: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 9,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        padding: '9px 11px',
      },
      wsPath: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11.5,
        wordBreak: 'break-all',
      },
      mono: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        wordBreak: 'break-all',
      },
      headerStatus: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 260,
        minWidth: 0,
        padding: '3px 9px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: 12,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        flex: '0 1 auto',
      },
      statusText: {
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      sessionChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        maxWidth: 240,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      settingsSection: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        maxWidth: 760,
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: 1.55,
      },
      settingsHeading: {
        margin: 0,
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: 0.2,
      },
      settingsIntro: {
        margin: 0,
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 13,
        lineHeight: 1.6,
      },
      settingsNote: {
        margin: 0,
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        lineHeight: 1.6,
      },
      settingsCard: {
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      settingsCardTitle: {
        margin: '0 0 8px',
        fontSize: 15,
        fontWeight: 600,
      },
      settingsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
      },
      roleGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 8,
      },
      roleOption: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        padding: '10px 12px',
      },
      roleOptionActive: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        padding: '10px 12px',
      },
      roleName: {
        fontWeight: 600,
        fontSize: 13.5,
      },
      roleHint: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11.5,
        lineHeight: 1.5,
      },
      addressChip: {
        cursor: 'pointer',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: 11.5,
        padding: '3px 8px',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      addressChipActive: {
        cursor: 'pointer',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 11.5,
        padding: '3px 8px',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      settingsActions: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
      },
      settingsBadgeRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
      },
      settingsStatusText: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12.5,
      },
      settingsDivider: {
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        margin: '10px 0',
      },
    };

    const SETTINGS_CSS = `
      .dsh-private-remote-settings button:focus-visible,
      .dsh-private-remote-settings input:focus-visible,
      .dsh-private-remote-settings select:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary) !important;
        outline-offset: 2px !important;
      }
      .dsh-private-remote-settings button:hover:not(:disabled) {
        filter: brightness(1.04);
      }
    `;

    function dotStyle(kind) {
      const background = kind === 'ok'
        ? 'var(--dsw-alias-state-success-primary)'
        : kind === 'error'
          ? 'var(--dsw-alias-state-error-primary)'
          : kind === 'busy'
            ? 'var(--dsw-alias-brand-primary)'
            : 'var(--dsw-alias-state-idle-primary)';
      return { ...styles.dot, background };
    }

    function Button(props) {
      const base = props.variant === 'primary'
        ? styles.primary
        : props.variant === 'danger'
          ? styles.danger
          : styles.button;
      return h('button', {
        type: 'button',
        style: { ...base, opacity: props.disabled ? 0.55 : 1 },
        disabled: props.disabled === true,
        onClick: props.onClick,
        title: props.title,
      }, props.children);
    }

    function Field(props) {
      return h('label', { style: styles.field },
        h('span', { style: styles.label }, props.label),
        h('input', {
          style: { ...styles.input, opacity: props.disabled === true ? 0.6 : 1 },
          type: props.type ?? 'text',
          value: props.value,
          placeholder: props.placeholder,
          autoComplete: props.autoComplete ?? 'off',
          spellCheck: false,
          readOnly: props.readOnly === true,
          disabled: props.disabled === true,
          min: props.min,
          max: props.max,
          step: props.step,
          inputMode: props.inputMode,
          onChange: props.onChange,
        }),
        props.hint ? h('span', { style: styles.settingsNote }, props.hint) : null,
      );
    }

    function Notice(props) {
      if (!props.children) return null;
      return h('div', { style: props.error ? styles.error : styles.notice, role: props.error ? 'alert' : 'status' }, props.children);
    }

    function ClientForm(props) {
      const { controller, t, initial, bare } = props;
      const [url, setUrl] = React.useState(typeof initial.url === 'string' ? initial.url : '');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [notice, setNotice] = React.useState('');
      const [testedHost, setTestedHost] = React.useState(null);

      const run = async (endpoint) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        setNotice('');
        setTestedHost(null);
        try {
          const result = await controller.act(endpoint, { url });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (endpoint === 'test') {
            setTestedHost(result.value.host);
            setNotice(`${t('testOk')} · ${hostName(result.value.host, t)}`);
          } else {
            setNotice(t('connectOk'));
            window.setTimeout(() => window.location.reload(), 300);
          }
        } catch (cause) {
          setError(toErrorPayload(cause));
        } finally {
          setBusy(false);
        }
      };

      const onSubmit = (event) => {
        event.preventDefault();
        void run('connect');
      };

      const content = [
        h(Field, {
          key: 'url',
          label: t('urlLabel'),
          value: url,
          placeholder: t('urlPlaceholder'),
          hint: t('remoteUrlHint'),
          onChange: (event) => setUrl(event.target.value),
        }),
        h('div', { key: 'actions', style: styles.row },
          h(Button, {
            variant: 'primary',
            disabled: busy,
            onClick: () => void run('connect'),
          }, busy ? t('connecting') : t('connect')),
          h(Button, {
            disabled: busy,
            onClick: () => void run('test'),
          }, busy ? t('testing') : t('test')),
        ),
        h(Notice, { key: 'error', error: true }, error ? describeError(error, t) : ''),
        h(Notice, { key: 'notice' }, notice),
        testedHost ? h('div', { key: 'tested', style: { ...styles.badge, marginTop: 10 } },
          h('span', { style: dotStyle('ok') }),
          `${hostName(testedHost, t)} · ${testedHost.platform ?? t('unknown')} · ${t('version')} ${testedHost.harnessVersion || testedHost.pluginVersion || t('unknown')}`,
        ) : null,
      ];

      if (bare) {
        return h('form', { onSubmit, style: { margin: 0 } }, content);
      }
      return h('form', { onSubmit, style: { margin: 0 } },
        h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, t('clientTitle')),
          h('p', { style: styles.hint }, t('clientHint')),
          content,
        ),
      );
    }

    function RemoteView(props) {
      const { controller, t, status, useWorkspaces, compact, showWorkspaces } = props;
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [workspaceError, setWorkspaceError] = React.useState(null);
      const workspaces = useWorkspaces((state) => state.items);
      const items = Array.isArray(workspaces) ? workspaces : [];
      const remote = status.remote;
      const host = remote.host;
      const online = remote.connected;
      const remoteName = host ? hostName(host, t) : (remote.url || t('remote'));

      const actAndReload = async (endpoint) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          const result = await controller.act(endpoint, {});
          if (!result.ok) {
            setError(result.error);
            return;
          }
          window.setTimeout(() => window.location.reload(), 200);
        } catch (cause) {
          setError(toErrorPayload(cause));
        } finally {
          setBusy(false);
        }
      };

      const switchToLocal = () => {
        if (!window.confirm(t('useLocalConfirm'))) return;
        void actAndReload('useLocal');
      };

      const openWorkspace = async (workspaceId) => {
        setWorkspaceError(null);
        try {
          const ui = props.ctx?.uiWorkspace;
          if (!ui || typeof ui.openWorkspace !== 'function') {
            setWorkspaceError({ code: 'remote/unsupported', message: '官方工作区服务不可用' });
            return;
          }
          await ui.openWorkspace(workspaceId);
        } catch (cause) {
          setWorkspaceError(toErrorPayload(cause));
        }
      };

      return h('div', null,
        compact ? null : h('div', { style: styles.header },
          h('h2', { style: styles.title }, t('panel')),
          h('span', { style: styles.badge },
            h('span', { style: dotStyle(online ? 'ok' : 'error') }),
            online ? t('connected') : t('disconnected'),
          ),
        ),
        compact ? null : h('p', { style: styles.subtitle }, `${t('remote')} · ${remoteName}`),
        h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, remoteName),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px 16px', marginBottom: 10 } },
            h('div', null, h('span', { style: styles.label }, `${t('deviceName')}：`), host?.hostname ?? t('unknown')),
            h('div', null, h('span', { style: styles.label }, `${t('platform')}：`), host?.platform ?? t('unknown')),
            h('div', null, h('span', { style: styles.label }, `${t('version')}：`), host?.harnessVersion || t('unknown')),
            h('div', null, h('span', { style: styles.label }, 'URL：'), h('span', { style: styles.mono }, remote.url || '—')),
          ),
          !online && remote.error ? h(Notice, { error: true }, describeError(remote.error, t)) : null,
          !online ? h('p', { style: styles.hint }, t('reconnectHint')) : null,
          h('div', { style: styles.row },
            h(Button, {
              variant: 'primary',
              disabled: busy,
              onClick: () => void actAndReload('disconnect'),
            }, t('disconnect')),
            !online ? h(Button, {
              disabled: busy,
              onClick: () => void actAndReload('reconnect'),
            }, busy ? t('connecting') : t('reconnect')) : null,
            h(Button, {
              disabled: busy,
              onClick: switchToLocal,
            }, t('useLocal')),
          ),
          h(Notice, { error: true }, error ? describeError(error, t) : ''),
          compact ? null : h('p', { style: styles.settingsNote }, t('settingsHint')),
        ),
        showWorkspaces === false ? null : h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, t('workspaces')),
          items.length === 0
            ? h('p', { style: styles.hint }, t('noWorkspaces'))
            : h('div', { style: styles.list }, items.map((workspace) => h('button', {
                key: workspace.workspaceId,
                type: 'button',
                style: styles.wsButton,
                onClick: () => void openWorkspace(workspace.workspaceId),
                title: `${t('openWorkspace')} ${workspace.path}`,
              },
              h('span', { style: { fontWeight: 600 } }, workspace.title || workspace.path || t('workspace')),
              h('span', { style: styles.wsPath }, workspace.path ?? ''),
            ))),
          h(Notice, { error: true }, workspaceError ? describeError(workspaceError, t) : ''),
        ),
      );
    }

    function HostView(props) {
      const { controller, t, status, compact } = props;
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [notice, setNotice] = React.useState('');
      const host = status.host;
      const info = host.info;

      const run = async (endpoint) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        setNotice('');
        try {
          const result = await controller.act(endpoint, {});
          if (!result.ok) {
            setError(result.error);
            return;
          }
          return result.value;
        } catch (cause) {
          setError(toErrorPayload(cause));
          return undefined;
        } finally {
          setBusy(false);
        }
      };

      const startHost = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        setNotice('');
        try {
          const result = await controller.act('startHost', {});
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNotice(t('listening'));
          await controller.refresh();
        } catch (cause) {
          setError(toErrorPayload(cause));
        } finally {
          setBusy(false);
        }
      };

      const stopHost = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        setNotice('');
        try {
          const result = await controller.act('stopHost', {});
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNotice(t('hostStopped'));
          await controller.refresh();
        } catch (cause) {
          setError(toErrorPayload(cause));
        } finally {
          setBusy(false);
        }
      };

      const drop = async () => {
        if (!window.confirm(t('dropConfirm'))) return;
        await run('dropClients');
      };

      const statusLine = host.listening
        ? host.url
        : host.starting
          ? t('startingHost')
          : host.stopped
            ? t('hostStopped')
            : host.enabled
              ? t('hostNotRunning')
              : t('hostDisabledByRole');

      return h('div', null,
        compact ? null : h('div', { style: styles.header },
          h('h2', { style: styles.title }, t('panel')),
          h('span', { style: styles.badge },
            h('span', { style: dotStyle(host.listening ? 'busy' : 'error') }),
            host.listening ? t('listening') : t('host'),
          ),
        ),
        compact ? null : h('p', { style: styles.subtitle }, `${t('hostTitle')} · ${statusLine}`),
        h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, compact ? t('hostStatusTitle') : t('hostTitle')),
          h('p', { style: styles.hint }, t('hostHint')),
          host.listening
            ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '6px 16px', marginBottom: 8 } },
                h('div', null, h('span', { style: styles.label }, `${t('listenAddress')}：`), h('span', { style: styles.mono }, host.url)),
                h('div', null, h('span', { style: styles.label }, `${t('deviceName')}：`), info?.deviceName ?? t('unknown')),
                h('div', null, h('span', { style: styles.label }, `${t('platform')}：`), info?.platform ?? t('unknown')),
                h('div', null, h('span', { style: styles.label }, `${t('version')}：`), info?.harnessVersion || t('unknown')),
              )
            : h('div', null,
                h('p', { style: styles.hint }, host.starting ? t('loading') : statusLine),
                host.enabled && !host.starting
                  ? h('div', { style: styles.settingsActions },
                      h(Button, { variant: 'primary', disabled: busy, onClick: () => void startHost() },
                        busy ? t('startingHost') : t('startHost')),
                    )
                  : null,
              ),
          host.listening
            ? h('div', { style: styles.row },
                h(Button, { variant: 'danger', disabled: busy, onClick: () => void stopHost() }, t('stopHost')),
                h(Button, { variant: 'danger', disabled: busy, onClick: () => void drop() }, t('dropClients')),
              )
            : null,
          h(Notice, {}, notice),
          h(Notice, { error: true }, error ? describeError(error, t) : ''),
          host.error && !host.listening ? h(Notice, { error: true }, `${t('hostError')}：${host.error.code} ${host.error.message}`) : null,
          compact ? null : h('p', { style: styles.settingsNote }, t('settingsHint')),
        ),
        host.listening ? h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, `${t('clients')} (${host.clients.length})`),
          host.clients.length === 0
            ? h('p', { style: styles.hint }, t('noClients'))
            : h('div', { style: styles.list }, host.clients.map((client) => h('div', {
                key: client.id,
                style: { ...styles.wsButton, cursor: 'default' },
              },
              h('span', { style: { fontWeight: 600 } }, client.clientName),
              h('span', { style: styles.wsPath }, `${client.ip} · ${client.clientHarnessVersion || t('unknown')} · ${new Date(client.connectedAt).toLocaleString()}`),
            ))),
        ) : null,
      );
    }

    function SettingsCard(props) {
      return h('section', { style: styles.settingsCard },
        props.title ? h('h3', { style: styles.settingsCardTitle }, props.title) : null,
        props.description ? h('p', { style: styles.hint }, props.description) : null,
        props.children,
      );
    }

    function StatusBadgeRow(props) {
      const { t, status } = props;
      const role = status.config.role;
      const host = status.host;
      const remote = status.remote;
      const hostText = host.listening
        ? t('listening')
        : host.starting
          ? t('startingHost')
          : host.stopped
            ? t('hostStopped')
            : host.enabled
              ? t('hostNotRunning')
              : t('hostDisabledByRole');
      const remoteText = remote.active
        ? t('connected')
        : remote.installed
          ? t('remoteOffline')
          : t('local');
      return h('div', { style: styles.settingsBadgeRow },
        h('span', { style: styles.badge },
          h('span', { style: dotStyle('busy') }),
          `${t('roleTitle')}：${roleLabel(role, t)}`,
        ),
        h('span', { style: styles.badge },
          h('span', { style: dotStyle(host.listening ? 'ok' : host.error ? 'error' : 'idle') }),
          `${t('host')}：${hostText}`,
        ),
        h('span', { style: styles.badge },
          h('span', { style: dotStyle(remote.active ? 'ok' : remote.installed ? 'error' : 'idle') }),
          `${t('remote')}：${remoteText}`,
        ),
      );
    }

    function RoleHostForm(props) {
      const { controller, t, status } = props;
      const config = status.config;
      const configKey = `${config.role}|${config.port}`;
      const [role, setRole] = React.useState(config.role);
      const [port, setPort] = React.useState(String(config.port));
      const [busy, setBusy] = React.useState(false);
      const [pending, setPending] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [notice, setNotice] = React.useState('');
      const [fieldError, setFieldError] = React.useState('');
      const lastConfigKey = React.useRef(configKey);

      const writable = status.settingsWritable === true;
      const remoteActive = status.remote.active === true;
      const dirty = role !== config.role || Number(port) !== Number(config.port);

      React.useEffect(() => {
        if (busy || pending !== null) return;
        if (lastConfigKey.current === configKey) return;
        lastConfigKey.current = configKey;
        setRole(config.role);
        setPort(String(config.port));
      }, [configKey, busy, pending, config.role, config.port]);

      React.useEffect(() => {
        if (pending === null) return;
        if (configKey === pending.key) {
          setPending(null);
          setBusy(false);
          setError(null);
          setNotice(t('settingsSaved'));
        }
      }, [pending, configKey, t]);

      React.useEffect(() => {
        if (pending === null) return undefined;
        const timer = window.setTimeout(() => {
          setPending(null);
          setBusy(false);
          setNotice(t('settingsMaybeSaved'));
        }, 10000);
        return () => window.clearTimeout(timer);
      }, [pending, t]);

      const save = async (event) => {
        if (event) event.preventDefault();
        if (busy) return;
        const next = {
          role,
          port: Number(port),
        };
        if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) {
          setFieldError(`${t('portLabel')}：${t('settingsFieldInvalid')}`);
          return;
        }
        const wantsHost = next.role === 'host' || next.role === 'both';
        if (wantsHost && !status.tailscale) {
          setFieldError(t('tailscaleMissing'));
          return;
        }
        if (!writable) {
          setError({ code: 'host/config-save-failed', message: t('settingsReadOnly') });
          return;
        }
        if (remoteActive) {
          setError({ code: 'host/remote-active', message: t('settingsRemoteActive') });
          return;
        }
        if (status.host.clients.length > 0 && !window.confirm(t('settingsConfirmClients'))) return;
        setBusy(true);
        setError(null);
        setNotice(t('savingSettings'));
        setFieldError('');
        try {
          const result = await controller.act('saveSettings', next);
          if (!result.ok) {
            setError(result.error);
            setBusy(false);
            return;
          }
          if (result.value && result.value.unchanged === true) {
            setNotice(t('settingsUnchanged'));
            setBusy(false);
            return;
          }
          setPending({ key: `${next.role}|${next.port}` });
          window.setTimeout(() => { void controller.refresh(); }, 300);
        } catch {
          setPending({ key: `${next.role}|${next.port}` });
          setNotice(t('settingsMaybeSaved'));
          window.setTimeout(() => { void controller.refresh(); }, 300);
        }
      };

      const reset = async () => {
        if (busy) return;
        if (!writable) {
          setError({ code: 'host/config-save-failed', message: t('settingsReadOnly') });
          return;
        }
        if (remoteActive) {
          setError({ code: 'host/remote-active', message: t('settingsRemoteActive') });
          return;
        }
        if (!window.confirm(t('settingsResetConfirm'))) return;
        if (status.host.clients.length > 0 && !window.confirm(t('settingsConfirmClients'))) return;
        setBusy(true);
        setError(null);
        setNotice('');
        setFieldError('');
        try {
          const result = await controller.act('resetSettings', {});
          if (!result.ok) {
            setError(result.error);
            setBusy(false);
            return;
          }
          setNotice(t('settingsResetDone'));
          window.setTimeout(() => { void controller.refresh(); }, 300);
          window.setTimeout(() => setBusy(false), 900);
        } catch (cause) {
          setError(toErrorPayload(cause));
          setBusy(false);
        }
      };

      const undo = () => {
        if (busy) return;
        setRole(config.role);
        setPort(String(config.port));
        setError(null);
        setNotice('');
        setFieldError('');
      };

      const roleOptions = [
        { id: 'client', label: t('roleClient'), hint: t('roleClientHint') },
        { id: 'host', label: t('roleHost'), hint: t('roleHostHint') },
        { id: 'both', label: t('roleBoth'), hint: t('roleBothHint') },
      ];

      const moveRole = (event, index, delta) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown'
          && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const nextIndex = (index + delta + roleOptions.length) % roleOptions.length;
        setRole(roleOptions[nextIndex].id);
      };

      return h('form', { onSubmit: save, style: { margin: 0 } },
        h(SettingsCard, {
          title: t('roleTitle'),
        },
          h('div', { style: styles.roleGrid, role: 'radiogroup', 'aria-label': t('roleTitle') },
            roleOptions.map((option, index) => {
              const selected = role === option.id;
              return h('button', {
                key: option.id,
                type: 'button',
                role: 'radio',
                'aria-checked': selected,
                style: selected ? styles.roleOptionActive : styles.roleOption,
                onClick: () => setRole(option.id),
                onKeyDown: (event) => moveRole(event, index, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1),
              },
                h('span', { style: styles.roleName }, option.label),
                h('span', { style: styles.roleHint }, option.hint),
              );
            }),
          ),
          h('p', { style: styles.settingsNote }, t('roleWarning')),
          h('div', { style: styles.settingsDivider }),
          h('h3', { style: styles.settingsCardTitle }, t('hostSettingsTitle')),
          h('p', { style: styles.hint }, t('hostSettingsHint')),
          h('div', { style: styles.field },
            h('span', { style: styles.label }, t('listenAddress')),
            h('span', { style: styles.mono }, status.tailscale
              ? `http://${status.tailscale}:${port}`
              : t('tailscaleMissing')),
          ),
          h('div', { style: styles.settingsGrid },
            h(Field, {
              label: t('portLabel'),
              type: 'number',
              value: port,
              min: 1,
              max: 65535,
              inputMode: 'numeric',
              disabled: !writable,
              onChange: (event) => setPort(event.target.value),
            }),
          ),
          fieldError ? h(Notice, { error: true }, fieldError) : null,
          !writable ? h(Notice, { error: true }, t('settingsReadOnly')) : null,
          remoteActive ? h(Notice, { error: true }, t('settingsRemoteActive')) : null,
          h('div', { style: styles.settingsActions },
            h(Button, {
              variant: 'primary',
              disabled: busy || remoteActive || !writable,
              onClick: () => void save(),
            }, busy ? t('savingSettings') : t('saveSettings')),
            h(Button, {
              disabled: busy || !dirty,
              onClick: undo,
            }, t('settingsUndo')),
            h(Button, {
              variant: 'danger',
              disabled: busy || remoteActive || !writable,
              onClick: () => void reset(),
            }, t('settingsReset')),
          ),
          h(Notice, { error: true }, error ? describeError(error, t) : ''),
          h(Notice, {}, notice),
          h('p', { style: styles.settingsNote }, t('settingsSourceNote')),
        ),
      );
    }

    function PrivateRemoteSettings(props) {
      const { t, controller, ctx } = props;
      const snapshot = useSnapshot(controller);
      const status = snapshot.status;

      if (!status) {
        const phaseError = snapshot.phase === 'error';
        return h('div', { className: 'dsh-private-remote-settings', style: styles.settingsSection },
          h('style', null, SETTINGS_CSS),
          h('h2', { style: styles.settingsHeading }, t('settingsTitle')),
          h('p', { style: styles.settingsIntro }, t('settingsIntro')),
          phaseError
            ? h(Notice, { error: true }, describeError(snapshot.error, t))
            : h('p', { style: styles.settingsNote }, t('loading')),
          h('div', { style: styles.settingsActions },
            h(Button, { onClick: () => void controller.refresh() }, t('retry')),
          ),
        );
      }

      const role = status.config.role;
      const hostEnabled = roleIncludesHost(role);
      const clientEnabled = roleIncludesClient(role);
      const remote = status.remote;

      return h('div', { className: 'dsh-private-remote-settings', style: styles.settingsSection },
        h('style', null, SETTINGS_CSS),
        h('h2', { style: styles.settingsHeading }, t('settingsTitle')),
        h('p', { style: styles.settingsIntro }, t('settingsIntro')),
        h('p', { style: styles.settingsNote }, t('settingsLocalOnly')),
        status.configError ? h(Notice, { error: true }, `${t('configError')}：${status.configError.code} ${status.configError.message}`) : null,
        h(StatusBadgeRow, { t, status }),
        h(RoleHostForm, { controller, t, status }),
        hostEnabled
          ? h(HostView, { controller, t, status, compact: true })
          : h(SettingsCard, { title: t('hostTitle'), description: t('hostModeDisabled') }),
        clientEnabled
          ? h('div', null,
              remote.installed
                ? h(RemoteView, {
                    controller,
                    t,
                    status,
                    useWorkspaces: props.useWorkspaces,
                    ctx,
                    compact: true,
                    showWorkspaces: false,
                  })
                : null,
              !remote.active
                ? h(SettingsCard, {
                    title: t('clientSettingsTitle'),
                    description: t('clientSettingsHint'),
                  },
                    h(ClientForm, {
                      key: `client-${remote.generation}`,
                      controller,
                      t,
                      initial: status.clientConfig,
                      bare: true,
                    }),
                    h('p', { style: styles.settingsNote }, t('clientSectionHint')),
                  )
                : null,
            )
          : h(SettingsCard, { title: t('clientSettingsTitle'), description: t('clientModeDisabled') }),
      );
    }

    function RemotePanel(props) {
      const controller = props.controller;
      const ctx = props.ctx;
      const t = useTranslate(ctx);
      const snapshot = useSnapshot(controller);
      const status = snapshot.status;

      if (snapshot.phase === 'loading' && !status) {
        return h('div', { style: styles.panel },
          h('h2', { style: styles.title }, t('panel')),
          h('p', { style: styles.subtitle }, t('loading')),
        );
      }

      if (!status) {
        return h('div', { style: styles.panel },
          h('h2', { style: styles.title }, t('panel')),
          h('p', { style: styles.subtitle }, t('statusUnavailable')),
          h(Notice, { error: true }, describeError(snapshot.error, t)),
          h(Button, { onClick: () => void controller.refresh() }, t('retry')),
        );
      }

      if (status.configError) {
        return h('div', { style: styles.panel },
          h('h2', { style: styles.title }, t('panel')),
          h(Notice, { error: true }, `${t('configError')}：${status.configError.code} ${status.configError.message}`),
          h('p', { style: styles.settingsNote }, t('settingsHint')),
          h(Button, { onClick: () => void controller.refresh() }, t('retry')),
        );
      }

      const role = status.config.role;
      if (status.remote.installed) {
        return h('div', { style: styles.panel },
          h(RemoteView, { controller, t, status, useWorkspaces: props.useWorkspaces, ctx }),
          !status.remote.active
            ? h(ClientForm, { controller, t, initial: status.clientConfig })
            : null,
        );
      }

      if (roleIncludesHost(role)) {
        return h('div', { style: styles.panel },
          h(HostView, { controller, t, status }),
          roleIncludesClient(role)
            ? h(ClientForm, { controller, t, initial: status.clientConfig })
            : null,
        );
      }

      return h('div', { style: styles.panel },
        h(ClientForm, { controller, t, initial: status.clientConfig }),
        h('p', { style: styles.settingsNote }, t('settingsHint')),
      );
    }

    function headerStatusView(status, t, snapshot) {
      if (!status) {
        if (snapshot?.phase === 'error') {
          return {
            label: t('statusUnavailable'),
            kind: 'error',
            title: describeError(snapshot.error, t),
          };
        }
        return null;
      }
      if (status.configError) {
        return {
          label: t('configError'),
          kind: 'error',
          title: `${status.configError.code} ${status.configError.message}`,
        };
      }
      const role = status.config.role;
      const host = status.host;
      const remote = status.remote;
      const hostEnabled = roleIncludesHost(role);
      const remoteName = remote?.host
        ? hostName(remote.host, t)
        : (remote?.url || t('remote'));
      const remoteDetail = remote?.installed
        ? (remote.active
            ? `${t('remote')}：${remoteName}${remote.url ? ` (${remote.url})` : ''}`
            : `${t('remote')}：${t('remoteOffline')}${remote.error ? ` — ${describeError(remote.error, t)}` : ''}`)
        : '';

      if (hostEnabled) {
        if (host.listening) {
          const remoteOffline = remote?.installed && !remote.active;
          return {
            label: `${t('host')} · ${t('listening')}${remoteOffline ? ` · ${t('remoteOffline')}` : ''}`,
            kind: remoteOffline ? 'busy' : 'ok',
            title: [host.url, host.info?.deviceName, remoteDetail].filter(Boolean).join('\n'),
          };
        }
        if (host.starting) {
          return {
            label: `${t('host')} · ${t('startingHost')}`,
            kind: 'busy',
            title: [t('startingHost'), remoteDetail].filter(Boolean).join('\n'),
          };
        }
        if (host.stopped) {
          return {
            label: t('hostStopped'),
            kind: 'idle',
            title: [host.error?.message || t('hostStoppedHint'), remoteDetail].filter(Boolean).join('\n'),
          };
        }
        return {
          label: t('settingsHostNotRunning'),
          kind: 'error',
          title: [host.error?.message || t('settingsHostNotRunning'), remoteDetail].filter(Boolean).join('\n'),
        };
      }

      if (remote?.installed) {
        if (remote.active) {
          return {
            label: `${t('remote')} · ${remoteName}`,
            kind: 'ok',
            title: [remote.url, remoteName].filter(Boolean).join('\n'),
          };
        }
        return {
          label: t('remoteOffline'),
          kind: 'error',
          title: remote.error ? describeError(remote.error, t) : t('remoteOffline'),
        };
      }
      if (status.clientConfig?.url) {
        return {
          label: `${t('remote')} · ${t('disconnected')}`,
          kind: 'idle',
          title: status.clientConfig.url,
        };
      }
      return null;
    }

    function HeaderStatus(props) {
      const { controller, ctx } = props;
      const t = useTranslate(ctx);
      const snapshot = useSnapshot(controller);
      const view = headerStatusView(snapshot.status, t, snapshot);
      if (!view) return null;
      return h('span', {
        style: styles.headerStatus,
        role: 'status',
        'aria-live': 'polite',
        title: view.title || view.label,
      },
        h('span', { style: dotStyle(view.kind) }),
        h('span', { style: styles.statusText }, view.label),
      );
    }

    function SessionChip(props) {
      const controller = props.controller;
      const ctx = props.ctx;
      const t = useTranslate(ctx);
      const snapshot = useSnapshot(controller);
      const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);
      const workspaces = props.useWorkspaces((state) => state.items);
      const remote = snapshot.status?.remote;
      if (!remote?.active) return null;
      const platform = remote.host?.platform;
      const workspace = findWorkspace(workspaces, cwd, platform);
      const name = workspace?.title || remoteBasename(cwd, platform) || t('remoteSession');
      const title = `${t('remote')} · ${hostName(remote.host, t)} · ${workspace?.path || cwd || t('workspace')}`;
      return h('span', { style: styles.sessionChip, title },
        h('span', { style: dotStyle(remote.connected ? 'ok' : 'error') }),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, name),
      );
    }

    function RemotePanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('rect', { x: 3, y: 5, width: 7, height: 6, rx: 1.5 }),
        h('rect', { x: 14, y: 13, width: 7, height: 6, rx: 1.5 }),
        h('path', { d: 'M10 8h3.5a2.5 2.5 0 0 1 2.5 2.5V13' }),
        h('path', { d: 'M7.5 11v2.5A2.5 2.5 0 0 0 10 16h4' }),
      );
    }

    return {
      inject: ['slots', 'locale', 'connection', 'layout', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'private-remote: dictionaries');
        const controller = createController(ctx);
        ctx.effect(() => () => controller.dispose(), 'private-remote: controller');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('conversation.header.leading', () => ctx.slots.register({
          name: 'conversation.header.leading',
        }, (props) => h(HeaderStatus, { ...props, controller, ctx })));

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: PANEL_ID,
          order: 30,
          locale: NS,
          label: () => t('panel'),
        }, (props) => h(PrivateRemoteSettings, { ...props, controller, ctx })));

        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'private-remote-workspace',
          order: 20,
          locale: NS,
        }, (props) => h(SessionChip, { ...props, controller, ctx })));
      },
    };
  },
});
