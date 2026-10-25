import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { findTailscaleAddress } from '../../src/host/config.js';
import {
  buildSettingsConfig,
  findSettingsEntry,
  probeBind,
  settingsChanged,
} from '../../src/host/settings.js';

const TAILSCALE = findTailscaleAddress();

function listen(host) {
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

test('settings config writes role/port, removes legacy bindHost/label and keeps unknown fields', () => {
  const current = {
    role: 'client',
    bindHost: '127.0.0.1',
    port: 47821,
    label: 'old',
    futureField: { keep: true },
  };
  const next = { role: 'host', port: 50000 };
  assert.deepEqual(buildSettingsConfig(current, next), {
    role: 'host',
    port: 50000,
    futureField: { keep: true },
  });
  assert.deepEqual(buildSettingsConfig(null, next), { role: 'host', port: 50000 });
});

test('settings comparison only reacts to role and port changes', () => {
  const current = { role: 'client', port: 18082 };
  assert.equal(settingsChanged(current, { role: 'client', port: '18082' }), false);
  assert.equal(settingsChanged(current, { role: 'host', port: 18082 }), true);
  assert.equal(settingsChanged(current, { role: 'client', port: 18083 }), true);
  assert.equal(settingsChanged(null, current), true);
});

test('probeBind rejects an occupied Tailscale port and accepts a free one', { skip: TAILSCALE === null }, async (t) => {
  const server = await listen(TAILSCALE);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  const occupied = server.address().port;
  await assert.rejects(
    probeBind(TAILSCALE, occupied),
    (error) => error.code === 'host/bind-invalid' && /占用/.test(error.message),
  );

  const freeServer = await listen(TAILSCALE);
  const freePort = freeServer.address().port;
  await new Promise((resolve) => freeServer.close(resolve));
  await probeBind(TAILSCALE, freePort);
});

test('probeBind rejects non-Tailscale hosts and invalid ports before listening', async () => {
  for (const host of ['0.0.0.0', '8.8.8.8', '127.0.0.1', 'localhost']) {
    await assert.rejects(probeBind(host, 18082), (error) => error.code === 'host/tailscale-missing', host);
  }
  if (TAILSCALE !== null) {
    await assert.rejects(probeBind(TAILSCALE, 0), (error) => error.code === 'host/not-configured');
    await assert.rejects(probeBind(TAILSCALE, 70000), (error) => error.code === 'host/not-configured');
  }
});
