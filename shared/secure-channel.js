/**
 * Authenticated, replay-resistant framing for the private remote carrier.
 *
 * Handshake:
 *   - both sides hold the same pre-shared token; it is never transmitted;
 *   - the Host proves knowledge first (`serverProof`), so a client never sends
 *     its own proof to an unauthenticated endpoint;
 *   - the Client then proves knowledge, which authenticates the SSE GET.
 *
 * Frames:
 *   - AES-256-GCM, per-direction keys derived with HKDF-SHA256;
 *   - a 12-byte header (version, direction, type, reserved, 64-bit seq) is the
 *     AAD and also seeds the 96-bit GCM nonce;
 *   - the 64-bit sequence number plus a sliding window rejects replay and
 *     stale frames while allowing concurrent POSTs to arrive out of order.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  DIRECTION_C2S,
  DIRECTION_S2C,
  ERR,
  FRAME,
  LIMITS,
  PROTOCOL_VERSION,
} from './protocol.js';

const HEADER_BYTES = 12;
const TAG_BYTES = 16;
const NONCE_BYTES = 12;

export class SecureChannelError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SecureChannelError';
    this.code = code;
    this.details = details;
  }
}

/** Generate a base64url random secret. */
export function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Strictly validate a base64url string of an exact byte length. */
export function isBase64Url(value, bytes) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === bytes && decoded.toString('base64url') === value;
  } catch {
    return false;
  }
}

/** Constant-time comparison of two base64url proofs. */
export function proofEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  try {
    const a = Buffer.from(left, 'base64url');
    const b = Buffer.from(right, 'base64url');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * One of the two handshake proofs. The field order is part of protocol v1 and
 * is shared verbatim by both halves.
 */
function handshakeProof(token, purpose, fields) {
  const hmac = createHmac('sha256', Buffer.from(token, 'utf8'));
  hmac.update('dsh-private-remote');
  for (const field of [String(PROTOCOL_VERSION), purpose, ...fields.map(String)]) {
    hmac.update('\0');
    hmac.update(field);
  }
  return hmac.digest('base64url');
}

/** Host proof, sent in the handshake response before the client reveals its own proof. */
export function makeServerProof(token, fields) {
  return handshakeProof(token, 'server', [
    fields.clientNonce,
    fields.serverNonce,
    fields.sessionId,
  ]);
}

/** Client proof, sent as the SSE GET authentication header. */
export function makeClientProof(token, fields) {
  return handshakeProof(token, 'client', [
    fields.clientNonce,
    fields.serverNonce,
    fields.sessionId,
    fields.clientName,
    fields.clientHarnessVersion,
    fields.pluginVersion,
  ]);
}

/** Derive independent C2S/S2C AES-256-GCM keys from the shared token. */
export function deriveKeys(token, clientNonce, serverNonce, sessionId) {
  const ikm = Buffer.from(token, 'utf8');
  const salt = Buffer.from(`${clientNonce}|${serverNonce}|${sessionId}`, 'utf8');
  const c2s = Buffer.from(hkdfSync('sha256', ikm, salt, 'dsh-private-remote/v1/c2s', 32));
  const s2c = Buffer.from(hkdfSync('sha256', ikm, salt, 'dsh-private-remote/v1/s2c', 32));
  return { c2s, s2c };
}

/** Sliding replay window. Accepts out-of-order frames, rejects repeats and stale ones. */
export class ReplayWindow {
  constructor(size = LIMITS.replayWindow) {
    this.size = size;
    this.max = -1;
    this.seen = new Set();
  }

  /** @param {number} seq */
  accept(seq) {
    if (!Number.isSafeInteger(seq) || seq < 0) return false;
    if (this.max >= 0 && seq <= this.max - this.size) return false;
    if (this.seen.has(seq)) return false;
    this.seen.add(seq);
    if (seq > this.max) {
      this.max = seq;
      for (const value of this.seen) {
        if (value <= this.max - this.size) this.seen.delete(value);
      }
    }
    return true;
  }
}

function encodeHeader(direction, type, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧序号无效');
  }
  if (direction !== DIRECTION_C2S && direction !== DIRECTION_S2C) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧方向无效');
  }
  if (typeof type !== 'string' || type.length !== 1) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧类型无效');
  }
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt8(PROTOCOL_VERSION, 0);
  header.writeUInt8(direction, 1);
  header.writeUInt8(type.charCodeAt(0), 2);
  header.writeUInt8(0, 3);
  header.writeBigUInt64BE(BigInt(seq), 4);
  return header;
}

function decodeHeader(header) {
  if (header.length !== HEADER_BYTES) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧头长度无效');
  }
  const version = header.readUInt8(0);
  const direction = header.readUInt8(1);
  const typeByte = header.readUInt8(2);
  const reserved = header.readUInt8(3);
  if (version !== PROTOCOL_VERSION || reserved !== 0) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧版本无效');
  }
  if (direction !== DIRECTION_C2S && direction !== DIRECTION_S2C) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧方向无效');
  }
  const seqBig = header.readBigUInt64BE(4);
  if (seqBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧序号超出范围');
  }
  return { version, direction, type: String.fromCharCode(typeByte), seq: Number(seqBig) };
}

