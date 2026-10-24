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
      clientHint: '远端工作区、会话历史、模型和工具都留在远端 Host。这里的令牌只存在本机内存中，不写入磁盘或 localStorage。',
      urlLabel: '远端地址',
      urlPlaceholder: 'http://100.68.241.8:47821',
      tokenLabel: '配对令牌',
      tokenPlaceholder: '从 Host 的“私人远程”面板复制',
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
      hostHint: '绑定私网或 Tailscale IP，在另一台电脑的“私人远程”面板填入这里的地址和令牌。令牌是机密，不要截图或发到聊天里。',
      listenAddress: '监听地址',
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
      hostNotRunning: 'Host 桥未运行。请把 profile 中的 role 设为 host，并重启 Harness。',
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
      errorBind: '绑定地址无效',
      errorNotConfigured: '未配置',
      errorProtocol: '协议错误',
      errorClientDisabled: '此实例是 Host 模式',
      errorUnsupported: '本机 Harness 不兼容',
      errorStreamOverflow: '流积压超限',
      errorPayload: '负载过大',
      unknownHost: '未知 Host',
      unknown: '未知',
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
      clientHint: 'Remote workspaces, session history, models and tools stay on the remote Host. The token is kept in this Host process memory only; it is never written to disk or browser storage.',
      urlLabel: 'Remote URL',
      urlPlaceholder: 'http://100.68.241.8:47821',
      tokenLabel: 'Pairing token',
      tokenPlaceholder: 'Copy it from the Host’s Private Remote panel',
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
      hostHint: 'Bind a private or Tailscale IP, then enter this address and token in the other computer’s Private Remote panel. The token is a secret; do not screenshot or paste it into chat.',
      listenAddress: 'Listen address',
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
      hostNotRunning: 'The Host bridge is not running. Set role: host in the profile and restart Harness.',
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
      errorBind: 'Invalid bind address',
      errorNotConfigured: 'Not configured',
      errorProtocol: 'Protocol error',
      errorClientDisabled: 'This instance is host-only',
      errorUnsupported: 'Local Harness unsupported',
      errorStreamOverflow: 'Stream overflow',
      errorPayload: 'Payload too large',
      unknownHost: 'Unknown host',
      unknown: 'Unknown',
    };

    const ERROR_KEYS = {
      'remote/offline': 'errorOffline',
      'remote/outcome-unknown': 'errorOutcomeUnknown',
      'remote/auth-failed': 'errorAuth',
      'remote/auth-rotated': 'errorAuth',
      'remote/version-mismatch': 'errorVersion',
      'remote/endpoint-denied': 'errorDenied',
      'remote/forbidden': 'errorForbidden',
      'host/token-missing': 'errorTokenMissing',
      'host/busy': 'errorBusy',
      'host/bind-invalid': 'errorBind',
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
        'remote/auth-failed': '配对令牌不匹配，或 Host 不可信。',
        'remote/version-mismatch': '本机与远端 Harness/插件版本不兼容。',
        'remote/endpoint-denied': '该操作不在私人远程的允许列表内。',
        'host/token-missing': '本机内存中没有配对令牌，请重新输入。',
        'host/bind-invalid': '监听地址必须是私网或 Tailscale IP。',
      },
      en: {
        'remote/offline': 'The remote is offline; submissions are refused. Reconnect first.',
        'remote/outcome-unknown': 'The remote outcome is unknown. Verify the remote session before retrying.',
        'remote/auth-failed': 'The pairing token does not match, or the Host is not trusted.',
        'remote/version-mismatch': 'Local and remote Harness/plugin versions are incompatible.',
        'remote/endpoint-denied': 'That operation is not on the Private Remote allowlist.',
        'host/token-missing': 'No pairing token is held in memory. Enter it again.',
        'host/bind-invalid': 'The listen address must be a private or Tailscale IP.',
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
      statusPill: {
        position: 'fixed',
        right: 14,
        bottom: 14,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        maxWidth: 'min(62vw, 380px)',
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2))',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.18)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
        pointerEvents: 'auto',
      },
      statusText: {
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
    };

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
          style: styles.input,
          type: props.type ?? 'text',
          value: props.value,
          placeholder: props.placeholder,
          autoComplete: props.autoComplete ?? 'off',
          spellCheck: false,
          readOnly: props.readOnly === true,
          onChange: props.onChange,
        }),
      );
    }

    function Notice(props) {
      if (!props.children) return null;
      return h('div', { style: props.error ? styles.error : styles.notice, role: props.error ? 'alert' : 'status' }, props.children);
    }

    function ClientForm(props) {
      const { controller, t, initial } = props;
      const [url, setUrl] = React.useState(typeof initial.url === 'string' ? initial.url : '');
      const [label, setLabel] = React.useState(typeof initial.label === 'string' ? initial.label : '');
      const [token, setToken] = React.useState('');
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
          const result = await controller.act(endpoint, { url, token, label });
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

      return h('form', { onSubmit, style: { margin: 0 } },
        h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, t('clientTitle')),
          h('p', { style: styles.hint }, t('clientHint')),
          h(Field, {
            label: t('urlLabel'),
            value: url,
            placeholder: t('urlPlaceholder'),
            onChange: (event) => setUrl(event.target.value),
          }),
          h(Field, {
            label: t('tokenLabel'),
            value: token,
            placeholder: t('tokenPlaceholder'),
            type: 'password',
            onChange: (event) => setToken(event.target.value),
          }),
          h(Field, {
            label: t('labelLabel'),
            value: label,
            placeholder: t('labelPlaceholder'),
            onChange: (event) => setLabel(event.target.value),
          }),
          h('div', { style: styles.row },
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
          h(Notice, { error: true }, error ? describeError(error, t) : ''),
          h(Notice, {}, notice),
          testedHost ? h('div', { style: { ...styles.badge, marginTop: 10 } },
            h('span', { style: dotStyle('ok') }),
            `${hostName(testedHost, t)} · ${testedHost.platform ?? t('unknown')} · ${t('version')} ${testedHost.harnessVersion || testedHost.pluginVersion || t('unknown')}`,
          ) : null,
        ),
      );
    }

    function RemoteView(props) {
      const { controller, t, status, useWorkspaces } = props;
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [workspaceError, setWorkspaceError] = React.useState(null);
      const workspaces = useWorkspaces((state) => state.items);
      const items = Array.isArray(workspaces) ? workspaces : [];
      const remote = status.remote;
      const host = remote.host;
      const online = remote.connected;
      const remoteName = host ? hostName(host, t) : (remote.label || remote.url || t('remote'));

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
        h('div', { style: styles.header },
          h('h2', { style: styles.title }, t('panel')),
          h('span', { style: styles.badge },
            h('span', { style: dotStyle(online ? 'ok' : 'error') }),
            online ? t('connected') : t('disconnected'),
          ),
        ),
        h('p', { style: styles.subtitle }, `${t('remote')} · ${remoteName}`),
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
        ),
        h('div', { style: styles.card },
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
      const { controller, t, status } = props;
      const [token, setToken] = React.useState('');
      const [show, setShow] = React.useState(false);
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

      const reveal = async () => {
        const value = await run('hostInfo');
        if (value && typeof value.token === 'string') {
          setToken(value.token);
          setShow(true);
          setNotice('');
        }
      };

      const copy = async () => {
        if (token === '') return;
        try {
          await navigator.clipboard.writeText(token);
          setNotice(t('copied'));
        } catch {
          setError({ code: 'remote/unsupported', message: '剪贴板不可用；请显示令牌后手动选择复制。' });
        }
      };

      const rotate = async () => {
        if (!window.confirm(t('rotateConfirm'))) return;
        const value = await run('rotateToken');
        if (value && typeof value.token === 'string') {
          setToken(value.token);
          setShow(true);
          setNotice(t('rotate'));
        }
      };

      const drop = async () => {
        if (!window.confirm(t('dropConfirm'))) return;
        await run('dropClients');
      };

      const forget = async () => {
        if (!window.confirm(t('forgetConfirm'))) return;
        await run('forgetHostToken');
        setToken('');
        setShow(false);
      };

      return h('div', null,
        h('div', { style: styles.header },
          h('h2', { style: styles.title }, t('panel')),
          h('span', { style: styles.badge },
            h('span', { style: dotStyle(host.listening ? 'busy' : 'error') }),
            host.listening ? t('listening') : t('host'),
          ),
        ),
        h('p', { style: styles.subtitle }, `${t('hostTitle')} · ${host.listening ? host.url : t('hostNotRunning')}`),
        h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, t('hostTitle')),
          h('p', { style: styles.hint }, t('hostHint')),
          host.listening
            ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '6px 16px', marginBottom: 8 } },
                h('div', null, h('span', { style: styles.label }, `${t('listenAddress')}：`), h('span', { style: styles.mono }, host.url)),
                h('div', null, h('span', { style: styles.label }, `${t('deviceName')}：`), info?.deviceName ?? t('unknown')),
                h('div', null, h('span', { style: styles.label }, `${t('platform')}：`), info?.platform ?? t('unknown')),
                h('div', null, h('span', { style: styles.label }, `${t('version')}：`), info?.harnessVersion || t('unknown')),
              )
            : h('p', { style: styles.hint }, host.starting ? t('loading') : t('hostNotRunning')),
          host.error ? h(Notice, { error: true }, `${t('hostError')}：${host.error.code} ${host.error.message}`) : null,
        ),
        host.listening ? h('div', { style: styles.card },
          h('h3', { style: styles.cardTitle }, t('hostToken')),
          h('p', { style: styles.hint }, t('hostHint')),
          h('div', { style: styles.field },
            h('span', { style: styles.label }, t('hostToken')),
            h('input', {
              style: styles.input,
              type: show ? 'text' : 'password',
              readOnly: true,
              autoComplete: 'off',
              spellCheck: false,
              value: token,
              placeholder: show ? '' : '••••••••••••',
            }),
          ),
          h('div', { style: styles.row },
            h(Button, { disabled: busy, onClick: () => void reveal() }, t('showToken')),
            h(Button, { disabled: busy || token === '', onClick: () => void copy() }, t('copy')),
            h(Button, { disabled: busy || token === '', onClick: () => setShow((value) => !value) }, show ? t('hideToken') : t('showToken')),
            h(Button, { variant: 'danger', disabled: busy, onClick: () => void rotate() }, t('rotate')),
            h(Button, { variant: 'danger', disabled: busy, onClick: () => void drop() }, t('dropClients')),
            h(Button, { variant: 'danger', disabled: busy, onClick: () => void forget() }, t('forgetToken')),
          ),
          h(Notice, {}, notice),
          h(Notice, { error: true }, error ? describeError(error, t) : ''),
        ) : null,
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

    function RemotePanel(props) {
      const controller = props.controller;
      const ctx = props.ctx;
      const t = useTranslate(ctx);
      const snapshot = useSnapshot(controller);
      const status = snapshot.status;
      const mode = status?.mode;

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
          h(Button, { onClick: () => void controller.refresh() }, t('retry')),
        );
      }

      if (mode === 'remote' || mode === 'remote-offline') {
        return h('div', { style: styles.panel },
          h(RemoteView, { controller, t, status, useWorkspaces: props.useWorkspaces, ctx }),
          mode === 'remote-offline'
            ? h(ClientForm, { controller, t, initial: status.clientConfig })
            : null,
        );
      }

      if (mode === 'host') {
        return h('div', { style: styles.panel },
          h(HostView, { controller, t, status }),
        );
      }

      return h('div', { style: styles.panel },
        h(ClientForm, { controller, t, initial: status.clientConfig }),
      );
    }

    function StatusPill(props) {
      const controller = props.controller;
      const ctx = props.ctx;
      const t = useTranslate(ctx);
      const snapshot = useSnapshot(controller);
      const status = snapshot.status;
      const mode = status?.mode;
      const remote = status?.remote;
      const host = status?.host;
      const remoteName = remote?.host
        ? hostName(remote.host, t)
        : (remote?.label || remote?.url || t('remote'));

      let label;
      let kind = 'idle';
      let title;
      if (mode === 'remote') {
        label = `${t('panel')} · ${t('connected')} · ${remoteName}`;
        kind = 'ok';
        title = remote?.url || '';
      } else if (mode === 'remote-offline') {
        label = `${t('panel')} · ${t('remoteOffline')} · ${remoteName}`;
        kind = 'error';
        title = remote?.error ? describeError(remote.error, t) : '';
      } else if (mode === 'host') {
        label = `${t('panel')} · ${t('host')} · ${t('listening')}`;
        kind = 'busy';
        title = host?.url || '';
      } else if (snapshot.phase === 'error' && !status) {
        label = `${t('panel')} · ${t('statusUnavailable')}`;
        kind = 'error';
        title = describeError(snapshot.error, t);
      } else {
        label = `${t('panel')} · ${t('local')}`;
        kind = 'idle';
        title = t('clientTitle');
      }

      const onClick = () => {
        try {
          ctx.layout?.selectPanel(PANEL_ID);
        } catch {
          // The sidebar entry is always available even if the layout service rejects the call.
        }
      };

      return h('button', {
        type: 'button',
        style: styles.statusPill,
        onClick,
        title: title || label,
      },
        h('span', { style: dotStyle(kind) }),
        h('span', { style: styles.statusText }, label),
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

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel'),
        }, RemotePanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, (props) => h(RemotePanel, { ...props, controller, ctx })));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'private-remote-status',
          order: 100,
          locale: NS,
        }, (props) => h(StatusPill, { ...props, controller, ctx })));

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
