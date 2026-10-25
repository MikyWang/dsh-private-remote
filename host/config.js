/**
 * Configuration and Tailscale address helpers for the single package.
 *
 * role=client  -> proxies this Host's Gateway to a remote Host on the tailnet.
 * role=host    -> serves the bridge on the detected Tailscale IPv4.
 * role=both    -> both halves, for a machine that is served and pairs out.
 *
 * There is no user-selectable bind address: the Host always listens on the
 * machine's Tailscale IPv4 (100.64.0.0/10). The tailnet is the security
 * boundary; there is no pairing token.
 */

import { isIP } from 'node:net';
import os from 'node:os';
import { DEFAULT_PORT, ERR } from '../shared/protocol.js';

export class ConfigError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
    this.details = details;
  }
}

export const DEFAULT_CONFIG = Object.freeze({
  role: 'client',
  port: DEFAULT_PORT,
});

export function unbracketHost(host) {
  if (typeof host !== 'string') return '';
  const trimmed = host.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1);
  return trimmed;
}

/** Tailscale IPv4 CGNAT range 100.64.0.0/10. */
export function isTailscaleIpv4(host) {
  const value = unbracketHost(host);
  if (isIP(value) !== 4) return false;
  const octets = value.split('.').map(Number);
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

/** A Tailscale IPv4 or a MagicDNS name; the Host only binds the former. */
export function isTailscaleHost(host) {
  const value = unbracketHost(host).toLowerCase();
  if (isTailscaleIpv4(value)) return true;
  return value.endsWith('.ts.net') || value.endsWith('.tailscale.net');
}

/**
 * The first Tailscale IPv4 assigned to this machine.
 * @param {ReturnType<typeof os.networkInterfaces>} [interfaces]
 * @returns {string | null}
 */
export function findTailscaleAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [interfaceName, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const address = typeof entry?.address === 'string' ? entry.address : '';
      const rawFamily = entry?.family;
      const family = rawFamily === 4 || rawFamily === 'IPv4' ? 4 : 0;
      if (address === '' || family !== 4 || !isTailscaleIpv4(address)) continue;
      candidates.push({ interfaceName, address });
    }
  }
  candidates.sort((a, b) => a.address.localeCompare(b.address) || a.interfaceName.localeCompare(b.interfaceName));
  return candidates[0]?.address ?? null;
}

/** The Host only binds a literal Tailscale IPv4. */
export function validateHostAddress(host) {
  const value = unbracketHost(host);
  if (!isTailscaleIpv4(value)) {
    throw new ConfigError(
      ERR.TAILSCALE_MISSING,
      'Host 只监听 Tailscale IPv4 (100.64.0.0/10)；请先连接 Tailscale，或检查 Tailscale 网卡',
      { field: 'tailscale', cause: 'ETSUNREACHABLE' },
    );
  }
  return value;
}

export function validateRemoteUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    throw new ConfigError(ERR.PROTOCOL, '请输入 Host 的 Tailscale 地址');
  }
  let parsed;
  try {
    parsed = new URL(text.includes('://') ? text : `http://${text}`);
  } catch {
    throw new ConfigError(ERR.PROTOCOL, 'Host 地址格式无效');
  }
  if (parsed.protocol !== 'http:') {
    throw new ConfigError(ERR.PROTOCOL, 'Host 地址必须是 http://；Tailscale 负责链路加密');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ConfigError(ERR.PROTOCOL, 'Host 地址不能包含用户名或密码');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new ConfigError(ERR.PROTOCOL, 'Host 地址不能包含路径；桥固定在根路径 /private-remote');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new ConfigError(ERR.PROTOCOL, 'Host 地址不能包含查询参数或片段');
  }
  if (!isTailscaleHost(parsed.hostname)) {
    throw new ConfigError(ERR.PROTOCOL, '只支持 Tailscale 地址（100.64.0.0/10 或 *.ts.net）');
  }
  if (parsed.port === '') parsed.port = String(DEFAULT_PORT);
  return { url: parsed.origin, secure: false };
}

export function normalizeConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {};
  const role = input.role === undefined ? 'client' : input.role;
  if (role !== 'client' && role !== 'host' && role !== 'both') {
    throw new ConfigError(ERR.NOT_CONFIGURED, 'role 只能是 client、host 或 both');
  }
  const portValue = input.port === undefined ? DEFAULT_PORT : Number(input.port);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new ConfigError(ERR.NOT_CONFIGURED, 'port 必须是 1-65535 的整数');
  }
  return { role, port: portValue };
}

export function bridgeUrl(baseUrl, leaf) {
  const url = new URL(`${'/private-remote'}/${leaf}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  return url.toString();
}
