/**
 * Node-side bridge client used by the local Host's Gateway switch.
 *
 * Transport: HTTP POST uplink + one SSE downlink. Security: mutual HMAC
 * handshake, HKDF-derived AES-256-GCM per direction, monotonic sequence
 * numbers and a replay window. No business payload is ever logged.
 */

import { randomUUID } from 'node:crypto';
import {
  ERR,
  FRAME,
  LIMITS,
  PROTOCOL_VERSION,
  clampText,
  isPlainObject,
} from '../shared/protocol.js';
import {
  SecureChannel,
  isBase64Url,
  makeClientProof,
  makeServerProof,
  proofEquals,
  randomSecret,
} from '../shared/secure-channel.js';
import { bridgeUrl, validateRemoteUrl } from './config.js';

export class BridgeError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.details = details;
  }
}

/** Wait for a promise, aborting it through `onTimeout` when the limit expires. */
async function withTimeout(promise, ms, onTimeout, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new BridgeError(ERR.OFFLINE, message));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class StreamQueue {
  constructor(id) {
    this.id = id;
    this.buffer = [];
    this.bytes = 0;
    this.done = false;
    this.error = null;
    this.waiter = null;
    this.consumerClosed = false;
  }

  push(frame) {
    if (this.done || this.consumerClosed) return;
    let size = 1;
    try {
      size = Buffer.byteLength(JSON.stringify(frame), 'utf8');
    } catch {
      size = 1;
    }
    this.buffer.push(frame);
    this.bytes += size;
    if (this.buffer.length > LIMITS.streamQueueFrames || this.bytes > LIMITS.streamQueueBytes) {
      this.fail(new BridgeError(ERR.STREAM_OVERFLOW, '远端流积压超过限制'));
      return;
    }
    this.wake();
  }

  end() {
    if (this.done) return;
    this.done = true;
    this.wake();
  }

  fail(error) {
    if (this.done) return;
    this.error = error;
    this.done = true;
    this.wake();
  }

  wake() {
    if (this.waiter !== null) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter();
    }
  }

  async *[Symbol.asyncIterator]() {
    try {
      while (true) {
        if (this.buffer.length > 0) {
          const frame = this.buffer.shift();
          try {
            this.bytes -= Buffer.byteLength(JSON.stringify(frame), 'utf8');
          } catch {
            this.bytes -= 1;
          }
          yield frame;
          continue;
        }
        if (this.error !== null) throw this.error;
        if (this.done) return;
        await new Promise((resolve) => {
          this.waiter = resolve;
        });
      }
    } finally {
      this.consumerClosed = true;
      this.buffer.length = 0;
      this.bytes = 0;
      this.wake();
    }
  }
}

export class BridgeClient {
  /**
   * @param {{
   *   url: string,
   *   token: string,
   *   clientName?: string,
   *   clientHarnessVersion?: string,
   *   pluginVersion?: string,
   *   onClose?: (error: Error) => void,
   * }} options
   */
  constructor(options) {
    const parsed = validateRemoteUrl(options.url);
    this.url = parsed.url;
    this.token = typeof options.token === 'string' ? options.token.trim() : '';
    if (this.token === '') throw new BridgeError(ERR.TOKEN_MISSING, '请输入配对令牌');
    this.clientName = clampText(options.clientName ?? '', LIMITS.maxClientName) || 'DSH Desktop';
    this.clientHarnessVersion = clampText(options.clientHarnessVersion ?? '', LIMITS.maxVersionText);
    this.pluginVersion = clampText(options.pluginVersion ?? '', LIMITS.maxVersionText);
    this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
    this.connected = false;
    this.closed = true;
    this.sessionId = '';
    this.host = null;
    this.channel = null;
    this.abort = null;
    this.sseResponse = null;
    this.sseReader = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.streams = new Map();
    this.lastSeen = 0;
    this.watchdog = null;
    this.closeNotified = false;
  }

