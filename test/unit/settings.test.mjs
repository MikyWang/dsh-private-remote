import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {
  assertLocalBindAddress,
  buildSettingsConfig,
  findSettingsEntry,
  listLocalAddresses,
  probeBind,
  settingsChanged,
} from '../../src/host/settings.js';

function listen(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port: 0, exclusive: true }, () => resolve(server));
  });
}

test('settings entry lookup prefers the package name and rejects ambiguity', () => {
  const entry = { options: { id: 'private-remote', name: 'dsh-private-remote' } };
  assert.equal(findSettingsEntry([entry]), entry);
  assert.throws(() => findSettingsEntry([]), (error) => error.code === 'host/config-save-failed');
  assert.throws(() => findSettingsEntry(null), (error) => error.code === 'host/config-save-failed');
  assert.throws(
    () => findSettingsEntry([entry, { options: { id: 'other', name: 'dsh-private-remote' } }]),
    (error) => error.code === 'host/config-save-failed',
  );
});

test('settings config keeps unknown fields and always writes the four settings', () => {
  const current = {
    role: 'client',
    bindHost: '127.0.0.1',
    port: 47821,
    label: '',
    futureField: { keep: true },
  };
  const next = {
    role: 'host',
    bindHost: '100.68.241.8',
    port: 50000,
    label: 'Windows',
  };
  assert.deepEqual(buildSettingsConfig(current, next), { ...current, ...next });
  assert.deepEqual(buildSettingsConfig(null, next), next);
});

test('settings comparison normalizes the port and detects real changes', () => {
  const current = { role: 'client', bindHost: '100.68.241.8', port: 47821, label: 'Mac' };
  assert.equal(settingsChanged(current, { ...current, port: '47821' }), false);
  assert.equal(settingsChanged(current, { ...current, role: 'host' }), true);
  assert.equal(settingsChanged(current, { ...current, bindHost: '127.0.0.1' }), true);
  assert.equal(settingsChanged(current, { ...current, label: 'Other' }), true);
  assert.equal(settingsChanged(null, current), true);
});

test('local address suggestions keep private/Tailscale/ULA, drop public and link-local, and sort by kind', () => {
  const addresses = listLocalAddresses({
    Tailscale: [{ address: '100.68.241.8', family: 'IPv4', internal: false }],
    Ethernet: [
      { address: '192.168.1.5', family: 4, internal: false },
      { address: '8.8.8.8', family: 'IPv4', internal: false },
      { address: '100.128.0.1', family: 'IPv4', internal: false },
    ],
    IPv6: [
      { address: 'fd7a:115c:a1e0::1', family: 'IPv6', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false },
    ],
    Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  });
  assert.deepEqual(addresses.map((entry) => entry.address), [
    '100.68.241.8',
    '192.168.1.5',
    'fd7a:115c:a1e0::1',
    '127.0.0.1',
  ]);
  assert.deepEqual(addresses.map((entry) => entry.kind), ['tailscale', 'private', 'ula', 'loopback']);
  assert.equal(addresses[0].interfaceName, 'Tailscale');
});

test('probeBind rejects an occupied port and accepts a free one', async (t) => {
  const server = await listen();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  const occupied = server.address().port;
  await assert.rejects(
    probeBind('127.0.0.1', occupied),
    (error) => error.code === 'host/bind-invalid' && /占用/.test(error.message),
  );

  const freeServer = await listen();
  const freePort = freeServer.address().port;
  await new Promise((resolve) => freeServer.close(resolve));
  await probeBind('127.0.0.1', freePort);
});

test('probeBind rejects wildcard, public and invalid ports before listening', async () => {
  await assert.rejects(probeBind('0.0.0.0', 47821), (error) => error.code === 'host/bind-invalid');
  await assert.rejects(probeBind('8.8.8.8', 47821), (error) => error.code === 'host/bind-invalid');
  await assert.rejects(probeBind('127.0.0.1', 0), (error) => error.code === 'host/not-configured');
  await assert.rejects(probeBind('127.0.0.1', 70000), (error) => error.code === 'host/not-configured');
});

test('assertLocalBindAddress accepts loopback and assigned addresses only', () => {
  const addresses = [
    { address: '100.68.241.8', family: 'IPv4', kind: 'tailscale', interfaceName: 'Tailscale' },
    { address: '127.0.0.1', family: 'IPv4', kind: 'loopback', interfaceName: 'Loopback' },
  ];
  assert.equal(assertLocalBindAddress('127.0.0.1', addresses), '127.0.0.1');
  assert.equal(assertLocalBindAddress('localhost', addresses), 'localhost');
  assert.equal(assertLocalBindAddress('100.68.241.8', addresses), '100.68.241.8');
  assert.throws(
    () => assertLocalBindAddress('100.68.241.9', addresses),
    (error) => error.code === 'host/bind-invalid' && /不属于本机接口/.test(error.message),
  );
  assert.throws(
    () => assertLocalBindAddress('8.8.8.8', addresses),
    (error) => error.code === 'host/bind-invalid',
  );
});
