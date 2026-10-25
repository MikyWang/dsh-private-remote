/**
 * Helpers for editing this plugin's Host configuration from the official
 * Settings page.
 *
 * The plugin deliberately exports no schemastery Config: the official
 * `settings.update` / `configForms` paths require one, while
 * `ctx.configEditor.edit()` accepts a complete raw config without a schema.
 * Everything here is plain data or a short `net` probe, so it is unit-testable
 * without the Harness runtime.
 */

import net from 'node:net';
import os from 'node:os';
import { ConfigError, validateBindHost } from './config.js';
import { ERR } from '../shared/protocol.js';

export const SETTINGS_PACKAGE_NAME = 'dsh-private-remote';
export const SETTINGS_ENTRY_ID = 'private-remote';

/**
 * Find the one profile entry this plugin owns.
 *
 * `configEditor.entries()` only returns root-Include rows with a unique patch
 * id. A bundle-inserted row is visible as `include:private-remote` with
 * `options.id === 'private-remote'`, so matching on the package name first and
 * the patch id second is robust to the display prefix.
 *
 * @param {Array<{ options?: { id?: string, name?: string } }>} entries
 * @returns {{ options: { id: string, name: string } }}
 */
export function findSettingsEntry(entries) {
  if (!Array.isArray(entries)) {
    throw new ConfigError(ERR.CONFIG_SAVE_FAILED, '官方配置编辑器不可用；请用 cordis.patch.yml 配置');
  }
  const byName = entries.filter((entry) => entry?.options?.name === SETTINGS_PACKAGE_NAME);
  const candidates = byName.length > 0
    ? byName
    : entries.filter((entry) => entry?.options?.id === SETTINGS_ENTRY_ID);
  if (candidates.length === 0) {
    throw new ConfigError(ERR.CONFIG_SAVE_FAILED, '找不到本插件的 profile 配置行；请确认 dsh-private-remote 已安装并启用');
  }
  if (candidates.length > 1) {
    throw new ConfigError(ERR.CONFIG_SAVE_FAILED, '存在多个 private-remote 配置行；请只保留一个，或改用 cordis.patch.yml 配置');
  }
  return candidates[0];
}

/**
 * Build the complete raw config written through configEditor.
 *
 * `current` is the entry's effective raw config. Spreading it preserves fields
 * this version does not know about (and any future ones); the four settings
 * fields are always explicit so the profile override is self-contained.
 *
 * @param {unknown} current
 * @param {{ role: string, bindHost: string, port: number, label: string }} next
 * @returns {Record<string, unknown>}
 */
export function buildSettingsConfig(current, next) {
  const base = current !== null && typeof current === 'object' && !Array.isArray(current)
    ? current
    : {};
  return {
    ...base,
    role: next.role,
    bindHost: next.bindHost,
    port: next.port,
    label: next.label,
  };
}

/**
 * Compare normalized settings to avoid a needless plugin reload.
 * @param {{ role?: unknown, bindHost?: unknown, port?: unknown, label?: unknown } | null} current
 * @param {{ role: string, bindHost: string, port: number, label: string }} next
 */
export function settingsChanged(current, next) {
  if (current === null || typeof current !== 'object') return true;
  return current.role !== next.role
    || current.bindHost !== next.bindHost
    || Number(current.port) !== Number(next.port)
    || (typeof current.label === 'string' ? current.label : '') !== next.label;
}

/**
 * Verify that a literal address is actually assigned to a local interface.
 *
 * Used when the current Host bridge already owns the target port: binding a
 * second listener on that port would be refused on Windows even when the
 * interface differs, so the address is checked against the live interface list
 * instead.
 *
 * @param {string} bindHost
 * @param {ReturnType<typeof listLocalAddresses>} [addresses]
 * @returns {string}
 */
