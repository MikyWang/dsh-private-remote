/**
 * Shared wire constants and small helpers for the private remote carrier.
 *
 * This module is imported by the Host half only. The Client half is a classic
 * browser script and therefore repeats the handful of control-channel strings
 * it needs; `scripts/check.mjs` asserts that the two copies stay in sync.
 */

export const PROTOCOL_VERSION = 1;
export const PLUGIN_VERSION = '0.1.0';
export const SUPPORTED_HARNESS = '0.2.1-rc.3';

/** Local Host control channel, read by the browser plugin through ctx.connection.rpc. */
export const CONTROL_CHANNEL = '/private-remote';

/** Remote bridge HTTP prefix. */
export const BRIDGE_PREFIX = '/private-remote';

/** Default bridge TCP port. */
export const DEFAULT_PORT = 47821;

/** Official credential ref for the host pairing token. */
// The official local credential provider only accepts /^[A-Za-z_][A-Za-z0-9_]*$/.
export const HOST_TOKEN_REF = 'private_remote_host_token';

export const LIMITS = Object.freeze({
  handshakeBytes: 8 * 1024,
  frameBytes: 32 * 1024 * 1024,
  postBytes: 16 * 1024 * 1024,
  maxClients: 4,
  handshakeTimeoutMs: 10_000,
  pendingHandshakeMs: 15_000,
  heartbeatMs: 20_000,
  deadConnectionMs: 60_000,
  streamQueueFrames: 512,
  streamQueueBytes: 16 * 1024 * 1024,
  replayWindow: 1024,
  requestTimeoutMs: 120_000,
  maxStreamsPerClient: 32,
  maxClientName: 128,
  maxVersionText: 64,
});

/** Single-byte frame discriminators. */
export const FRAME = Object.freeze({
  INVOKE: 'I',
  RESULT: 'R',
  STREAM_OPEN: 'O',
  STREAM_FRAME: 'F',
  STREAM_END: 'E',
  STREAM_ERROR: 'X',
  STREAM_CANCEL: 'C',
  READY: 'Y',
  BYE: 'B',
});

export const DIRECTION_C2S = 1;
export const DIRECTION_S2C = 2;

/** Plugin-owned error codes. Official gateway codes pass through unchanged. */
export const ERR = Object.freeze({
  INTERNAL: 'gateway/internal',
  AUTH_FAILED: 'remote/auth-failed',
  AUTH_ROTATED: 'remote/auth-rotated',
  VERSION_MISMATCH: 'remote/version-mismatch',
  UNSUPPORTED: 'remote/unsupported',
  ENDPOINT_DENIED: 'remote/endpoint-denied',
  OFFLINE: 'remote/offline',
  OUTCOME_UNKNOWN: 'remote/outcome-unknown',
  FORBIDDEN: 'remote/forbidden',
  PAYLOAD_TOO_LARGE: 'remote/payload-too-large',
  STREAM_OVERFLOW: 'remote/stream-overflow',
  REPLAY: 'remote/replay',
  TAMPERED: 'remote/tampered',
  PROTOCOL: 'remote/protocol',
  TOKEN_MISSING: 'host/token-missing',
  CREDENTIALS_UNAVAILABLE: 'host/credentials-unavailable',
  NOT_CONFIGURED: 'host/not-configured',
  BIND_INVALID: 'host/bind-invalid',
  BUSY: 'host/busy',
  CLIENT_DISABLED: 'host/client-disabled',
  ALREADY_CONNECTED: 'remote/already-connected',
});

/**
 * Official-shaped success envelope.
 * @param {unknown} value
 */
export function ok(value) {
  return { ok: true, value };
}

/**
 * Official-shaped failure envelope for plugin-owned failures.
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
export function fail(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}

/**
 * A RemoteError-shaped throwable understood by the official Gateway helpers.
 * The object intentionally carries the official marker instead of relying on
 * class identity across plugin and Harness package copies.
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
export function makeRemoteError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'RemoteError';
  error.isDSHRemoteError = true;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Convert an arbitrary thrown value into the official failure envelope.
 * Plugin-owned RemoteError-shaped values keep their code; unknown failures map
 * to gateway/internal, matching the official Gateway.
 * @param {unknown} error
 */
export function toFailure(error) {
  if (error !== null && typeof error === 'object') {
    const candidate = /** @type {{ isDSHRemoteError?: unknown, code?: unknown, message?: unknown, details?: unknown }} */ (error);
    if (candidate.isDSHRemoteError === true && typeof candidate.code === 'string') {
      return {
        ok: false,
        error: {
          code: candidate.code,
          message: typeof candidate.message === 'string' ? candidate.message : candidate.code,
          details: candidate.details !== null && typeof candidate.details === 'object' ? candidate.details : {},
        },
      };
    }
    if (typeof candidate.code === 'string' && candidate.code !== '') {
      return {
        ok: false,
        error: {
          code: candidate.code,
          message: typeof candidate.message === 'string' ? candidate.message : candidate.code,
          details: candidate.details !== null && typeof candidate.details === 'object' ? candidate.details : {},
        },
      };
    }
  }
  return fail(ERR.INTERNAL, error instanceof Error ? error.message : String(error));
}

/** True for a non-array, non-null object. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Clamp a remote-supplied display string. */
export function clampText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

/** Short host identity for display. */
export function shortId(id) {
  return typeof id === 'string' ? id.slice(0, 8) : '';
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
