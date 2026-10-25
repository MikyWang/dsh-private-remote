import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConfigError,
  isPrivateHost,
  normalizeConfig,
  validateBindHost,
  validateRemoteUrl,
} from '../../src/host/config.js';

test('bind accepts loopback, RFC1918, Tailscale and IPv6 private addresses', () => {
  for (const host of ['127.0.0.1', 'localhost', '10.0.0.5', '192.168.1.9', '172.16.0.2', '100.68.241.8', '100.100.1.1', '::1', 'fd7a:115c:a1e0::1']) {
    assert.equal(validateBindHost(host), host, host);
  }
});

test('bind rejects wildcard and public addresses', () => {
  for (const host of ['0.0.0.0', '::', '8.8.8.8', '1.1.1.1', '203.0.113.9', 'example.com', '']) {
    assert.throws(() => validateBindHost(host), (error) => error instanceof ConfigError && error.code === 'host/bind-invalid', host);
  }
});

test('remote URL accepts private http and any https without credentials', () => {
  assert.equal(validateRemoteUrl('http://100.68.241.8:47821').url, 'http://100.68.241.8:47821');
  assert.equal(validateRemoteUrl('http://127.0.0.1:47821').url, 'http://127.0.0.1:47821');
  assert.equal(validateRemoteUrl('http://windows.local:47821').url, 'http://windows.local:47821');
  assert.equal(validateRemoteUrl('https://remote.example.test').url, 'https://remote.example.test');
});

test('remote URL rejects public http, paths, credentials and non-http schemes', () => {
  for (const url of [
    'http://8.8.8.8:47821',
    'http://example.com:47821',
    'ftp://127.0.0.1',
    'http://user:pass@127.0.0.1:47821',
    'http://127.0.0.1:47821/path',
    'http://127.0.0.1:47821?x=1',
    'http://127.0.0.1:47821#fragment',
    '',
  ]) {
    assert.throws(() => validateRemoteUrl(url), (error) => error instanceof ConfigError, url);
  }
});

test('config defaults and role validation', () => {
  assert.deepEqual(normalizeConfig(undefined), { role: 'client', bindHost: '127.0.0.1', port: 47821, label: '' });
  assert.deepEqual(normalizeConfig({ role: 'host', bindHost: '100.68.241.8', port: 50000, label: 'Win' }), {
    role: 'host', bindHost: '100.68.241.8', port: 50000, label: 'Win',
  });
  assert.deepEqual(normalizeConfig({ role: 'both', bindHost: '100.68.241.8', port: 50000, label: 'Win' }), {
    role: 'both', bindHost: '100.68.241.8', port: 50000, label: 'Win',
  });
  assert.throws(() => normalizeConfig({ role: 'server' }), (error) => error instanceof ConfigError);
  assert.throws(() => normalizeConfig({ role: 'host', bindHost: '0.0.0.0' }), (error) => error.code === 'host/bind-invalid');
  assert.throws(() => normalizeConfig({ port: 0 }), (error) => error instanceof ConfigError);
  assert.throws(() => normalizeConfig({ port: 65536 }), (error) => error instanceof ConfigError);
});

test('client mode keeps and validates the Host listen address for a later role switch', () => {
  assert.deepEqual(normalizeConfig({ role: 'client', bindHost: '100.68.241.8' }), {
    role: 'client', bindHost: '100.68.241.8', port: 47821, label: '',
  });
  assert.throws(
    () => normalizeConfig({ role: 'client', bindHost: '8.8.8.8' }),
    (error) => error instanceof ConfigError && error.code === 'host/bind-invalid',
  );
  assert.throws(
    () => normalizeConfig({ role: 'client', bindHost: '0.0.0.0' }),
    (error) => error instanceof ConfigError && error.code === 'host/bind-invalid',
  );
});

test('private host classifier treats Tailscale CGNAT as private but public IPv4 as public', () => {
  assert.equal(isPrivateHost('100.68.241.8'), true);
  assert.equal(isPrivateHost('100.128.0.1'), false);
  assert.equal(isPrivateHost('192.168.1.1'), true);
  assert.equal(isPrivateHost('8.8.8.8'), false);
  assert.equal(isPrivateHost('::1'), true);
  assert.equal(isPrivateHost('fd00::1'), true);
  assert.equal(isPrivateHost('2001:db8::1'), false);
});
