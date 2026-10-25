import assert from 'node:assert/strict';
import test from 'node:test';
import { findTailscaleAddress } from '../../src/host/config.js';
import { BridgeClient } from '../../src/host/bridge-client.js';
import { BridgeServer } from '../../src/host/bridge-server.js';

const TAILSCALE = findTailscaleAddress();

function quietLog() {
  return { info() {}, warn() {}, error() {} };
}

function createFakeHarness(record) {
  const peers = [];
  const connection = {
    createPeer({ principal, interactions }) {
      const peer = {
        id: `peer-${peers.length + 1}`,
        principal,
        interactions,
        signal: new AbortController().signal,
        disposed: false,
        async dispose() {
          peer.disposed = true;
        },
      };
      peers.push(peer);
      return peer;
    },
  };
  const gateway = {
    async dispatchRpc(endpoint, payload, signal, peer) {
      record.unary.push({ endpoint, payload, peer });
      if (endpoint === 'session/page') {
        return { ok: true, value: { items: [{ id: 's1' }], hasMore: false } };
      }
      if (endpoint === 'session/prompt') {
        return { ok: true, value: { accepted: true, requestId: payload?.requestId ?? null } };
      }
      if (endpoint === 'session/cancel') {
        return { ok: true, value: { cancelled: true } };
      }
      return { ok: false, error: { code: 'session/not-found', message: '没有该会话', details: {} } };
    },
    async openWireStream(endpoint, payload, uplink, peer, signal, control) {
      record.streams.push({ endpoint, payload, uplink, peer, signal, control });
      if (endpoint === 'session/follow') {
        return (async function* follow() {
          yield { type: 'frame', frame: { type: 'baseline', payload: { sequence: 1 } } };
          yield { type: 'frame', frame: { type: 'delta', payload: { sequence: 2 } } };
        })();
      }
      if (endpoint === '$events') {
        return (async function* events() {
          yield { type: 'ready' };
          await new Promise((resolve) => setTimeout(resolve, 15));
          yield { type: 'event', event: { kind: 'approval/request', payload: { id: 'approval-1' } } };
        })();
      }
      throw { isDSHRemoteError: true, code: 'gateway/stream-unavailable', message: '没有该流', details: {} };
    },
    claimsEndpoint() {
      return true;
    },
    wireStream: {
      failure(error) {
        return { code: 'gateway/internal', message: String(error), details: {} };
      },
    },
  };
  return { connection, gateway, peers };
}

test('bridge authenticates, forwards allow-listed unary calls, streams and denies the rest', { skip: TAILSCALE === null }, async (t) => {
  const record = { unary: [], streams: [] };
  const fake = createFakeHarness(record);
  const server = new BridgeServer({
    connection: fake.connection,
    gateway: fake.gateway,
    config: { bindHost: TAILSCALE, port: 0, label: 'Fake Host' },
    token: 'test-token',
    hostId: 'host-test',
    compat: { ok: true, missing: [], harnessVersion: '0.2.1-rc.3', supportedHarness: '0.2.1-rc.3', compatId: 'test' },
    harnessVersion: '0.2.1-rc.3',
    log: quietLog(),
  });
  await server.start();
  t.after(async () => {
    await server.stop();
  });
  const url = `http://${TAILSCALE}:${server.port}`;

  const wrong = new BridgeClient({ url, token: 'wrong-token', clientName: 'wrong' });
  await assert.rejects(wrong.connect(), (error) => error.code === 'remote/auth-failed');
  wrong.close();

  const client = new BridgeClient({ url, token: 'test-token', clientName: 'test-mac', clientHarnessVersion: '0.2.1-rc.3', pluginVersion: '0.1.0' });
  const host = await client.connect();
  assert.equal(host.deviceName, 'Fake Host');
  assert.equal(host.protocol, 1);
  assert.equal(host.compat.ok, true);
  assert.equal(host.platform, process.platform);

  const page = await client.request('session/page', { sessionId: 's1' });
  assert.equal(page.ok, true);
  assert.equal(page.value.items[0].id, 's1');
  assert.equal(record.unary[0].endpoint, 'session/page');
  assert.equal(record.unary[0].peer.principal.kind, 'owner');
  assert.equal(record.unary[0].peer.interactions, 'answer');

  const prompt = await client.request('session/prompt', { requestId: 'req-1', sessionId: 's1', mode: 'followup', content: 'hi' });
  assert.equal(prompt.value.requestId, 'req-1');

  const denied = await client.request('credentials/resolve', { ref: 'x' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'remote/endpoint-denied');

  const frames = [];
  for await (const frame of await client.openStream('session/follow', { sessionId: 's1' })) {
    frames.push(frame);
  }
  assert.equal(frames.length, 2);
  assert.equal(frames[0].frame.type, 'baseline');
  assert.equal(frames[1].frame.type, 'delta');
  assert.equal(record.streams[0].endpoint, 'session/follow');
  assert.equal(typeof record.streams[0].uplink[Symbol.asyncIterator], 'function');
  assert.equal(record.streams[0].peer, record.unary[0].peer);

  const events = [];
  for await (const frame of await client.openStream('$events', { args: {} })) {
    events.push(frame);
  }
  assert.equal(events.length, 2);
  assert.equal(events[1].event.kind, 'approval/request');

  await assert.rejects(
    client.openStream('terminal/create', { args: {} }),
    (error) => error.code === 'remote/endpoint-denied',
  );
  await assert.rejects(
    client.openStream('session/control', { args: {} }),
    (error) => error.code === 'gateway/stream-unavailable',
  );

  const peer = record.unary[0].peer;
  assert.equal(peer.disposed, false);
  client.close();
  for (let index = 0; index < 50 && peer.disposed === false; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(peer.disposed, true);
});
