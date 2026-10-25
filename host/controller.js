/**
 * Private Remote controller.
 *
 * One plugin, two roles:
 *   - client: bridge client + local Gateway switch, driven by the browser panel;
 *   - host:   remote bridge server on a separate port, bound to a private IP.
 *
 * The browser control channel only accepts the authenticated local Browser
 * Peer. The Host bridge has no pairing token: it binds the Tailscale IPv4 and
 * treats the tailnet ACL as the security boundary.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CONTROL_CHANNEL,
  ERR,
  PLUGIN_VERSION,
  PROTOCOL_VERSION,
  TRANSPORT_KEY,
  fail,
  isPlainObject,
  ok,
  toFailure,
} from '../shared/protocol.js';
import {
  DEFAULT_CONFIG,
  ConfigError,
  findTailscaleAddress,
  normalizeConfig,
  validateRemoteUrl,
} from './config.js';
import {
  buildSettingsConfig,
  findSettingsEntry,
  probeBind,
  settingsChanged,
} from './settings.js';
import { BridgeClient } from './bridge-client.js';
import { BridgeServer } from './bridge-server.js';
import { createGatewaySwitch } from './gateway-switch.js';
import { registerControlRoute } from './control-route.js';
import {
  SUPPORTED_HARNESS,
  harnessVersion,
  probeGateway,
} from './compat/dsh-0.2.1-rc.3.js';
import { createLogger } from './log.js';

function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') return configured;
  return path.join(os.homedir(), '.dsh');
}

function errorOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.code === 'string') {
    return fail(
      error.code,
      typeof error.message === 'string' ? error.message : error.code,
      error.details !== null && typeof error.details === 'object' ? error.details : {},
    );
  }
  return fail(ERR.INTERNAL, error instanceof Error ? error.message : String(error));
}

function roleIncludesHost(roleOrConfig) {
  const role = typeof roleOrConfig === 'string' ? roleOrConfig : roleOrConfig?.role;
  return role === 'host' || role === 'both';
}

export class PrivateRemoteController {
  /**
   * @param {any} ctx
   * @param {unknown} rawConfig
   */
  constructor(ctx, rawConfig) {
    this.ctx = ctx;
    this.log = createLogger('controller');
    this.configError = null;
    try {
      this.config = normalizeConfig(rawConfig);
    } catch (error) {
      this.configError = error instanceof ConfigError ? error : new ConfigError(ERR.NOT_CONFIGURED, String(error));
      this.config = { ...DEFAULT_CONFIG };
    }
    this.gateway = null;
    this.connection = null;
    this.compat = null;
    this.bridge = null;
    this.switch = null;
    this.hostServer = null;
    this.hostStarting = false;
    this.tailscaleAddress = null;
    this.intentionalClose = false;
    this.disposed = false;
    this.configEditor = null;
    this.hostDeps = null;
    this.remoteState = {
      installed: false,
      active: false,
      connected: false,
      host: null,
      url: '',
      error: null,
      generation: 0,
    };
    this.hostState = {
      enabled: roleIncludesHost(this.config),
      listening: false,
      host: '',
      port: this.config.port,
      url: null,
      error: null,
      stopped: false,
    };
    this.clientConfig = { url: '' };
    this.configDir = path.join(dshHome(), 'private-remote');
    this.clientConfigPath = path.join(this.configDir, 'client.json');
    this.hostMetaPath = path.join(this.configDir, 'host-meta.json');
    this.loading = this.loadClientConfig();
    this.hostIdPromise = this.loadHostId();
  }

  start() {
    this.ctx.effect(() => () => this.dispose(), 'private-remote: lifecycle');
    // The installed rpc.handle() registers through the connection service's
    // own fiber, which does not inject webServer. Register a private prefix
    // route directly and reuse the official connection.admit()/browserPeer
    // admission instead.
    this.ctx.inject(['connection', 'webServer'], (c) => {
      this.connection = c.connection;
      registerControlRoute({
        ctx: c,
        connection: c.connection,
        handle: (action, payload, signal, peer) => this.handleControl(action, payload, signal, peer),
        log: this.log,
      });
      this.log.info(`control channel registered at ${CONTROL_CHANNEL}`);
    });
    this.ctx.inject(['typertGateway'], (c) => {
      this.gateway = c.typertGateway;
      this.compat = probeGateway(c.typertGateway);
      if (!this.compat.ok) {
        this.log.warn('gateway compatibility missing:', this.compat.missing.join(', ') || 'unknown');
      }
      this.ensureSwitch();
    });
    this.ctx.inject(['configEditor'], (c) => {
      this.configEditor = c.configEditor;
      this.log.info('official config editor available');
      return () => {
        if (this.configEditor === c.configEditor) this.configEditor = null;
      };
    });
    this.ctx.inject(['connection', 'typertGateway'], (c) => {
      this.connection = c.connection;
      this.gateway = c.typertGateway;
      this.hostDeps = c;
      this.compat = probeGateway(c.typertGateway);
      this.ensureSwitch();
      if (roleIncludesHost(this.config)) {
        void this.startHostBridge();
      }
    });
    // A persisted pairing only prefills the Settings form. Never install the
    // Gateway switch before the official client boot: a boot-time switch would
    // fail $events/settings and leave the whole client tree pending. Local mode
    // is safe and honest; the user explicitly reconnects from Settings.
    void this.loading.then(() => this.ensureSwitch());
  }

  ensureSwitch() {
    if (this.config.role === 'host') return;
    if (this.gateway === null || this.connection === null) return;
    if (this.switch === null) {
      this.switch = createGatewaySwitch({
        gateway: this.gateway,
        connection: this.connection,
        state: this.remoteState,
        getBridge: () => this.bridge,
      });
    }
    if (!this.remoteState.active && !this.remoteState.installed && this.clientConfig.url !== '') {
      this.remoteState.url = this.clientConfig.url;
      this.log.info('saved pairing loaded; staying local until explicit reconnect');
    }
  }

  async startHostBridge() {
    if (this.disposed) return;
    if (this.hostStarting || this.hostServer !== null) return;
    this.hostStarting = true;
    const tailscale = findTailscaleAddress();
    this.tailscaleAddress = tailscale;
    this.hostState = {
      enabled: roleIncludesHost(this.config),
      listening: false,
      host: tailscale ?? '',
      port: this.config.port,
      url: null,
      error: null,
      stopped: false,
    };
    try {
      const deps = this.hostDeps;
      if (deps === null) {
        const error = new Error('Host 服务尚未注入完成；请稍后重试');
        error.code = ERR.NOT_CONFIGURED;
        throw error;
      }
      if (this.configError !== null) {
        throw this.configError;
      }
      if (tailscale === null) {
        throw new ConfigError(
          ERR.TAILSCALE_MISSING,
          '未检测到 Tailscale IPv4；请先启动并登录 Tailscale，Host 只监听 100.64.0.0/10',
        );
      }
      const compat = probeGateway(deps.typertGateway);
      this.compat = compat;
      if (!compat.ok) {
        const error = new Error(`官方 Gateway 契约不匹配：${compat.missing.join(', ')}`);
        error.code = ERR.UNSUPPORTED;
        throw error;
      }
      const hostId = await this.hostIdPromise;
      const server = new BridgeServer({
        connection: deps.connection,
        gateway: deps.typertGateway,
        config: {
          role: this.config.role,
          bindHost: tailscale,
          port: this.config.port,
          label: '',
        },
        token: TRANSPORT_KEY,
        hostId,
        compat,
        harnessVersion: harnessVersion(),
        log: this.log,
        onChange: () => undefined,
      });
      await server.start();
      if (this.disposed) {
        try {
          await server.stop();
        } catch {
          // The controller is already unloading; the listener must not leak.
        }
        return;
      }
      this.hostServer = server;
      this.hostState = {
        enabled: true,
        listening: true,
        host: tailscale,
        port: server.port,
        url: server.listenUrl(),
        error: null,
        stopped: false,
      };
      this.log.info('host role ready on', server.listenUrl());
    } catch (error) {
      this.hostState = {
        enabled: roleIncludesHost(this.config),
        listening: false,
        host: tailscale ?? '',
        port: this.config.port,
        url: null,
        error: {
          code: typeof error?.code === 'string' ? error.code : ERR.NOT_CONFIGURED,
          message: error instanceof Error ? error.message : String(error),
        },
        stopped: false,
      };
      this.log.error('host role failed:', typeof error?.code === 'string' ? error.code : 'unknown', error instanceof Error ? error.message : String(error));
    } finally {
      this.hostStarting = false;
    }
  }

  async handleControl(endpoint, payload, signal, peer) {
    try {
      await this.loading;
      if (this.connection === null || peer !== this.connection.browserPeer) {
        return fail(ERR.FORBIDDEN, '私人远程控制通道只接受本机已认证浏览器');
      }
      if (endpoint !== 'status') this.log.info(`control request: ${endpoint}`);
      const input = isPlainObject(payload) ? payload : {};
      switch (endpoint) {
        case 'status':
          return ok(this.status());
        case 'test':
          return await this.testConnection(input);
        case 'connect':
          return await this.connectAction(input);
        case 'disconnect':
          return await this.disconnectAction();
        case 'useLocal':
          return await this.useLocalAction();
        case 'reconnect':
          return await this.reconnectAction();
        case 'hostInfo':
          return await this.hostInfoAction();
        case 'dropClients':
          return await this.dropClientsAction();
        case 'saveSettings':
          return await this.saveSettingsAction(input);
        case 'resetSettings':
          return await this.resetSettingsAction();
        case 'startHost':
          return await this.startHostAction();
        case 'stopHost':
          return await this.stopHostAction();
        default:
          return fail(ERR.PROTOCOL, `未知控制操作 ${String(endpoint)}`);
      }
    } catch (error) {
      return errorOf(error);
    }
  }

  status() {
    const compat = this.compat;
    const tailscale = findTailscaleAddress();
    this.tailscaleAddress = tailscale;
    const remote = {
      installed: this.remoteState.installed,
      active: this.remoteState.active,
      connected: this.remoteState.connected,
      host: this.remoteState.host,
      url: this.remoteState.url,
      error: this.remoteState.error,
      generation: this.remoteState.generation,
    };
    const host = {
      enabled: roleIncludesHost(this.config),
      listening: this.hostServer !== null,
      starting: this.hostStarting,
      stopped: this.hostState.stopped === true,
      host: tailscale ?? this.hostState.host ?? '',
      port: this.hostServer?.port ?? this.config.port,
      url: this.hostServer?.listenUrl() ?? null,
      info: this.hostServer?.hostInfo() ?? null,
      clients: this.hostServer?.clientInfos() ?? [],
      error: this.hostState.error,
    };
    return {
      mode: remote.installed ? (remote.active ? 'remote' : 'remote-offline') : (host.listening ? 'host' : 'local'),
      remote,
      host,
      tailscale,
      clientConfig: { url: this.clientConfig.url },
      config: {
        role: this.config.role,
        port: this.config.port,
      },
      settingsWritable: this.configEditor !== null,
      configError: this.configError === null ? null : {
        code: this.configError.code,
        message: this.configError.message,
      },
      compat,
      protocol: PROTOCOL_VERSION,
      pluginVersion: PLUGIN_VERSION,
      supportedHarness: SUPPORTED_HARNESS,
      localHarnessVersion: harnessVersion(),
    };
  }

  parseConnectInput(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const parsed = validateRemoteUrl(rawUrl);
    return { url: parsed.url, secure: parsed.secure };
  }

  createBridgeClient(input) {
    return new BridgeClient({
      url: input.url,
      token: TRANSPORT_KEY,
      clientName: os.hostname(),
      clientHarnessVersion: harnessVersion(),
      pluginVersion: PLUGIN_VERSION,
      onClose: (error) => this.handleBridgeClose(error),
    });
  }

  validateHostInfo(host) {
    if (!isPlainObject(host)) throw new ConfigError(ERR.PROTOCOL, '远端 ready 帧缺少 Host 信息');
    if (host.protocol !== PROTOCOL_VERSION) {
      throw new ConfigError(ERR.VERSION_MISMATCH, `远端协议版本 ${String(host.protocol)} 与本地 ${PROTOCOL_VERSION} 不一致`);
    }
    if (!isPlainObject(host.compat) || host.compat.ok !== true) {
      const missing = isPlainObject(host.compat) && Array.isArray(host.compat.missing) ? host.compat.missing.join(', ') : 'unknown';
      throw new ConfigError(ERR.VERSION_MISMATCH, `远端 Host 兼容性检查未通过：${missing}`);
    }
    const localVersion = harnessVersion();
    const remoteVersion = typeof host.harnessVersion === 'string' ? host.harnessVersion : '';
    if (localVersion !== '' && remoteVersion !== '' && localVersion !== remoteVersion) {
      throw new ConfigError(ERR.VERSION_MISMATCH, `本机 Harness ${localVersion} 与远端 ${remoteVersion} 不一致`);
    }
    return host;
  }

  async testConnection(input) {
    if (this.config.role === 'host') {
      return fail(ERR.CLIENT_DISABLED, '当前运行模式为 Host；请先在 设置 → 私人远程 中切换到“客户端”或“两者”');
    }
    const parsed = this.parseConnectInput(input);
    const client = this.createBridgeClient(parsed);
    try {
      const host = this.validateHostInfo(await client.connect());
      return ok({ host, url: parsed.url });
    } finally {
      client.close('测试连接完成');
    }
  }

  async connectAction(input) {
    if (this.config.role === 'host') {
      return fail(ERR.CLIENT_DISABLED, '当前运行模式为 Host；请先在 设置 → 私人远程 中切换到“客户端”或“两者”');
    }
    const parsed = this.parseConnectInput(input);
    if (this.configError !== null) return errorOf(this.configError);
    if (this.switch === null || this.gateway === null) {
      return fail(ERR.UNSUPPORTED, '本机 Typert Gateway 不可用，无法切换到远端');
    }
    if (this.remoteState.active) {
      await this.disconnectInternal();
    }
    const client = this.createBridgeClient(parsed);
    let host;
    try {
      host = this.validateHostInfo(await client.connect());
    } catch (error) {
      client.close('连接失败');
      throw error;
    }
    this.bridge = client;
    this.remoteState.active = true;
    this.remoteState.connected = true;
    this.remoteState.host = host;
    this.remoteState.url = parsed.url;
    this.remoteState.error = null;
    this.remoteState.generation += 1;
    try {
      this.switch.install();
      this.remoteState.installed = true;
    } catch (error) {
      this.remoteState.active = false;
      this.remoteState.connected = false;
      this.remoteState.installed = false;
      this.remoteState.host = null;
      this.bridge = null;
      client.close('切换失败');
      throw error;
    }
    try {
      await this.saveClientConfig({ url: parsed.url });
    } catch (error) {
      this.log.warn('client config save failed:', error instanceof Error ? error.message : String(error));
    }
    this.log.info('remote mode active', host.deviceName, host.hostname, host.platform);
    return ok({ host, url: parsed.url });
  }

  async disconnectAction() {
    await this.disconnectInternal();
    this.switch?.uninstall();
    this.remoteState.installed = false;
    this.remoteState.url = this.clientConfig.url;
    this.remoteState.generation += 1;
    this.log.info('remote disconnected; local mode (saved address kept for reconnect)');
    return ok(this.status());
  }

  async useLocalAction() {
    if (this.config.role === 'host') {
      return fail(ERR.CLIENT_DISABLED, '当前运行模式为 Host；本机切换仅用于客户端模式');
    }
    await this.disconnectInternal();
    this.switch?.uninstall();
    this.remoteState.installed = false;
    this.remoteState.url = '';
    this.remoteState.generation += 1;
    this.clientConfig = { url: '' };
    try {
      await fs.rm(this.clientConfigPath, { force: true });
    } catch (error) {
      this.log.warn('client config removal failed:', error instanceof Error ? error.message : String(error));
    }
    this.log.info('switched to local mode');
    return ok(this.status());
  }

  async disconnectInternal() {
    this.intentionalClose = true;
    const bridge = this.bridge;
    this.bridge = null;
    if (bridge !== null) bridge.close('已退出远程模式');
    // Leave the switch installed here. The caller decides the next state:
    // disconnectAction returns to local and uninstalls it, useLocal uninstalls
    // and clears the saved pairing, and reconnect reuses it for the new bridge.
    this.remoteState.active = false;
    this.remoteState.connected = false;
    this.remoteState.host = null;
    this.remoteState.error = null;
    this.remoteState.installed = this.switch?.installed === true;
    this.remoteState.generation += 1;
    this.intentionalClose = false;
    this.log.info('remote mode disconnected');
  }

  async reconnectAction() {
    if (this.config.role === 'host') {
      return fail(ERR.CLIENT_DISABLED, '当前运行模式为 Host；请先在 设置 → 私人远程 中切换到“客户端”或“两者”');
    }
    const { url } = this.remoteState;
    if (typeof url !== 'string' || url === '') {
      return fail(ERR.NOT_CONFIGURED, '没有上次的 Host 地址，请重新输入');
    }
    await this.disconnectInternal();
    return this.connectAction({ url });
  }

  async hostInfoAction() {
    if (this.hostServer === null) {
      return fail(ERR.NOT_CONFIGURED, 'Host 桥未启动；请在 设置 → 私人远程 中启用 Host，或点击“启动 Host 桥”');
    }
    return ok({
      listen: { host: this.hostServer.config.bindHost, port: this.hostServer.port, url: this.hostServer.listenUrl() },
      info: this.hostServer.hostInfo(),
      clients: this.hostServer.clientInfos(),
    });
  }

  async dropClientsAction() {
    if (this.hostServer === null) {
      return fail(ERR.NOT_CONFIGURED, 'Host 桥未启动');
    }
    await this.hostServer.dropClients();
    return ok({ clients: this.hostServer.clientInfos() });
  }

  async stopHostAction() {
    const server = this.hostServer;
    this.hostServer = null;
    if (server !== null) await server.stop();
    this.hostState = {
      enabled: roleIncludesHost(this.config),
      listening: false,
      host: this.tailscaleAddress ?? '',
      port: this.config.port,
      url: null,
      error: null,
      stopped: true,
    };
    this.log.info('host bridge stopped');
    return ok(this.status());
  }

  async saveSettingsAction(input) {
    if (this.remoteState.active) {
      return fail(ERR.REMOTE_ACTIVE, '正在连接远端；请先“切换回本机”再修改 Host 设置');
    }
    let normalized;
    try {
      normalized = normalizeConfig(input);
    } catch (error) {
      throw new ConfigError(
        ERR.CONFIG_INVALID,
        error instanceof Error ? error.message : String(error),
        error?.details !== null && typeof error?.details === 'object' ? error.details : {},
      );
    }
    if (this.configEditor === null) {
      return fail(ERR.UNSUPPORTED, '官方配置编辑器不可用；请用 cordis.patch.yml 配置后重启 Harness');
    }
    const entry = findSettingsEntry(this.configEditor.entries());
    const currentRaw = entry.options.config ?? {};
    let currentNormalized = null;
    try {
      currentNormalized = normalizeConfig(currentRaw);
    } catch {
      // The current profile row is invalid; a valid save is allowed to repair it.
      currentNormalized = null;
    }
    if (currentNormalized !== null && !settingsChanged(currentNormalized, normalized)) {
      return ok({ applied: false, unchanged: true });
    }
    if (roleIncludesHost(normalized)) {
      const tailscale = findTailscaleAddress();
      if (tailscale === null) {
        throw new ConfigError(
          ERR.TAILSCALE_MISSING,
          '未检测到 Tailscale IPv4；请先启动并登录 Tailscale，Host 只监听 100.64.0.0/10',
        );
      }
      if (this.hostServer === null || this.hostServer.port !== normalized.port) {
        await probeBind(tailscale, normalized.port);
      }
    }
    this.log.info(
      'settings save requested:',
      normalized.role,
      normalized.port,
    );
    await this.configEditor.edit(entry, (current) => buildSettingsConfig(current, normalized));
    return ok({ applied: true, reloading: true });
  }

  async resetSettingsAction() {
    if (this.remoteState.active) {
      return fail(ERR.REMOTE_ACTIVE, '正在连接远端；请先“切换回本机”再修改设置');
    }
    if (this.configEditor === null) {
      return fail(ERR.UNSUPPORTED, '官方配置编辑器不可用；请用 cordis.patch.yml 配置后重启 Harness');
    }
    const entry = findSettingsEntry(this.configEditor.entries());
    this.log.info('settings reset requested');
    await this.configEditor.edit(entry, (_current, inherited) => inherited);
    return ok({ applied: true, reloading: true });
  }

  async startHostAction() {
    if (!roleIncludesHost(this.config)) {
      return fail(ERR.NOT_CONFIGURED, '当前运行模式不含 Host；请先切换到 Host 或“两者”');
    }
    if (this.hostServer !== null) return ok(this.status().host);
    if (this.hostStarting) return ok(this.status().host);
    await this.startHostBridge();
    if (this.hostServer === null) {
      const error = this.hostState.error;
      return fail(
        typeof error?.code === 'string' ? error.code : ERR.NOT_CONFIGURED,
        typeof error?.message === 'string' ? error.message : 'Host 桥未能启动',
      );
    }
    return ok(this.status().host);
  }

  handleBridgeClose(error) {
    if (this.intentionalClose || !this.remoteState.active) return;
    this.remoteState.connected = false;
    this.remoteState.error = {
      code: typeof error?.code === 'string' ? error.code : ERR.OFFLINE,
      message: error instanceof Error ? error.message : '远端连接已断开',
    };
    this.bridge = null;
    this.log.warn('remote disconnected:', this.remoteState.error.code);
    // The switch deliberately stays installed so local calls cannot silently
    // become local work while the user still sees a remote workspace.
  }

  async loadClientConfig() {
    try {
      const text = await fs.readFile(this.clientConfigPath, 'utf8');
      const parsed = JSON.parse(text);
      const url = typeof parsed?.url === 'string' ? parsed.url : '';
      let validated = '';
      if (url !== '') {
        try {
          validated = validateRemoteUrl(url).url;
        } catch {
          validated = '';
        }
      }
      this.clientConfig = { url: validated };
    } catch {
      this.clientConfig = { url: '' };
    }
  }

  async saveClientConfig(config) {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const body = JSON.stringify({ url: config.url }, null, 2);
    await fs.writeFile(this.clientConfigPath, `${body}\n`, { mode: 0o600 });
  }

  async loadHostId() {
    try {
      const text = await fs.readFile(this.hostMetaPath, 'utf8');
      const parsed = JSON.parse(text);
      if (typeof parsed?.hostId === 'string' && parsed.hostId.length >= 8) return parsed.hostId;
    } catch {
      // Create below.
    }
    const hostId = randomUUID();
    try {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(this.hostMetaPath, `${JSON.stringify({ hostId }, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      this.log.warn('host meta write failed:', error instanceof Error ? error.message : String(error));
    }
    return hostId;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.intentionalClose = true;
    const bridge = this.bridge;
    this.bridge = null;
    if (bridge !== null) bridge.close('插件已停止');
    this.switch?.uninstall();
    this.remoteState.installed = false;
    this.remoteState.active = false;
    this.remoteState.connected = false;
    const server = this.hostServer;
    this.hostServer = null;
    if (server !== null) {
      try {
        await server.stop();
      } catch {
        // ignore
      }
    }
    this.configEditor = null;
    this.hostDeps = null;
  }
}
