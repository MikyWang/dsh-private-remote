/**
 * Remote Host bridge.
 *
 * A separate HTTP server (never the official webServer) that authenticates a
 * paired device, creates one owner-equivalent Peer for that connection, and
 * forwards only allow-listed endpoints through the official typert Gateway.
 *
 * Uplink: POST /private-remote/rpc (encrypted binary frames, base64url in JSON)
 * Downlink: GET /private-remote/events (SSE; each data event is one encrypted frame)
 */

import http from 'node:http';
import os from 'node:os';
import {
  BRIDGE_PREFIX,
  ERR,
  FRAME,
  LIMITS,
  PLUGIN_VERSION,
  PROTOCOL_VERSION,
  clampText,
  errorMessage,
  fail,
  isPlainObject,
  ok,
  toFailure,
} from '../shared/protocol.js';
import { isAllowed, isDeniedNamespace } from '../shared/allowlist.js';
import {
  SecureChannel,
  isBase64Url,
  makeClientProof,
  makeServerProof,
  proofEquals,
  randomSecret,
} from '../shared/secure-channel.js';
import { unbracketHost } from './config.js';
import {
  createOwnerPeer,
  dispatchThroughGateway,
  openStreamThroughGateway,
} from './compat/dsh-0.2.1-rc.3.js';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

class SseSink {
  constructor(res, channel) {
    this.res = res;
    this.channel = channel;
    this.closed = false;
    this.chain = Promise.resolve();
  }

  send(type, payload) {
    if (this.closed) return Promise.reject(new HttpError(499, ERR.OFFLINE, 'SSE 已关闭'));
    let data;
    try {
      data = `data: ${this.channel.encode(type, payload).toString('base64url')}\n\n`;
    } catch (error) {
      return Promise.reject(error);
    }
    return this.enqueue(data);
  }

  comment(text) {
    return this.enqueue(text);
  }

  enqueue(data) {
    if (this.closed) return Promise.reject(new HttpError(499, ERR.OFFLINE, 'SSE 已关闭'));
    this.chain = this.chain.then(() => this.write(data));
    return this.chain;
  }

  write(data) {
    return new Promise((resolve, reject) => {
      if (this.closed || this.res.destroyed || this.res.writableEnded) {
        reject(new HttpError(499, ERR.OFFLINE, 'SSE 已关闭'));
        return;
      }
      let settled = false;
      const cleanup = () => {
        this.res.off('drain', onDrain);
        this.res.off('close', onClose);
        this.res.off('error', onClose);
      };
      const onDrain = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onClose = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new HttpError(499, ERR.OFFLINE, 'SSE 已关闭'));
      };
      let accepted;
      try {
        accepted = this.res.write(data);
      } catch {
        onClose();
        return;
      }
      if (accepted) {
        settled = true;
        resolve();
        return;
      }
      this.res.once('drain', onDrain);
      this.res.once('close', onClose);
      this.res.once('error', onClose);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.res.end();
    } catch {
      // ignore
    }
  }
}

function sendJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

function normalizeIp(value) {
  if (typeof value !== 'string' || value === '') return 'unknown';
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

async function readJsonBody(req, limit) {
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, ERR.PROTOCOL, '需要 application/json 请求体');
  }
  const encoding = String(req.headers['content-encoding'] ?? 'identity');
  if (encoding !== 'identity') {
    throw new HttpError(415, ERR.PROTOCOL, '不支持压缩请求体');
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, ERR.PAYLOAD_TOO_LARGE, '请求体超过大小限制');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      throw new HttpError(413, ERR.PAYLOAD_TOO_LARGE, '请求体超过大小限制');
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new HttpError(400, ERR.PROTOCOL, '请求体为空');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, ERR.PROTOCOL, '请求体不是合法 JSON');
  }
}

export class BridgeServer {
  /**
   * @param {{
   *   connection: any,
   *   gateway: any,
   *   config: { bindHost: string, port: number, label?: string },
   *   token: string,
   *   hostId: string,
   *   compat: any,
   *   harnessVersion?: string,
   *   log?: any,
   *   onChange?: () => void,
   * }} options
   */
  constructor(options) {
    this.connection = options.connection;
    this.gateway = options.gateway;
    this.config = options.config;
    this.token = options.token;
    this.hostId = options.hostId;
    this.compat = options.compat;
    this.harnessVersion = options.harnessVersion ?? '';
    this.log = options.log ?? { info() {}, warn() {}, error() {} };
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.server = null;
    this.port = this.config.port;
    this.started = false;
    this.stopping = false;
    this.sessions = new Map();
    this.pending = new Map();
    this.sockets = new Set();
    this.handshakeBuckets = new Map();
    this.pendingTimer = null;
  }

