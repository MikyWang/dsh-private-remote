/**
 * Host pairing token storage through the official credential service.
 *
 * The token is generated once and read/written only through ctx.credentials;
 * it is never placed in cordis.patch.yml, client.json, localStorage or logs.
 */

import { ERR, HOST_TOKEN_REF } from '../shared/protocol.js';
import { randomSecret } from '../shared/secure-channel.js';

function requireCredentials(credentials) {
  if (credentials === null || typeof credentials !== 'object') {
    const error = new Error('官方凭据服务不可用');
    error.code = ERR.CREDENTIALS_UNAVAILABLE;
    throw error;
  }
}

/** @param {any} credentials */
export async function readHostToken(credentials) {
  requireCredentials(credentials);
  const resolved = await credentials.resolve(HOST_TOKEN_REF);
  const value = resolved !== null && typeof resolved === 'object' ? resolved.value : undefined;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** @param {any} credentials */
export async function getOrCreateHostToken(credentials) {
  const existing = await readHostToken(credentials);
  if (existing !== null) return existing;
  const token = randomSecret(32);
  await credentials.set(HOST_TOKEN_REF, token);
  return token;
}

/** @param {any} credentials */
export async function rotateHostToken(credentials) {
  requireCredentials(credentials);
  const token = randomSecret(32);
  await credentials.set(HOST_TOKEN_REF, token);
  return token;
}

/** @param {any} credentials */
export async function forgetHostToken(credentials) {
  requireCredentials(credentials);
  await credentials.unset(HOST_TOKEN_REF);
}
