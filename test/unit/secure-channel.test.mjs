import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIRECTION_C2S,
  DIRECTION_S2C,
  ERR,
  FRAME,
  LIMITS,
  PROTOCOL_VERSION,
} from '../../src/shared/protocol.js';
import {
  ReplayWindow,
  SecureChannel,
  SecureChannelError,
  decodeFrame,
  deriveKeys,
  encodeFrame,
  isBase64Url,
  makeClientProof,
  makeServerProof,
  proofEquals,
  randomSecret,
} from '../../src/shared/secure-channel.js';

const TOKEN = randomSecret(32);
const CLIENT_NONCE = randomSecret(32);
const SERVER_NONCE = randomSecret(32);
const SESSION_ID = randomSecret(16);

function channels() {
  return {
    client: new SecureChannel({ token: TOKEN, clientNonce: CLIENT_NONCE, serverNonce: SERVER_NONCE, sessionId: SESSION_ID, role: 'client' }),
    server: new SecureChannel({ token: TOKEN, clientNonce: CLIENT_NONCE, serverNonce: SERVER_NONCE, sessionId: SESSION_ID, role: 'server' }),
  };
}

test('random secret shape and strict validation', () => {
  assert.equal(isBase64Url(randomSecret(32), 32), true);
  assert.equal(isBase64Url(randomSecret(16), 16), true);
  assert.equal(isBase64Url('abc', 32), false);
  assert.equal(isBase64Url(123, 32), false);
});

test('server and client proofs are deterministic, token-bound and distinct', () => {
  const fields = { clientNonce: CLIENT_NONCE, serverNonce: SERVER_NONCE, sessionId: SESSION_ID };
  const server = makeServerProof(TOKEN, fields);
  assert.equal(server, makeServerProof(TOKEN, fields));
  assert.equal(proofEquals(server, makeServerProof(TOKEN, fields)), true);
  assert.equal(proofEquals(server, makeServerProof(randomSecret(32), fields)), false);
  const client = makeClientProof(TOKEN, {
    ...fields,
    clientName: 'mac',
    clientHarnessVersion: '0.2.1-rc.3',
    pluginVersion: '0.1.0',
  });
  assert.notEqual(client, server);
  assert.equal(proofEquals(client, makeClientProof(TOKEN, {
    ...fields,
    clientName: 'mac',
    clientHarnessVersion: '0.2.1-rc.3',
    pluginVersion: '0.1.0',
  })), true);
  assert.equal(proofEquals(client, makeClientProof(TOKEN, {
    ...fields,
    clientName: 'other',
    clientHarnessVersion: '0.2.1-rc.3',
    pluginVersion: '0.1.0',
  })), false);
});

test('HKDF keys are identical per direction and distinct across directions', () => {
  const keys = deriveKeys(TOKEN, CLIENT_NONCE, SERVER_NONCE, SESSION_ID);
  assert.equal(keys.c2s.length, 32);
  assert.equal(keys.s2c.length, 32);
  assert.notDeepEqual(keys.c2s, keys.s2c);
  const again = deriveKeys(TOKEN, CLIENT_NONCE, SERVER_NONCE, SESSION_ID);
  assert.deepEqual(keys.c2s, again.c2s);
  assert.deepEqual(keys.s2c, again.s2c);
});

test('client and server exchange frames in both directions', () => {
  const { client, server } = channels();
  const encoded = client.encode(FRAME.INVOKE, { id: '1', endpoint: 'session/page' });
  const decoded = server.decode(encoded);
  assert.equal(decoded.type, FRAME.INVOKE);
  assert.deepEqual(decoded.payload, { id: '1', endpoint: 'session/page' });
  const reply = server.encode(FRAME.RESULT, { id: '1', result: { ok: true, value: 7 } });
  const replyDecoded = client.decode(reply);
  assert.deepEqual(replyDecoded.payload, { id: '1', result: { ok: true, value: 7 } });
});

test('tampered ciphertext and header are rejected', () => {
  const { client, server } = channels();
  const encoded = Buffer.from(client.encode(FRAME.INVOKE, { id: '1' }));
  encoded[encoded.length - 1] ^= 0xff;
  assert.throws(() => server.decode(encoded), (error) => error instanceof SecureChannelError && error.code === ERR.TAMPERED);

  const { client: client2, server: server2 } = channels();
  const second = Buffer.from(client2.encode(FRAME.INVOKE, { id: '2' }));
  second[2] = FRAME.RESULT.charCodeAt(0);
  assert.throws(() => server2.decode(second), (error) => error instanceof SecureChannelError && error.code === ERR.TAMPERED);
});

test('replayed and stale sequence numbers are rejected', () => {
  const { client, server } = channels();
  const first = client.encode(FRAME.INVOKE, { seq: 1 });
  assert.equal(server.decode(first).payload.seq, 1);
  assert.throws(() => server.decode(first), (error) => error instanceof SecureChannelError && error.code === ERR.REPLAY);

  const window = new ReplayWindow(4);
  for (const seq of [0, 1, 2, 3]) assert.equal(window.accept(seq), true);
  assert.equal(window.accept(0), false);
  for (const seq of [10, 11, 12, 13]) assert.equal(window.accept(seq), true);
  assert.equal(window.accept(5), false, 'outside the sliding window');
  assert.equal(window.accept(9), false, 'just outside the sliding window');
  assert.equal(window.accept(10), false, 'already seen');
  assert.equal(window.accept(14), true, 'new head of the window');
});

test('out-of-order frames inside the window are accepted', () => {
  const { client, server } = channels();
  const a = client.encode(FRAME.INVOKE, { n: 0 });
  const b = client.encode(FRAME.INVOKE, { n: 1 });
  const c = client.encode(FRAME.INVOKE, { n: 2 });
  assert.equal(server.decode(c).payload.n, 2);
  assert.equal(server.decode(a).payload.n, 0);
  assert.equal(server.decode(b).payload.n, 1);
});

test('wrong direction is rejected', () => {
  const { client, server } = channels();
  const encoded = client.encode(FRAME.INVOKE, { id: '1' });
  assert.throws(
    () => decodeFrame(server.inKey, DIRECTION_S2C, encoded, new ReplayWindow()),
    (error) => error instanceof SecureChannelError && error.code === ERR.PROTOCOL,
  );
});

test('oversized payload and unknown frame type are rejected locally', () => {
  const { client } = channels();
  const huge = 'x'.repeat(LIMITS.frameBytes + 1);
  assert.throws(() => client.encode(FRAME.INVOKE, { huge }), (error) => error instanceof SecureChannelError && error.code === ERR.PAYLOAD_TOO_LARGE);
  assert.throws(() => client.encode('?', {}), (error) => error instanceof SecureChannelError && error.code === ERR.PROTOCOL);
});

test('protocol version is part of every frame header', () => {
  const { client, server } = channels();
  const encoded = Buffer.from(client.encode(FRAME.INVOKE, { id: '1' }));
  assert.equal(encoded.readUInt8(0), PROTOCOL_VERSION);
  encoded.writeUInt8(99, 0);
  assert.throws(() => server.decode(encoded), (error) => error instanceof SecureChannelError && error.code === ERR.PROTOCOL);
});

test('frame header direction bytes use the shared constants', () => {
  const { client } = channels();
  const encoded = client.encode(FRAME.READY, {});
  assert.equal(encoded.readUInt8(1), DIRECTION_C2S);
  assert.notEqual(encoded.readUInt8(1), DIRECTION_S2C);
});
