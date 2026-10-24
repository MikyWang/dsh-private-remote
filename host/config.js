/**
 * Configuration validation for the single package.
 *
 * role=client  -> proxies this Host's Gateway to a paired remote Host.
 * role=host    -> serves the bridge; the local UI stays local.
 * role=both    -> both halves, useful for tests only.
 */

import { isIP } from 'node:net';
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
  bindHost: '127.0.0.1',
  port: DEFAULT_PORT,
  label: '',
});

function isPrivateIpv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Tailscale uses 100.64.0.0/10 (CGNAT); 169.254/16 is link-local.
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function unbracketHost(host) {
  if (typeof host !== 'string') return '';
  const trimmed = host.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1);
  return trimmed;
}

export function isPrivateHost(host) {
  const value = unbracketHost(host).toLowerCase();
  if (value === '' || value === '0.0.0.0' || value === '::') return false;
  if (value === 'localhost' || value.endsWith('.localhost')) return true;
  if (value.endsWith('.local') || value.endsWith('.ts.net') || value.endsWith('.tailscale.net')) return true;
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value);
  if (version === 6) {
    if (value === '::1') return true;
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('fe80')) return true;
    // IPv4-mapped private addresses (::ffff:100.x.y.z and friends).
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return false;
}

export function validateBindHost(host) {
  const value = unbracketHost(host);
  if (value === '' || value === '0.0.0.0' || value === '::') {
    throw new ConfigError(ERR.BIND_INVALID, 'bindHost 不能是通配地址；请填写本机回环、私网或 Tailscale IP');
  }
  if (value === 'localhost') return 'localhost';
  const version = isIP(value);
  if (version === 0) {
    throw new ConfigError(ERR.BIND_INVALID, 'bindHost 必须是 IP 字面量或 localhost');
  }
  if (!isPrivateHost(value)) {
    throw new ConfigError(ERR.BIND_INVALID, 'bindHost 只允许回环、RFC1918、Tailscale 100.64/10 或 IPv6 私网地址');
  }
  return value;
}

export function validateRemoteUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ConfigError(ERR.PROTOCOL, '请输入远端地址');
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new ConfigError(ERR.PROTOCOL, '远端地址格式无效');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(ERR.PROTOCOL, '远端地址只支持 http:// 或 https://');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ConfigError(ERR.PROTOCOL, '远端地址不能包含用户名或密码');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new ConfigError(ERR.PROTOCOL, '远端地址不能包含路径；桥固定在根路径 /private-remote');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new ConfigError(ERR.PROTOCOL, '远端地址不能包含查询参数或片段');
  }
  if (parsed.protocol === 'http:' && !isPrivateHost(parsed.hostname)) {
    throw new ConfigError(ERR.PROTOCOL, '公网地址必须使用 https://；私网/Tailscale 才允许 http://');
  }
  return { url: parsed.origin, secure: parsed.protocol === 'https:' };
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
  const label = typeof input.label === 'string' ? input.label.trim().slice(0, 80) : '';
  const bindHost = role === 'client'
    ? '127.0.0.1'
    : validateBindHost(input.bindHost === undefined ? '127.0.0.1' : input.bindHost);
  return { role, bindHost, port: portValue, label };
}

export function bridgeUrl(baseUrl, leaf) {
  const url = new URL(`${'/private-remote'}/${leaf}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  return url.toString();
}