  /** Connect, authenticate and wait for the encrypted ready frame. */
  async connect() {
    if (this.connected) return this.host;
    if (!this.closed) throw new BridgeError(ERR.ALREADY_CONNECTED, '连接已在进行中');
    this.closed = false;
    this.closeNotified = false;
    this.abort = new AbortController();
    const clientNonce = randomSecret(32);
    let handshake;
    try {
      handshake = await this.handshake(clientNonce);
    } catch (error) {
      this.abort.abort();
      this.closed = true;
      throw error;
    }
    if (handshake.v !== PROTOCOL_VERSION) {
      this.abort.abort();
      this.closed = true;
      throw new BridgeError(ERR.VERSION_MISMATCH, `远端协议版本 ${String(handshake.v)} 与本地 ${PROTOCOL_VERSION} 不一致`);
    }
    const fields = {
      clientNonce,
      serverNonce: handshake.serverNonce,
      sessionId: handshake.sessionId,
      clientName: this.clientName,
      clientHarnessVersion: this.clientHarnessVersion,
      pluginVersion: this.pluginVersion,
    };
    if (!proofEquals(makeServerProof(this.token, fields), handshake.serverProof)) {
      this.abort.abort();
      this.closed = true;
      throw new BridgeError(ERR.AUTH_FAILED, 'Host 认证失败：令牌不匹配或 Host 不可信');
    }
    this.sessionId = handshake.sessionId;
    this.channel = new SecureChannel({
      token: this.token,
      clientNonce,
      serverNonce: handshake.serverNonce,
      sessionId: handshake.sessionId,
      role: 'client',
    });
    const clientProof = makeClientProof(this.token, fields);
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    let response;
    try {
      response = await withTimeout(
        fetch(bridgeUrl(this.url, `events?session=${encodeURIComponent(this.sessionId)}`), {
          method: 'GET',
          headers: {
            accept: 'text/event-stream',
            'x-private-remote-proof': clientProof,
          },
          signal: this.abort.signal,
        }),
        LIMITS.handshakeTimeoutMs,
        () => this.abort.abort(),
        '远端事件流连接超时',
      );
    } catch (error) {
      this.abort.abort();
      this.closed = true;
      throw error instanceof BridgeError ? error : new BridgeError(ERR.OFFLINE, '无法连接远端事件流');
    }
    if (!response.ok) {
      const message = await this.readHttpError(response);
      this.abort.abort();
      this.closed = true;
      throw new BridgeError(message.code, message.message);
    }
    if (!response.body) {
      this.abort.abort();
      this.closed = true;
      throw new BridgeError(ERR.PROTOCOL, '远端事件流没有响应体');
    }
    this.sseResponse = response;
    this.lastSeen = Date.now();
    void this.readSse(response.body).catch((error) => {
      this.failConnection(error);
    });
    let ready;
    try {
      ready = await withTimeout(
        this.readyPromise,
        LIMITS.handshakeTimeoutMs,
        () => this.abort.abort(),
        '等待远端 ready 帧超时',
      );
    } catch (error) {
      this.abort.abort();
      this.closed = true;
      throw error instanceof BridgeError ? error : new BridgeError(ERR.OFFLINE, '远端未发送 ready 帧');
    }
    if (!isPlainObject(ready.host)) {
      this.abort.abort();
      this.closed = true;
      throw new BridgeError(ERR.PROTOCOL, '远端 ready 帧缺少 Host 信息');
    }
    this.host = ready.host;
    this.connected = true;
    this.lastSeen = Date.now();
    this.startWatchdog();
    return this.host;
  }

