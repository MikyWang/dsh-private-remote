import { CONTROL_CHANNEL, fail, isPlainObject } from '../shared/protocol.js';

const CONTROL_ACTIONS = new Set([
  'status',
  'test',
  'connect',
  'disconnect',
  'useLocal',
  'reconnect',
  'hostInfo',
  'rotateToken',
  'dropClients',
  'forgetHostToken',
  'saveSettings',
  'resetSettings',
  'startHost',
]);

const MAX_BODY_BYTES = 1024 * 1024;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { code: 'gateway/request-too-large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Register the private browser control channel on the official web server.
 *
 * The installed connection.rpc.handle() is not usable from an external plugin:
 * it registers through the connection service's own fiber, which does not
 * inject webServer. A direct webServer prefix route plus the official
 * connection.admit() keeps the same browser-cookie/Peer admission while
 * avoiding that internal coupling.
 *
 * @param {object} input
 * @param {import('cordis').Context} input.ctx Caller context with webServer and connection injected.
 * @param {object} input.connection Official Host connection service.
 * @param {(action: string, payload: object, signal: AbortSignal, peer: object) => Promise<object>} input.handle
 * @param {{info: Function, warn: Function, error: Function}} input.log
 * @returns {Function} disposer
 */
export function registerControlRoute({ ctx, connection, handle, log }) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: CONTROL_CHANNEL,
    handler: async (req, res) => {
      const admission = connection.admit(req);
      if ('rejection' in admission) {
        res.writeHead(admission.rejection);
        res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      if (admission.peer !== connection.browserPeer) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }

      let pathname;
      try {
        pathname = new URL(req.url, 'http://localhost').pathname;
      } catch {
        res.writeHead(400);
        res.end('bad request');
        return;
      }
      const prefix = `${CONTROL_CHANNEL}/`;
      if (!pathname.startsWith(prefix)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const action = pathname.slice(prefix.length);
      if (!CONTROL_ACTIONS.has(action)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('method not allowed');
        return;
      }
      const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        res.writeHead(415);
        res.end('content type must be application/json');
        return;
      }

      let rpcId = '';
      let payload = {};
      try {
        const raw = await readBody(req);
        const envelope = JSON.parse(raw);
        if (!isPlainObject(envelope) || envelope.type !== 'client-request' || typeof envelope.rpcId !== 'string' || typeof envelope.method !== 'string') {
          res.writeHead(400);
          res.end('invalid client request envelope');
          return;
        }
        rpcId = envelope.rpcId;
        // The official Client Connection RPC caller sends the bare endpoint as
        // `method` (for example "status"); accept the prefixed form too for
        // older callers and hand-written test envelopes.
        const prefixed = `${CONTROL_CHANNEL.slice(1)}/${action}`;
        if (envelope.method !== action && envelope.method !== prefixed) {
          json(res, 200, { type: 'server-response', rpcId, result: fail('gateway/bad-request', '方法与控制端点不一致') });
          return;
        }
        payload = isPlainObject(envelope.payload) ? envelope.payload : {};
      } catch (error) {
        if (error?.code === 'gateway/request-too-large') {
          res.writeHead(413);
          res.end('request body too large');
          return;
        }
        res.writeHead(400);
        res.end('body is not JSON');
        return;
      }

      const controller = new AbortController();
      req.on('close', () => controller.abort());
      let result;
      try {
        result = await handle(action, payload, controller.signal, admission.peer);
      } catch (error) {
        log.error(`control action failed (${action}):`, error?.stack ?? error);
        result = fail('gateway/internal', '私人远程控制操作失败');
      }
      if (!res.writableEnded && !res.destroyed) json(res, 200, { type: 'server-response', rpcId, result });
    },
  }), `private-remote: control route ${CONTROL_CHANNEL}`);
}
