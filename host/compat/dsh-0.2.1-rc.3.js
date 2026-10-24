/**
 * Compatibility adapter for the verified Harness build.
 *
 * All assumptions about official Gateway method names and Peer construction
 * live here. Every method is probed at Host start; a mismatch disables the
 * Host bridge instead of guessing. Version-specific code must stay in this
 * file and be documented in docs/COMPATIBILITY.md.
 */

import { makeRemoteError } from '../../shared/protocol.js';

export const SUPPORTED_HARNESS = '0.2.1-rc.3';
export const COMPAT_ID = 'dsh-0.2.1-rc.3';

/**
 * The official Gateway releases the mux uplink by calling
 * `source[Symbol.asyncIterator]().return()` before opening a stream. A remote
 * stream has no local uplink, so it must receive a harmless placeholder rather
 * than undefined.
 */
export const DUMMY_UPLINK = Object.freeze({
  [Symbol.asyncIterator]() {
    return {
      next: async () => ({ done: true, value: undefined }),
      return: async () => ({ done: true, value: undefined }),
    };
  },
});

export function harnessVersion() {
  const explicit = process.env.DSH_CLIENT_VERSION;
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
  const version = process.env.DSH_VERSION;
  if (typeof version === 'string' && version.trim() !== '') return version.trim();
  return '';
}

/**
 * Probe the exact official methods this adapter calls.
 * @param {any} gateway
 */
export function probeGateway(gateway) {
  const missing = [];
  if (gateway === null || typeof gateway !== 'object') {
    return { ok: false, missing: ['ctx.typertGateway'], harnessVersion: harnessVersion(), compatId: COMPAT_ID, supportedHarness: SUPPORTED_HARNESS };
  }
  for (const method of ['dispatchRpc', 'openWireStream', 'claimsEndpoint']) {
    if (typeof gateway[method] !== 'function') missing.push(`typertGateway.${method}`);
  }
  if (typeof gateway.claimsEndpoint === 'function') {
    for (const endpoint of ['session/page', 'session/prompt', 'session/follow', 'workspace/follow', '$events/result']) {
      let claimed = false;
      try {
        claimed = gateway.claimsEndpoint(endpoint) === true;
      } catch {
        claimed = false;
      }
      if (!claimed) missing.push(endpoint);
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    harnessVersion: harnessVersion(),
    compatId: COMPAT_ID,
    supportedHarness: SUPPORTED_HARNESS,
  };
}

/**
 * Create the per-device owner-equivalent Peer. This is the one deliberate
 * authorization decision of the design; the endpoint allowlist is the actual
 * permission boundary. It does not modify connection.admit or remoteAccess.
 * @param {any} connection
 */
export function createOwnerPeer(connection) {
  if (connection === null || typeof connection !== 'object' || typeof connection.createPeer !== 'function') {
    throw makeRemoteError('remote/unsupported', '官方 connection.createPeer 不可用');
  }
  return connection.createPeer({ principal: { kind: 'owner' }, interactions: 'answer' });
}

/**
 * Forward a unary call through the official Gateway.
 * @param {any} gateway
 * @param {any} peer
 * @param {string} endpoint
 * @param {unknown} payload
 * @param {AbortSignal} signal
 */
export function dispatchThroughGateway(gateway, peer, endpoint, payload, signal) {
  return gateway.dispatchRpc(endpoint, payload, signal, peer);
}

/**
 * Forward a stream open through the official Gateway. The returned value is
 * the official async iterable of mux frames.
 * @param {any} gateway
 * @param {any} peer
 * @param {string} endpoint
 * @param {unknown} payload
 * @param {AbortSignal} signal
 * @param {any} control
 */
export function openStreamThroughGateway(gateway, peer, endpoint, payload, signal, control) {
  return gateway.openWireStream(endpoint, payload, DUMMY_UPLINK, peer, signal, control);
}

/**
 * Official Gateway stream failure shape.
 * @param {any} gateway
 * @param {unknown} error
 */
export function streamFailure(gateway, error) {
  if (gateway !== null && typeof gateway === 'object' && gateway.wireStream !== null && typeof gateway.wireStream === 'object' && typeof gateway.wireStream.failure === 'function') {
    return gateway.wireStream.failure(error);
  }
  return { code: 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: {} };
}
