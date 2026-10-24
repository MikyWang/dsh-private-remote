import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewaySwitch } from '../../src/host/gateway-switch.js';
import { ERR } from '../../src/shared/protocol.js';

function harness() {
  const calls = { originalDispatch: 0, originalOpen: 0, requests: [], streams: [] };
  const browserPeer = { principal: { kind: 'owner' }, interactions: 'answer' };
  const otherPeer = { principal: { kind: 'owner' }, interactions: 'answer' };
  const gateway = {
    async dispatchRpc(endpoint) {
      calls.originalDispatch += 1;
      return { ok: true, value: { local: endpoint } };
    },
    async openWireStream(endpoint) {
      calls.originalOpen += 1;
      return (async function* local() { yield { type: 'local' }; })();
    },
  };
  const connection = { browserPeer };
  const state = { installed: true, active: false };
  const bridge = {
    async request(endpoint, payload) {
      calls.requests.push({ endpoint, payload });
      return { ok: true, value: { remote: endpoint } };
    },
    async openStream(endpoint, payload) {
      calls.streams.push({ endpoint, payload });
      return (async function* remote() { yield { type: 'remote' }; })();
    },
  };
  const sw = createGatewaySwitch({ gateway, connection, state, getBridge: () => bridge });
  return { calls, browserPeer, otherPeer, gateway, states: state, bridge, sw };
}

test('switch installation is idempotent and restores the local gateway on uninstall', async () => {
  const { calls, browserPeer, gateway, sw } = harness();
  sw.install();
  sw.install();
  assert.equal(sw.installed, true);
  sw.uninstall();
  assert.equal(sw.installed, false);
  const r = await gateway.dispatchRpc('session/page', { args: {} }, undefined, browserPeer);
  assert.equal(r.ok, true);
  assert.equal(r.value.local, 'session/page');
  assert.equal(calls.originalDispatch, 1);
});

test('offline dispatch and stream fail with remote/offline and never touch the local gateway', async () => {
  const { calls, browserPeer, states, gateway, sw } = harness();
  sw.install();
  states.active = false;
  const r = await gateway.dispatchRpc('session/page', { args: {} }, undefined, browserPeer);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, ERR.OFFLINE);
  await assert.rejects(
    gateway.openWireStream('session/follow', { args: {} }, undefined, browserPeer, undefined, undefined),
    (error) => error.code === ERR.OFFLINE,
  );
  assert.equal(calls.originalDispatch, 0);
  assert.equal(calls.originalOpen, 0);
});

test('active remote forwards browser calls and rejects other peers', async () => {
  const { calls, browserPeer, otherPeer, states, gateway, sw } = harness();
  sw.install();
  states.active = true;
  const r = await gateway.dispatchRpc('session/page', { args: { request: {} } }, undefined, browserPeer);
  assert.equal(r.ok, true);
  assert.equal(r.value.remote, 'session/page');
  assert.deepEqual(calls.requests, [{ endpoint: 'session/page', payload: { args: { request: {} } } }]);
  const forbidden = await gateway.dispatchRpc('session/page', { args: {} }, undefined, otherPeer);
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.code, ERR.FORBIDDEN);
  assert.equal(calls.requests.length, 1);

  const stream = await gateway.openWireStream('session/follow', { args: {} }, undefined, browserPeer, undefined, undefined);
  const frames = [];
  for await (const frame of stream) frames.push(frame);
  assert.deepEqual(frames, [{ type: 'remote' }]);
  assert.equal(calls.streams.length, 1);
  await assert.rejects(
    gateway.openWireStream('session/follow', { args: {} }, undefined, otherPeer, undefined, undefined),
    (error) => error.code === ERR.FORBIDDEN,
  );
  assert.equal(calls.streams.length, 1);
});

test('active remote with a closed bridge fails offline, not locally', async () => {
  const { calls, browserPeer, states, gateway, sw } = harness();
  sw.install();
  states.active = true;
  const nullSwitch = createGatewaySwitch({ gateway, connection: { browserPeer }, state: states, getBridge: () => null });
  sw.uninstall();
  nullSwitch.install();
  const r = await gateway.dispatchRpc('session/page', { args: {} }, undefined, browserPeer);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, ERR.OFFLINE);
  assert.equal(calls.originalDispatch, 0);
  assert.equal(calls.requests.length, 0);
});

test('uninstall restores the local gateway for explicit local mode', async () => {
  const { calls, browserPeer, states, gateway, sw } = harness();
  sw.install();
  states.active = true;
  sw.uninstall();
  assert.equal(sw.installed, false);
  const r = await gateway.dispatchRpc('session/page', { args: {} }, undefined, browserPeer);
  assert.equal(r.ok, true);
  assert.equal(r.value.local, 'session/page');
  assert.equal(calls.originalDispatch, 1);
});