  async handshake(clientNonce) {
    const body = JSON.stringify({
      v: PROTOCOL_VERSION,
      clientNonce,
      clientName: this.clientName,
      clientHarnessVersion: this.clientHarnessVersion,
      pluginVersion: this.pluginVersion,
    });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    this.abort.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), LIMITS.handshakeTimeoutMs);
    try {
      const response = await fetch(bridgeUrl(this.url, 'handshake'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await this.readHttpError(response);
        throw new BridgeError(error.code, error.message);
      }
      const payload = await response.json();
      if (!isPlainObject(payload) || payload.v !== PROTOCOL_VERSION) {
        throw new BridgeError(ERR.VERSION_MISMATCH, '远端握手响应版本不匹配');
      }
      if (!isBase64Url(payload.sessionId, 16) || !isBase64Url(payload.serverNonce, 32) || typeof payload.serverProof !== 'string') {
        throw new BridgeError(ERR.PROTOCOL, '远端握手响应格式无效');
      }
      return payload;
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(ERR.OFFLINE, `无法连接远端 Host：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener('abort', onAbort);
    }
  }

  async readHttpError(response) {
    try {
      const payload = await response.json();
      if (isPlainObject(payload) && isPlainObject(payload.error) && typeof payload.error.code === 'string') {
        return { code: payload.error.code, message: typeof payload.error.message === 'string' ? payload.error.message : payload.error.code };
      }
    } catch {
      // Fall through to a status-only error.
    }
    return { code: response.status === 401 ? ERR.AUTH_FAILED : ERR.OFFLINE, message: `远端返回 HTTP ${response.status}` };
  }

  async readSse(body) {
    const reader = body.getReader();
    this.sseReader = reader;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new BridgeError(ERR.OFFLINE, '远端事件流已关闭');
      this.lastSeen = Date.now();
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.length > LIMITS.frameBytes * 2) {
        throw new BridgeError(ERR.PROTOCOL, '远端事件流帧过大');
      }
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        this.handleSseBlock(block);
      }
    }
  }

  handleSseBlock(block) {
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length === 0) return;
    const raw = dataLines.join('\n');
    let decoded;
    try {
      decoded = this.channel.decode(Buffer.from(raw, 'base64url'));
    } catch (error) {
      throw error;
    }
    const payload = decoded.payload;
    switch (decoded.type) {
      case FRAME.READY: {
        if (this.readyResolve !== null) {
          const resolve = this.readyResolve;
          this.readyResolve = null;
          this.readyReject = null;
          resolve(payload);
        }
        break;
      }
      case FRAME.STREAM_FRAME: {
        const queue = this.streams.get(payload?.id);
        if (queue) queue.push(payload.frame);
        break;
      }
      case FRAME.STREAM_END: {
        const queue = this.streams.get(payload?.id);
        if (queue) {
          queue.end();
          this.streams.delete(payload.id);
        }
        break;
      }
      case FRAME.STREAM_ERROR: {
        const queue = this.streams.get(payload?.id);
        if (queue) {
          const error = isPlainObject(payload.error) ? payload.error : {};
          queue.fail(new BridgeError(
            typeof error.code === 'string' ? error.code : ERR.INTERNAL,
            typeof error.message === 'string' ? error.message : '远端流失败',
          ));
          this.streams.delete(payload.id);
        }
        break;
      }
      case FRAME.BYE: {
        this.failConnection(new BridgeError(
          typeof payload?.reason === 'string' && payload.reason === 'token-rotated' ? ERR.AUTH_ROTATED : ERR.OFFLINE,
          '远端已关闭连接',
        ));
        break;
      }
      default:
        break;
    }
  }

  startWatchdog() {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (this.connected && Date.now() - this.lastSeen > LIMITS.deadConnectionMs) {
        this.failConnection(new BridgeError(ERR.OFFLINE, '远端心跳超时，连接已断开'));
      }
    }, Math.min(10_000, LIMITS.heartbeatMs));
    this.watchdog.unref?.();
  }

  stopWatchdog() {
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  /** Fail the connection and notify once. Never auto-reconnects. */
  failConnection(error) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.stopWatchdog();
    if (this.readyReject !== null) {
      const reject = this.readyReject;
      this.readyReject = null;
      this.readyResolve = null;
      reject(error);
    }
    for (const queue of this.streams.values()) {
      queue.fail(error instanceof Error ? error : new BridgeError(ERR.OFFLINE, '远端连接已断开'));
    }
    this.streams.clear();
    try {
      this.abort?.abort();
    } catch {
      // ignore
    }
    try {
      this.sseReader?.cancel().catch(() => undefined);
    } catch {
      // ignore
    }
    this.notifyClose(error);
  }

  notifyClose(error) {
    if (this.closeNotified) return;
    this.closeNotified = true;
    if (this.onClose !== null) {
      try {
        this.onClose(error instanceof Error ? error : new BridgeError(ERR.OFFLINE, '远端连接已断开'));
      } catch {
        // A UI callback must not break the transport.
      }
    }
  }

  /** Close intentionally. The controller decides whether this means "remote offline". */
  close(reason = '已断开远端连接') {
    if (this.closed) return;
    this.failConnection(new BridgeError(ERR.OFFLINE, reason));
  }

  /** POST one encrypted frame and return the decoded result value. */
  async request(endpoint, payload, signal) {
    if (!this.connected) throw new BridgeError(ERR.OFFLINE, '远端已断开，提交被拒绝；请重新连接');
    const id = randomUUID();
    const result = await this.sendFrame(FRAME.INVOKE, { id, endpoint, payload }, signal);
    return result;
  }

  /** Open a remote stream; returns an async iterable of official mux frames. */
  async openStream(endpoint, payload, signal, control) {
    if (!this.connected) throw new BridgeError(ERR.OFFLINE, '远端已断开，提交被拒绝；请重新连接');
    if (this.streams.size >= LIMITS.maxStreamsPerClient) {
      throw new BridgeError(ERR.STREAM_OVERFLOW, '远端流数量超过限制');
    }
    const id = randomUUID();
    const queue = new StreamQueue(id);
    const abort = () => {
      if (!queue.done) {
        queue.fail(new BridgeError(ERR.OFFLINE, '远端流已取消'));
      }
      this.cancelStream(id, true);
    };
    if (signal !== null && signal !== undefined) {
      if (signal.aborted) {
        throw new BridgeError(ERR.OFFLINE, '远端流已取消');
      }
      signal.addEventListener('abort', abort, { once: true });
    }
    if (control !== null && control !== undefined && control.signal instanceof AbortSignal) {
      if (control.signal.aborted) {
        throw new BridgeError(ERR.OFFLINE, '远端流已取消');
      }
      control.signal.addEventListener('abort', abort, { once: true });
    }
    this.streams.set(id, queue);
    try {
      const ack = await this.sendFrame(FRAME.STREAM_OPEN, { id, endpoint, payload }, signal);
      if (!isPlainObject(ack) || ack.ok !== true) {
        const error = isPlainObject(ack?.error) ? ack.error : {};
        this.streams.delete(id);
        throw new BridgeError(
          typeof error.code === 'string' ? error.code : ERR.INTERNAL,
          typeof error.message === 'string' ? error.message : '远端流打开失败',
        );
      }
    } catch (error) {
      this.streams.delete(id);
      throw error;
    }
    const self = this;
    return (async function* iterate() {
      try {
        for await (const frame of queue) {
          yield frame;
        }
      } finally {
        if (signal !== null && signal !== undefined) signal.removeEventListener('abort', abort);
        if (control !== null && control !== undefined && control.signal instanceof AbortSignal) {
          control.signal.removeEventListener('abort', abort);
        }
        self.cancelStream(id, false);
      }
    })();
  }

  cancelStream(id, notifyRemote = true) {
    const queue = this.streams.get(id);
    if (!queue) return;
    this.streams.delete(id);
    queue.fail(new BridgeError(ERR.OFFLINE, '远端流已取消'));
    if (notifyRemote) {
      void this.sendFrame(FRAME.STREAM_CANCEL, { id }, undefined, 2_000).catch(() => undefined);
    }
  }

  /**
   * Send one encrypted control/unary frame and decode its RESULT.
   * @param {string} type
   * @param {unknown} payload
   * @param {AbortSignal|undefined} signal
   * @param {number} [timeoutMs]
   */
  async sendFrame(type, payload, signal, timeoutMs = LIMITS.requestTimeoutMs) {
    if (!this.connected && type !== FRAME.STREAM_CANCEL) {
      throw new BridgeError(ERR.OFFLINE, '远端已断开，提交被拒绝；请重新连接');
    }
    const frame = this.channel.encode(type, payload);
    const body = JSON.stringify({ frame: frame.toString('base64url') });
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (signal !== null && signal !== undefined) {
      if (signal.aborted) throw new BridgeError(ERR.OUTCOME_UNKNOWN, '请求已取消；远端可能仍执行了该操作');
      signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const onConnectionAbort = () => controller.abort();
    this.abort.signal.addEventListener('abort', onConnectionAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(bridgeUrl(this.url, 'rpc'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-private-remote-session': this.sessionId,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await this.readHttpError(response);
        if (response.status === 401) this.failConnection(new BridgeError(error.code, error.message));
        throw new BridgeError(error.code, error.message);
      }
      const json = await response.json();
      if (!isPlainObject(json) || typeof json.frame !== 'string') {
        throw new BridgeError(ERR.PROTOCOL, '远端 RPC 响应格式无效');
      }
      const decoded = this.channel.decode(Buffer.from(json.frame, 'base64url'));
      if (decoded.type !== FRAME.RESULT || !isPlainObject(decoded.payload) || decoded.payload.id !== payload?.id) {
        throw new BridgeError(ERR.PROTOCOL, '远端 RPC 结果与请求不匹配');
      }
      return decoded.payload.result;
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      if (signal?.aborted) {
        throw new BridgeError(ERR.OUTCOME_UNKNOWN, '请求已取消；远端可能仍执行了该操作');
      }
      if (this.closed || controller.signal.aborted) {
        throw new BridgeError(ERR.OUTCOME_UNKNOWN, '远端请求结果未知，请核对远端会话后再重试');
      }
      this.failConnection(new BridgeError(ERR.OFFLINE, '远端网络连接失败'));
      throw new BridgeError(ERR.OUTCOME_UNKNOWN, '远端请求结果未知，请核对远端会话后再重试');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
      this.abort?.signal.removeEventListener('abort', onConnectionAbort);
    }
  }
}