export function assertLocalBindAddress(bindHost, addresses = listLocalAddresses()) {
  const host = validateBindHost(bindHost);
  if (host === 'localhost' || host === '::1' || /^127\./.test(host)) return host;
  if (!addresses.some((entry) => entry.address === host)) {
    throw new ConfigError(
      ERR.BIND_INVALID,
      `地址 ${host} 不属于本机接口；请选择检测到的地址，或确认 Tailscale 已连接`,
      { field: 'bindHost', cause: 'EADDRNOTAVAIL' },
    );
  }
  return host;
}

function closeServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function bindErrorText(host, port, error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'EADDRINUSE') {
    return `端口 ${port} 已被占用，或被 Windows/WSL/安全软件保留；如果 netstat / Get-NetTCPConnection 看不到监听进程，请换一个空闲端口（例如 18082）`;
  }
  if (code === 'EADDRNOTAVAIL') return `地址 ${host} 不属于本机接口；请选择检测到的地址，或确认 Tailscale 已连接`;
  if (code === 'EACCES') return `没有权限监听 ${host}:${port}`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `无法解析地址 ${host}`;
  return `无法监听 ${host}:${port}：${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Verify that the exact Host address/port can be bound right now.
 *
 * The temporary listener is closed before returning. This catches the common
 * mistakes (wrong Tailscale IP, port already used) before configEditor writes
 * the profile and reloads the plugin, so a failed edit does not disconnect
 * existing Host clients.
 *
 * @param {string} bindHost
 * @param {number} port
 */
export async function probeBind(bindHost, port) {
  const host = validateBindHost(bindHost);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(ERR.NOT_CONFIGURED, 'port 必须是 1-65535 的整数');
  }
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      try {
        server.listen({ host, port, exclusive: true });
      } catch (error) {
        server.off('listening', onListening);
        server.off('error', onError);
        reject(error);
      }
    });
  } catch (error) {
    await closeServer(server);
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(ERR.BIND_INVALID, bindErrorText(host, port, error), {
      field: 'bindHost',
      cause: typeof error?.code === 'string' ? error.code : 'unknown',
    });
  }
  await closeServer(server);
}

function addressKind(address, family) {
  if (family === 'IPv4') {
    if (address === '127.0.0.1' || address.startsWith('127.')) return 'loopback';
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) return 'tailscale';
    if (/^10\./.test(address)
      || /^192\.168\./.test(address)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 'private';
    return null;
  }
  if (family === 'IPv6') {
    if (address === '::1') return 'loopback';
    // fc00::/7, unique local addresses. Link-local fe80::/10 is deliberately
    // excluded: binding it needs a zone id the config validator does not carry.
    if (/^f[cd][0-9a-f]{2}:/i.test(address)) return 'ula';
    return null;
  }
  return null;
}

/**
 * Private interface addresses a person can actually bind, ordered for display.
 *
 * @param {ReturnType<typeof os.networkInterfaces>} [interfaces]
 * @returns {Array<{ address: string, family: 'IPv4' | 'IPv6', kind: 'tailscale' | 'private' | 'ula' | 'loopback', interfaceName: string }>}
 */
export function listLocalAddresses(interfaces = os.networkInterfaces()) {
  const seen = new Set();
  const result = [];
  for (const [interfaceName, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const address = typeof entry?.address === 'string' ? entry.address : '';
      if (address === '' || seen.has(address)) continue;
      const rawFamily = entry?.family;
      const family = rawFamily === 4 || rawFamily === 'IPv4'
        ? 'IPv4'
        : rawFamily === 6 || rawFamily === 'IPv6'
          ? 'IPv6'
          : '';
      if (family === '') continue;
      const kind = addressKind(address, family);
      if (kind === null) continue;
      seen.add(address);
      result.push({ address, family, kind, interfaceName });
    }
  }
  const rank = { tailscale: 0, private: 1, ula: 2, loopback: 3 };
  result.sort((a, b) => rank[a.kind] - rank[b.kind] || a.address.localeCompare(b.address));
  return result;
}
