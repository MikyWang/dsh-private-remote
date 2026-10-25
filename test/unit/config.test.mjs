import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConfigError,
  findTailscaleAddress,
  isTailscaleHost,
  isTailscaleIpv4,
  normalizeConfig,
  validateHostAddress,
  validateRemoteUrl,
} from '../../src/host/config.js';

test('remote URL accepts Tailscale IP/MagicDNS and defaults the bridge port', () => {
  assert.equal(validateRemoteUrl('http://100.68.241.8:18082').url, 'http://100.68.241.8:18082');
  assert.equal(validateRemoteUrl('http://100.68.241.8').url, 'http://100.68.241.8:18082');
  assert.equal(validateRemoteUrl('100.68.241.8').url, 'http://100.68.241.8:18082');
  assert.equal(validateRemoteUrl('http://machine.tailnet.ts.net:18082').url, 'http://machine.tailnet.ts.net:18082');
  assert.equal(validateRemoteUrl('http://100.68.241.8:50000').url, 'http://100.68.241.8:50000');
});

test('remote URL rejects non-Tailscale hosts, https, paths, credentials and non-http schemes', () => {
  for (const url of [
    'http://127.0.0.1:18082',
    'http://192.168.1.5:18082',
    'http://8.8.8.8:18082',
    'http://100.128.0.1:18082',
    'https://100.68.241.8:18082',
    'ftp://100.68.241.8',
    'http://user:pass@100.68.241.8:18082',
    'http://100.68.241.8:18082/path',
    'http://100.68.241.8:18082?x=1',
    'http://100.68.241.8:18082#fragment',
    '',
  ]) {
    assert.throws(() => validateRemoteUrl(url), (error) => error instanceof ConfigError, url);
  }
});

test('config defaults to client on 18082 and ignores legacy bindHost/label', () => {
  assert.deepEqual(normalizeConfig(undefined), { role: 'client', port: 18082 });
  assert.deepEqual(normalizeConfig({ role: 'host', port: 50000 }), { role: 'host', port: 50000 });
  assert.deepEqual(normalizeConfig({ role: 'both', bindHost: '127.0.0.1', port: 50000, label: 'Win' }), {
    role: 'both', port: 50000,
  });
  assert.throws(() => normalizeConfig({ role: 'server' }), (error) => error instanceof ConfigError);
  assert.throws(() => normalizeConfig({ port: 0 }), (error) => error instanceof ConfigError);
  assert.throws(() => normalizeConfig({ port: 65536 }), (error) => error instanceof ConfigError);
});

test('Tailscale detection picks the CGNAT IPv4 only', () => {
  assert.equal(isTailscaleIpv4('100.68.241.8'), true);
  assert.equal(isTailscaleIpv4('100.64.0.1'), true);
  assert.equal(isTailscaleIpv4('100.127.255.254'), true);
  assert.equal(isTailscaleIpv4('100.128.0.1'), false);
  assert.equal(isTailscaleIpv4('192.168.1.5'), false);
  assert.equal(isTailscaleIpv4('8.8.8.8'), false);
  assert.equal(isTailscaleHost('100.68.241.8'), true);
  assert.equal(isTailscaleHost('machine.tailnet.ts.net'), true);
  assert.equal(isTailscaleHost('example.com'), false);
  assert.equal(
    findTailscaleAddress({
      Tailscale: [{ address: '100.68.241.8', family: 'IPv4', internal: false }],
      Ethernet: [{ address: '8.8.8.8', family: 4, internal: false }],
    }),
    '100.68.241.8',
  );
  assert.equal(findTailscaleAddress({ Ethernet: [{ address: '192.168.1.5', family: 4 }] }), null);
});

test('Host address validation accepts only a literal Tailscale IPv4', () => {
  assert.equal(validateHostAddress('100.68.241.8'), '100.68.241.8');
  for (const host of ['127.0.0.1', 'localhost', '8.8.8.8', '100.128.0.1', '']) {
    assert.throws(
      () => validateHostAddress(host),
      (error) => error instanceof ConfigError && error.code === 'host/tailscale-missing',
      host,
    );
  }
});