  async start() {
    if (this.started) return;
    this.stopping = false;
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => this.failRequest(res, error));
    });
    this.server.requestTimeout = 60_000;
    this.server.headersTimeout = 10_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.timeout = 0;
    this.server.on('clientError', (_error, socket) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    });
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    this.pendingTimer = setInterval(() => this.prunePending(), 10_000);
    this.pendingTimer.unref?.();
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server?.off('error', onError);
        reject(new HttpError(0, ERR.BIND_INVALID, `无法监听 ${this.config.bindHost}:${this.config.port}：${errorMessage(error)}`));
      };
      this.server.once('error', onError);
      this.server.listen(this.config.port, this.config.bindHost, () => {
        this.server.off('error', onError);
        const address = this.server.address();
        if (address !== null && typeof address === 'object' && typeof address.port === 'number') {
          this.port = address.port;
        }
        resolve();
      });
    });
    this.started = true;
    this.log.info('Host bridge listening on', `${this.config.bindHost}:${this.port}`);
  }

  async stop() {
    this.stopping = true;
    if (this.pendingTimer !== null) {
      clearInterval(this.pendingTimer);
      this.pendingTimer = null;
    }
    for (const session of [...this.sessions.values()]) {
      this.cleanupSession(session, 'host-stopped');
    }
    this.pending.clear();
    const server = this.server;
    this.server = null;
    if (server !== null) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        server.close(finish);
        server.closeAllConnections?.();
        const timer = setTimeout(() => {
          for (const socket of this.sockets) {
            try {
              socket.destroy();
            } catch {
              // ignore
            }
          }
          finish();
        }, 500);
        timer.unref?.();
      });
    }
    this.sockets.clear();
    this.started = false;
    this.stopping = false;
    this.log.info('Host bridge stopped');
  }

  listenUrl() {
    const host = unbracketHost(this.config.bindHost);
    const display = host.includes(':') ? `[${host}]` : host;
    return `http://${display}:${this.port}`;
  }

  hostInfo() {
    return {
      deviceName: this.config.label || os.hostname(),
      hostname: os.hostname(),
      platform: process.platform,
      harnessVersion: this.harnessVersion,
      pluginVersion: PLUGIN_VERSION,
      protocol: PROTOCOL_VERSION,
      compat: this.compat,
      deviceId: this.hostId,
      listen: { host: this.config.bindHost, port: this.port, url: this.listenUrl() },
    };
  }

  clientInfos() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id.slice(0, 8),
      clientName: session.clientName,
      clientHarnessVersion: session.clientHarnessVersion,
      pluginVersion: session.pluginVersion,
      connectedAt: session.createdAt,
      lastActivity: session.lastActivity,
      ip: session.ip,
    }));
  }

  async closeAllSessions(reason) {
    const sessions = [...this.sessions.values()];
    for (const session of sessions) {
      try {
        await session.sink.send(FRAME.BYE, { reason });
      } catch {
        // The client may already be gone.
      }
      this.cleanupSession(session, reason);
    }
  }

  async dropClients() {
    await this.closeAllSessions('host-dropped');
  }

  async handle(req, res) {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (this.stopping || !this.started) {
      throw new HttpError(503, ERR.OFFLINE, 'Host 桥正在停止');
    }
    if (typeof req.headers.origin === 'string' && req.headers.origin !== '') {
      throw new HttpError(403, ERR.FORBIDDEN, '浏览器跨源请求被拒绝');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    if (pathname === `${BRIDGE_PREFIX}/handshake`) {
      if (req.method !== 'POST') throw new HttpError(405, ERR.PROTOCOL, '只支持 POST');
      await this.handleHandshake(req, res);
      return;
    }
    if (pathname === `${BRIDGE_PREFIX}/events`) {
      if (req.method !== 'GET') throw new HttpError(405, ERR.PROTOCOL, '只支持 GET');
      await this.handleEvents(req, res, url);
      return;
    }
    if (pathname === `${BRIDGE_PREFIX}/rpc`) {
      if (req.method !== 'POST') throw new HttpError(405, ERR.PROTOCOL, '只支持 POST');
      await this.handleRpc(req, res);
      return;
    }
    throw new HttpError(404, ERR.PROTOCOL, '未知的桥端点');
  }

  failRequest(res, error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = typeof error?.code === 'string' ? error.code : ERR.INTERNAL;
    const message = error instanceof Error ? error.message : String(error);
    if (status !== 499) {
      this.log.warn('request failed', code, message);
    }
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      return;
    }
    sendJson(res, status === 0 ? 500 : status, { ok: false, error: { code, message } });
  }

  allowHandshake(ip) {
    const now = Date.now();
    const bucket = this.handshakeBuckets.get(ip);
    if (bucket === undefined || now > bucket.reset) {
      this.handshakeBuckets.set(ip, { count: 1, reset: now + 60_000 });
      if (this.handshakeBuckets.size > 1024) {
        for (const [key, value] of this.handshakeBuckets) {
          if (now > value.reset) this.handshakeBuckets.delete(key);
        }
      }
      return true;
    }
    bucket.count += 1;
    return bucket.count <= 10;
  }

  prunePending() {
    const now = Date.now();
    for (const [id, pending] of this.pending) {
      if (now - pending.createdAt > LIMITS.pendingHandshakeMs) this.pending.delete(id);
    }
  }

  async handleHandshake(req, res) {
    if (this.token === '' || this.token === null) {
      throw new HttpError(503, ERR.AUTH_FAILED, 'Host 传输协议密钥未配置');
    }
    if (this.sessions.size >= LIMITS.maxClients) {
      throw new HttpError(503, ERR.BUSY, 'Host 已达到最大客户端数');
    }
    const ip = normalizeIp(req.socket.remoteAddress);
    if (!this.allowHandshake(ip)) {
      throw new HttpError(429, ERR.AUTH_FAILED, '握手尝试过于频繁');
    }
    const body = await readJsonBody(req, LIMITS.handshakeBytes);
    if (!isPlainObject(body) || body.v !== PROTOCOL_VERSION) {
      throw new HttpError(400, ERR.VERSION_MISMATCH, '协议版本不匹配');
    }
    if (!isBase64Url(body.clientNonce, 32)) {
      throw new HttpError(400, ERR.PROTOCOL, 'clientNonce 格式无效');
    }
    const clientName = clampText(body.clientName, LIMITS.maxClientName) || 'DSH Desktop';
    const clientHarnessVersion = clampText(body.clientHarnessVersion, LIMITS.maxVersionText);
    const pluginVersion = clampText(body.pluginVersion, LIMITS.maxVersionText);
    const serverNonce = randomSecret(32);
    const sessionId = randomSecret(16);
    const serverProof = makeServerProof(this.token, {
      clientNonce: body.clientNonce,
      serverNonce,
      sessionId,
    });
    this.pending.set(sessionId, {
      sessionId,
      clientNonce: body.clientNonce,
      serverNonce,
      clientName,
      clientHarnessVersion,
      pluginVersion,
      createdAt: Date.now(),
      ip,
      attempts: 0,
    });
    while (this.pending.size > 32) {
      const oldest = this.pending.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.pending.delete(oldest);
    }
    sendJson(res, 200, { v: PROTOCOL_VERSION, sessionId, serverNonce, serverProof });
  }

  async handleEvents(req, res, url) {
    const sessionId = url.searchParams.get('session');
    if (!isBase64Url(sessionId, 16)) {
      throw new HttpError(400, ERR.PROTOCOL, '会话 id 格式无效');
    }
    const proof = req.headers['x-private-remote-proof'];
    if (typeof proof !== 'string' || proof === '') {
      throw new HttpError(401, ERR.AUTH_FAILED, '缺少认证证明');
    }
    const pending = this.pending.get(sessionId);
    if (pending === undefined || Date.now() - pending.createdAt > LIMITS.pendingHandshakeMs) {
      this.pending.delete(sessionId);
      throw new HttpError(401, ERR.AUTH_FAILED, '认证会话不存在或已过期');
    }
    const expected = makeClientProof(this.token, pending);
    if (!proofEquals(expected, proof)) {
      pending.attempts += 1;
      if (pending.attempts >= 3) this.pending.delete(sessionId);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 80);
        timer.unref?.();
      });
      throw new HttpError(401, ERR.AUTH_FAILED, '配对令牌不匹配');
    }
    if (this.sessions.has(sessionId)) {
      throw new HttpError(409, ERR.ALREADY_CONNECTED, '该会话已经连接');
    }
    if (this.sessions.size >= LIMITS.maxClients) {
      throw new HttpError(503, ERR.BUSY, 'Host 已达到最大客户端数');
    }
    let peer;
    try {
      peer = await Promise.resolve(createOwnerPeer(this.connection));
    } catch (error) {
      throw new HttpError(503, ERR.UNSUPPORTED, errorMessage(error));
    }
    this.pending.delete(sessionId);
    const channel = new SecureChannel({
      token: this.token,
      clientNonce: pending.clientNonce,
      serverNonce: pending.serverNonce,
      sessionId,
      role: 'server',
    });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders?.();
    res.socket?.setNoDelay?.(true);
    res.setTimeout?.(0);
    const sink = new SseSink(res, channel);
    const session = {
      id: sessionId,
      peer,
      channel,
      sink,
      streams: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      clientName: pending.clientName,
      clientHarnessVersion: pending.clientHarnessVersion,
      pluginVersion: pending.pluginVersion,
      ip: pending.ip,
      closed: false,
      heartbeat: null,
    };
    this.sessions.set(sessionId, session);
    const onClose = () => this.cleanupSession(session, 'client-closed');
    req.on('close', onClose);
    req.on('error', onClose);
    res.on('close', onClose);
    res.on('error', onClose);
    session.heartbeat = setInterval(() => {
      if (session.closed) return;
      sink.comment(': ping\n\n').catch(() => this.cleanupSession(session, 'heartbeat-failed'));
    }, LIMITS.heartbeatMs);
    session.heartbeat.unref?.();
    try {
      await sink.send(FRAME.READY, { host: this.hostInfo() });
    } catch {
      this.cleanupSession(session, 'ready-failed');
      return;
    }
    this.log.info('client connected', session.clientName, `${session.clientHarnessVersion || 'unknown'}`, session.ip);
    this.notifyChange();
  }

  async handleRpc(req, res) {
    const sessionId = req.headers['x-private-remote-session'];
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new HttpError(401, ERR.AUTH_FAILED, '缺少会话标识');
    }
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.closed) {
      throw new HttpError(401, ERR.AUTH_FAILED, '远端会话不存在');
    }
    const body = await readJsonBody(req, LIMITS.postBytes);
    if (!isPlainObject(body) || typeof body.frame !== 'string') {
      throw new HttpError(400, ERR.PROTOCOL, '缺少加密帧');
    }
    let frame;
    try {
      frame = session.channel.decode(Buffer.from(body.frame, 'base64url'));
    } catch (error) {
      this.log.warn('rpc frame rejected', typeof error?.code === 'string' ? error.code : ERR.PROTOCOL);
      this.cleanupSession(session, 'frame-rejected');
      throw new HttpError(400, typeof error?.code === 'string' ? error.code : ERR.PROTOCOL, '加密帧无效');
    }
    session.lastActivity = Date.now();
    if (!isPlainObject(frame.payload)) {
      throw new HttpError(400, ERR.PROTOCOL, '帧负载格式无效');
    }
    const payload = frame.payload;
    switch (frame.type) {
      case FRAME.INVOKE: {
        const id = typeof payload.id === 'string' ? payload.id : '';
        const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : '';
        if (id === '' || endpoint === '') {
          this.respondResult(res, session, id, fail(ERR.PROTOCOL, '请求缺少 id 或 endpoint'));
          return;
        }
        if (!isAllowed(endpoint, 'unary')) {
          this.log.warn('endpoint denied', endpoint);
          this.respondResult(res, session, id, fail(ERR.ENDPOINT_DENIED, `远端不提供端点 ${endpoint}`));
          return;
        }
        const controller = new AbortController();
        const onClose = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on('close', onClose);
        let result;
        try {
          result = await dispatchThroughGateway(this.gateway, session.peer, endpoint, payload.payload, controller.signal);
        } catch (error) {
          result = toFailure(error);
        } finally {
          res.off('close', onClose);
        }
        this.respondResult(res, session, id, isPlainObject(result) ? result : ok(result));
        return;
      }
      case FRAME.STREAM_OPEN: {
        const id = typeof payload.id === 'string' ? payload.id : '';
        const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : '';
        if (id === '' || endpoint === '') {
          this.respondResult(res, session, id, fail(ERR.PROTOCOL, '流请求缺少 id 或 endpoint'));
          return;
        }
        if (!isAllowed(endpoint, 'stream')) {
          this.log.warn('stream endpoint denied', endpoint);
          this.respondResult(res, session, id, fail(ERR.ENDPOINT_DENIED, `远端不提供流端点 ${endpoint}`));
          return;
        }
        if (session.streams.size >= LIMITS.maxStreamsPerClient) {
          this.respondResult(res, session, id, fail(ERR.STREAM_OVERFLOW, '远端流数量超过限制'));
          return;
        }
        const record = {
          id,
          controller: new AbortController(),
          iterable: null,
          iterator: null,
          cancelled: false,
        };
        session.streams.set(id, record);
        try {
          record.iterable = await openStreamThroughGateway(
            this.gateway,
            session.peer,
            endpoint,
            payload.payload,
            record.controller.signal,
            record.controller,
          );
        } catch (error) {
          session.streams.delete(id);
          this.respondResult(res, session, id, toFailure(error));
          return;
        }
        this.respondResult(res, session, id, ok(true));
        void this.pumpStream(session, record);
        return;
      }
      case FRAME.STREAM_CANCEL: {
        const id = typeof payload.id === 'string' ? payload.id : '';
        const record = session.streams.get(id);
        if (record !== undefined) {
          record.cancelled = true;
          record.controller.abort();
          try {
            await record.iterator?.return?.();
          } catch {
            // The pump also closes the iterator.
          }
        }
        this.respondResult(res, session, id, ok(true));
        return;
      }
      case FRAME.BYE: {
        this.respondResult(res, session, '', ok(true));
        this.cleanupSession(session, 'client-bye');
        return;
      }
      default: {
        this.respondResult(res, session, '', fail(ERR.PROTOCOL, '不支持的帧类型'));
        return;
      }
    }
  }

  async pumpStream(session, record) {
    try {
      record.iterator = record.iterable[Symbol.asyncIterator]();
      while (true) {
        const next = await record.iterator.next();
        if (next.done === true) break;
        await session.sink.send(FRAME.STREAM_FRAME, { id: record.id, frame: next.value });
      }
      if (!record.controller.signal.aborted && !session.closed) {
        await session.sink.send(FRAME.STREAM_END, { id: record.id });
      }
    } catch (error) {
      if (!record.controller.signal.aborted && !session.closed) {
        try {
          await session.sink.send(FRAME.STREAM_ERROR, { id: record.id, error: toFailure(error).error });
        } catch {
          // The client went away while reporting the stream error.
        }
      }
    } finally {
      session.streams.delete(record.id);
      try {
        await record.iterator?.return?.();
      } catch {
        // ignore
      }
    }
  }

  respondResult(res, session, id, result) {
    if (res.destroyed || res.writableEnded) return;
    try {
      const frame = session.channel.encode(FRAME.RESULT, { id, result });
      sendJson(res, 200, { frame: frame.toString('base64url') });
    } catch (error) {
      this.log.warn('result encode failed', typeof error?.code === 'string' ? error.code : ERR.INTERNAL);
      sendJson(res, 500, { ok: false, error: toFailure(error).error });
    }
  }

  cleanupSession(session, reason) {
    if (session.closed) return;
    session.closed = true;
    if (session.heartbeat !== null) {
      clearInterval(session.heartbeat);
      session.heartbeat = null;
    }
    for (const record of session.streams.values()) {
      record.cancelled = true;
      try {
        record.controller.abort();
      } catch {
        // ignore
      }
      try {
        record.iterator?.return?.();
      } catch {
        // ignore
      }
    }
    session.streams.clear();
    try {
      session.sink.close();
    } catch {
      // ignore
    }
    try {
      session.peer?.dispose?.();
    } catch {
      // ignore
    }
    this.sessions.delete(session.id);
    this.log.info('client disconnected', session.clientName, reason);
    this.notifyChange();
  }

  notifyChange() {
    if (this.onChange === null) return;
    try {
      this.onChange();
    } catch {
      // A status listener must not break the bridge.
    }
  }
}