/**
 * Encrypt one frame.
 * @param {Buffer} key
 * @param {number} direction
 * @param {string} type
 * @param {number} seq
 * @param {unknown} payload
 * @returns {Buffer}
 */
export function encodeFrame(key, direction, type, seq, payload) {
  const header = encodeHeader(direction, type, seq);
  const plaintext = Buffer.from(JSON.stringify(payload === undefined ? null : payload), 'utf8');
  if (plaintext.length > LIMITS.frameBytes - HEADER_BYTES - TAG_BYTES) {
    throw new SecureChannelError(ERR.PAYLOAD_TOO_LARGE, '帧超过大小限制');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new SecureChannelError(ERR.PROTOCOL, '密钥无效');
  }
  const nonce = Buffer.alloc(NONCE_BYTES);
  nonce.writeUInt32BE(direction, 0);
  nonce.writeBigUInt64BE(BigInt(seq), 4);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([header, ciphertext, tag]);
}

/**
 * Decrypt and authenticate one frame, consuming its sequence number only after
 * the window accepted it. A tampered frame therefore closes the session.
 * @param {Buffer} key
 * @param {number} expectedDirection
 * @param {Buffer} frame
 * @param {ReplayWindow} window
 * @returns {{ type: string, seq: number, payload: any }}
 */
export function decodeFrame(key, expectedDirection, frame, window) {
  if (!Buffer.isBuffer(frame) || frame.length < HEADER_BYTES + TAG_BYTES) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧长度无效');
  }
  if (frame.length > LIMITS.frameBytes) {
    throw new SecureChannelError(ERR.PAYLOAD_TOO_LARGE, '帧超过大小限制');
  }
  const header = frame.subarray(0, HEADER_BYTES);
  const meta = decodeHeader(header);
  if (meta.direction !== expectedDirection) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧方向不匹配');
  }
  if (!window.accept(meta.seq)) {
    throw new SecureChannelError(ERR.REPLAY, '帧序号重复或过旧');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new SecureChannelError(ERR.PROTOCOL, '密钥无效');
  }
  const nonce = Buffer.alloc(NONCE_BYTES);
  nonce.writeUInt32BE(meta.direction, 0);
  nonce.writeBigUInt64BE(BigInt(meta.seq), 4);
  const tag = frame.subarray(frame.length - TAG_BYTES);
  const ciphertext = frame.subarray(HEADER_BYTES, frame.length - TAG_BYTES);
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new SecureChannelError(ERR.TAMPERED, '帧认证失败');
  }
  let payload;
  try {
    payload = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new SecureChannelError(ERR.PROTOCOL, '帧负载不是 JSON');
  }
  return { type: meta.type, seq: meta.seq, payload };
}

const KNOWN_TYPES = new Set(Object.values(FRAME));

/** Session-scoped encoder/decoder. */
export class SecureChannel {
  /**
   * @param {{ token: string, clientNonce: string, serverNonce: string, sessionId: string, role: 'client'|'server' }} options
   */
  constructor(options) {
    const keys = deriveKeys(options.token, options.clientNonce, options.serverNonce, options.sessionId);
    this.role = options.role;
    this.outKey = options.role === 'client' ? keys.c2s : keys.s2c;
    this.inKey = options.role === 'client' ? keys.s2c : keys.c2s;
    this.outDirection = options.role === 'client' ? DIRECTION_C2S : DIRECTION_S2C;
    this.inDirection = options.role === 'client' ? DIRECTION_S2C : DIRECTION_C2S;
    this.outSeq = 0;
    this.inWindow = new ReplayWindow(LIMITS.replayWindow);
  }

  /** @param {string} type @param {unknown} payload @returns {Buffer} */
  encode(type, payload) {
    if (!KNOWN_TYPES.has(type)) throw new SecureChannelError(ERR.PROTOCOL, '未知帧类型');
    const frame = encodeFrame(this.outKey, this.outDirection, type, this.outSeq, payload);
    this.outSeq += 1;
    return frame;
  }

  /** @param {Buffer} frame @returns {{ type: string, seq: number, payload: any }} */
  decode(frame) {
    const decoded = decodeFrame(this.inKey, this.inDirection, frame, this.inWindow);
    if (!KNOWN_TYPES.has(decoded.type)) {
      throw new SecureChannelError(ERR.PROTOCOL, '未知帧类型');
    }
    return decoded;
  }
}

export function frameToBase64(frame) {
  return Buffer.from(frame).toString('base64url');
}

export function frameFromBase64(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SecureChannelError(ERR.PROTOCOL, '帧编码无效');
  }
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw new SecureChannelError(ERR.PROTOCOL, '帧编码无效');
  }
}
