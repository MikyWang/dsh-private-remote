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
import { ConfigError, validateHostAddress } from './config.js';
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
 * this version does not know about; the two settings fields are explicit.
 * Legacy `bindHost`/`label` fields are removed on save because the Host now
 * always binds the detected Tailscale address and the device name comes from
 * the handshake.
 *
 * @param {unknown} current
 * @param {{ role: string, port: number }} next
 * @returns {Record<string, unknown>}
 */
export function buildSettingsConfig(current, next) {
  const base = current !== null && typeof current === 'object' && !Array.isArray(current)
    ? current
    : {};
  const result = {
    ...base,
    role: next.role,
    port: next.port,
  };
  delete result.bindHost;
  delete result.label;
  return result;
}

/**
 * Compare normalized settings to avoid a needless plugin reload.
 * @param {{ role?: unknown, port?: unknown } | null} current
 * @param {{ role: string, port: number }} next
 */
export function settingsChanged(current, next) {
  if (current === null || typeof current !== 'object') return true;
  return current.role !== next.role || Number(current.port) !== Number(next.port);
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
  if (code === 'EADDRNOTAVAIL') return `Tailscale 地址 ${host} 不属于本机接口；请确认 Tailscale 已连接`;
  if (code === 'EACCES') return `没有权限监听 ${host}:${port}`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `无法解析地址 ${host}`;
  return `无法监听 ${host}:${port}：${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Verify that the Tailscale Host address and port can be bound right now.
 *
 * The temporary listener is closed before returning. This catches an occupied
 * port before configEditor writes the profile and reloads the plugin.
 *
 * @param {string} bindHost
 * @param {number} port
 */
export async function probeBind(bindHost, port) {
  const host = validateHostAddress(bindHost);
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
      field: 'port',
      cause: typeof error?.code === 'string' ? error.code : 'unknown',
    });
  }
  await closeServer(server);
}
