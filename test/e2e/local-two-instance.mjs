/**
 * Local two-instance integration check.
 *
 * Usage:
 *   DSH_HOST_URL=http://127.0.0.1:47311/?token=... \
 *   DSH_CLIENT_URL=http://127.0.0.1:47312/?token=... \
 *   DSH_REMOTE_URL=http://127.0.0.1:47821 \
 *   node test/e2e/local-two-instance.mjs
 *
 * Both instances are isolated Harness web profiles with this bundle installed.
 * The Host instance runs role: host; the Client instance keeps the default
 * role: client. Everything the Client does below goes through its own local
 * Host: /api for unary Gateway calls and /api/remote.mux for streams. The
 * Local Host switch must forward both to the paired remote Host, so these
 * assertions exercise the same path the official session UI uses.
 *
 * The script never prints the pairing token or the browser cookie, and never
 * writes either to disk. It spends at most two short model turns on the
 * isolated Host's local-Ollama route.
 */

import { connect as openSocket } from './ws-client.mjs';

const HOST_URL = process.env.DSH_HOST_URL ?? '';
const CLIENT_URL = process.env.DSH_CLIENT_URL ?? '';
const REMOTE_URL = process.env.DSH_REMOTE_URL ?? 'http://100.68.241.8:18084';
const REMOTE_PORT = Number(new URL(REMOTE_URL).port || 18084);
const TAILSCALE_HOST = new URL(REMOTE_URL).hostname;
const CLIENT_HOST_PORT = REMOTE_PORT + 1;
const SHELL_TOOL = process.platform === 'win32' ? 'pwsh' : 'bash';
const SHELL_COMMAND = process.platform === 'win32'
  ? 'New-Item -ItemType Directory -Force -Path "$env:TEMP/dsh-private-remote-approval-test"'
  : 'mkdir -p /tmp/dsh-private-remote-approval-test';
const VERBOSE = process.env.DSH_E2E_VERBOSE === '1';
let SESSION_ID = process.env.DSH_E2E_SESSION_ID ?? 'session-e36f55a7-53fa-490d-b544-992f20f4e993';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.log(`- ${message}`);
}

function debug(...args) {
  if (VERBOSE) console.log('  ', ...args);
}

async function browserCookie(launchUrl) {
  const res = await fetch(launchUrl, { redirect: 'manual' });
  assert(res.status === 303 || res.status === 200, `launch URL returned ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((value) => value.split(';', 1)[0]).join('; ');
  assert(cookie !== '', 'launch URL did not set an auth cookie');
  return { cookie, origin: new URL(launchUrl).origin };
}

async function control(origin, cookie, action, payload = {}) {
  const rpcId = `e2e-${action}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await fetch(`${origin}/private-remote/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method: action, payload }),
  });
  assert(res.status === 200, `control ${action} returned HTTP ${res.status}`);
  const body = await res.json();
  assert(body.type === 'server-response' && body.rpcId === rpcId, 'control envelope mismatch');
  return body.result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a local control call across the plugin reload that saveSettings and
 * resetSettings trigger. A lost response is safe to retry: the second save
 * sees the same configuration and answers `unchanged`.
 */
async function controlRetry(origin, cookie, action, payload = {}, attempts = 24) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await control(origin, cookie, action, payload);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError;
}

function configMatches(config, expected) {
  return config?.role === expected.role && Number(config?.port) === Number(expected.port);
}

async function waitForStatus(origin, cookie, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const result = await control(origin, cookie, 'status');
      if (result.ok) {
        last = result.value;
        if (predicate(result.value)) return result.value;
      }
    } catch {
      // The plugin entry is reloading and its control route is briefly absent.
    }
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last?.config ?? null)}`);
}

async function api(origin, cookie, method, payload) {
  const rpcId = `api-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  });
  assert(res.status === 200, `/api/${method} returned HTTP ${res.status}`);
  const body = await res.json();
  assert(body.type === 'server-response' && body.rpcId === rpcId, `/api/${method} envelope mismatch`);
  return body.result;
}

/** Open one logical stream through the official mux and collect its frames. */
async function openMux(clientSide, endpoint, payload, timeoutMs) {
  const url = `${clientSide.origin.replace('http://', 'ws://')}/api/remote.mux`;
  const socket = await openSocket(url, { Cookie: clientSide.cookie, Origin: clientSide.origin });
  const frames = [];
  const waiters = new Set();
  socket.on((text) => {
    if (text === null) {
      for (const waiter of waiters) waiter(null);
      return;
    }
    let frame;
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }
    debug('mux frame', JSON.stringify(frame).slice(0, 240));
    frames.push(frame);
    for (const waiter of [...waiters]) {
      if (waiter(frame)) waiters.delete(waiter);
    }
  });
  const streamId = `s-${Math.random().toString(16).slice(2)}`;
  socket.send(JSON.stringify({ type: 'open', streamId, endpoint, payload }));
  function waitForFrame(startIndex, predicate, ms, label) {
    return new Promise((resolve, reject) => {
      for (let index = startIndex; index < frames.length; index += 1) {
        if (predicate(frames[index])) {
          resolve(frames[index]);
          return;
        }
      }
      const timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`timed out waiting for ${label}; frames=${frames.length}`));
      }, ms);
      const waiter = (frame) => {
        if (frame === null) return false;
        if (!predicate(frame)) return false;
        clearTimeout(timer);
        resolve(frame);
        return true;
      };
      waiters.add(waiter);
    });
  }
  return {
    frames,
    send: (message) => socket.send(JSON.stringify({ ...message, streamId })),
    mark() {
      return frames.length;
    },
    waitFor(predicate, ms, label) {
      return waitForFrame(0, predicate, ms, label);
    },
    waitForAfter(mark, predicate, ms, label) {
      return waitForFrame(mark, predicate, ms, label);
    },
    async close() {
      try {
        socket.send(JSON.stringify({ type: 'end', streamId }));
      } catch {
        // socket already gone
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      socket.close();
    },
  };
}

async function sessionSnapshot(clientSide) {
  const listed = await api(clientSide.origin, clientSide.cookie, 'session/list', { args: { _request: {} } });
  assert(listed.ok === true, `session/list through the switch failed: ${listed.error?.code}`);
  const items = listed.value.items ?? listed.value.sessions ?? [];
  const item = items.find((entry) => String(entry.sessionId ?? entry.id) === SESSION_ID);
  return { listed, items, item };
}

async function sessionEvents(clientSide, throughSeq) {
  const page = await api(clientSide.origin, clientSide.cookie, 'session/page', {
    args: { request: { address: { kind: 'session', sessionId: SESSION_ID }, throughSeq, maxMessages: 400 } },
  });
  assert(page.ok === true, `session/page through the switch failed: ${page.error?.code}`);
  return page.value.records.map((record) => (record.type === 'event' ? record.event : record));
}

function assistantText(event) {
  const content = event?.data?.message?.content ?? event?.data?.content ?? [];
  return content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

async function waitForSeq(clientSide, seq, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await sessionSnapshot(clientSide);
    if (snap.item !== undefined && snap.item.projections.asOfSeq >= seq) return snap;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timed out waiting for the remote session cursor to reach ${seq}`);
}

async function waitForTurnEnd(clientSide, timeoutMs, afterSeq = -1) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await sessionSnapshot(clientSide);
    assert(snap.item !== undefined, 'remote session disappeared while polling');
    const events = await sessionEvents(clientSide, snap.item.projections.asOfSeq);
    const end = events.filter((event) => event.type === 'turn/end' && (typeof event.seq !== 'number' || event.seq > afterSeq)).at(-1);
    if (end !== undefined && snap.item.running === false) return { events, end };
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error('timed out waiting for the remote turn to end');
}

/** Create a fresh remote session through the switched /api and select it. */
async function createSession(clientSide, cwd) {
  const created = await api(clientSide.origin, clientSide.cookie, 'session/create', {
    args: { request: { cwd } },
  });
  assert(created.ok === true, `session/create failed: ${created.error?.code}`);
  const id = created.value?.sessionId;
  assert(typeof id === 'string' && id !== '' && id !== SESSION_ID, 'session/create returned no new id');
  SESSION_ID = id;
  const snap = await sessionSnapshot(clientSide);
  assert(snap.item !== undefined, 'the newly created remote session is not visible in session/list');
  assert(snap.item.blank === true, 'the newly created remote session is not blank');
  log(`new remote session created through the switch: ${id}`);
  return id;
}

async function main() {
  assert(HOST_URL !== '' && CLIENT_URL !== '', 'set DSH_HOST_URL and DSH_CLIENT_URL');
  const hostSide = await browserCookie(HOST_URL);
  const clientSide = await browserCookie(CLIENT_URL);

  const hostInfo = await control(hostSide.origin, hostSide.cookie, 'hostInfo');
  assert(hostInfo.ok === true, `hostInfo failed: ${hostInfo.error?.code}`);
  assert(hostInfo.value.listen.host === TAILSCALE_HOST, `Host bridge bound ${hostInfo.value.listen.host}, expected ${TAILSCALE_HOST}`);
  log(`host bridge listening on ${hostInfo.value.listen.host}:${hostInfo.value.listen.port}`);

  const localStatus = await control(clientSide.origin, clientSide.cookie, 'status');
  assert(localStatus.ok === true, 'client status failed');
  // The runner seeds client.json without a token. The client must stay in
  // local mode: installing the Gateway switch before the official UI boots
  // fails $events/settings and leaves the whole client tree pending.
  assert(localStatus.value.mode === 'local', `expected local mode with a saved pairing, got ${localStatus.value.mode}`);
  assert(localStatus.value.remote.installed === false, 'a saved pairing installed the Gateway switch at boot');
  assert(localStatus.value.clientConfig.url === REMOTE_URL, `saved pairing URL lost: ${localStatus.value.clientConfig.url}`);
  const bootLocalList = await api(clientSide.origin, clientSide.cookie, 'session/list', { args: { _request: {} } });
  assert(bootLocalList.ok === true, `local /api failed at boot with a saved pairing: ${bootLocalList.error?.code}`);
  log('persisted pairing stays local at boot; local /api works; no boot-time Gateway switch');

  // Settings surface: the official configEditor must persist the same Host
  // fields the Settings page edits, and the plugin reload must restart the
  // Host bridge without restarting the Harness process.
  const settingsStatus = await waitForStatus(
    clientSide.origin,
    clientSide.cookie,
    (value) => value.settingsWritable === true,
    15000,
    'settings editor availability',
  );
  assert(settingsStatus.tailscale === TAILSCALE_HOST, `settings status Tailscale is ${settingsStatus.tailscale}, expected ${TAILSCALE_HOST}`);
  log(`settings editor writable; Tailscale host ${settingsStatus.tailscale}`);

  const occupiedPort = await controlRetry(clientSide.origin, clientSide.cookie, 'saveSettings', {
    role: 'both',
    port: REMOTE_PORT,
  });
  assert(occupiedPort.ok === false, 'the Host instance bridge port was accepted twice');
  assert(occupiedPort.error.code === 'host/bind-invalid', `occupied port produced ${occupiedPort.error.code}`);
  log('occupied Host bridge port rejected before reload');

  const saved = await controlRetry(clientSide.origin, clientSide.cookie, 'saveSettings', {
    role: 'both',
    port: CLIENT_HOST_PORT,
  });
  assert(saved.ok === true, `settings save failed: ${saved.error?.code}`);
  const savedStatus = await waitForStatus(
    clientSide.origin,
    clientSide.cookie,
    (value) => configMatches(value.config, {
      role: 'both',
      port: CLIENT_HOST_PORT,
    }) && value.host.listening === true,
    20000,
    'role=both Host bridge after settings save',
  );
  assert(savedStatus.host.url === `http://${TAILSCALE_HOST}:${CLIENT_HOST_PORT}`, `unexpected Host URL ${savedStatus.host.url}`);
  assert(typeof savedStatus.host.info?.deviceName === 'string' && savedStatus.host.info.deviceName !== '', 'Host identity missing');
  log(`settings saved without restart; role=both Host bridge listens on ${TAILSCALE_HOST}:${CLIENT_HOST_PORT}`);

  const clientHostInfo = await controlRetry(clientSide.origin, clientSide.cookie, 'hostInfo');
  assert(clientHostInfo.ok === true, `client hostInfo failed: ${clientHostInfo.error?.code}`);

  const stopped = await controlRetry(clientSide.origin, clientSide.cookie, 'stopHost');
  assert(stopped.ok === true, `stopHost failed: ${stopped.error?.code}`);
  await waitForStatus(
    clientSide.origin,
    clientSide.cookie,
    (value) => value.host.listening === false && value.host.stopped === true,
    15000,
    'Host bridge stopped after stopHost',
  );
  const restarted = await controlRetry(clientSide.origin, clientSide.cookie, 'startHost');
  assert(restarted.ok === true, `startHost failed: ${restarted.error?.code}`);
  await waitForStatus(
    clientSide.origin,
    clientSide.cookie,
    (value) => value.host.listening === true,
    15000,
    'Host bridge restarted',
  );
  const restartedInfo = await controlRetry(clientSide.origin, clientSide.cookie, 'hostInfo');
  assert(restartedInfo.ok === true, `restarted hostInfo failed: ${restartedInfo.error?.code}`);
  log('Host stopHost/startHost recovery works without a token');

  const reset = await controlRetry(clientSide.origin, clientSide.cookie, 'resetSettings');
  assert(reset.ok === true, `resetSettings failed: ${reset.error?.code}`);
  const resetStatus = await waitForStatus(
    clientSide.origin,
    clientSide.cookie,
    (value) => value.config.role === 'client' && value.host.listening === false,
    20000,
    'bundle-default settings after reset',
  );
  assert(resetStatus.config.role === 'client', `reset left role=${resetStatus.config.role}`);
  log('settings reset removed the profile override and stopped the Host bridge');

  // The control channel must reject a request without the official browser cookie.
  const unauth = await fetch(`${clientSide.origin}/private-remote/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'e2e-unauth', method: 'status', payload: {} }),
  });
  assert(unauth.status === 401, `unauthenticated control request returned HTTP ${unauth.status}`);
  log('control channel rejects an unauthenticated browser');

  const test = await control(clientSide.origin, clientSide.cookie, 'test', { url: REMOTE_URL });
  assert(test.ok === true, `test connection failed: ${test.error?.code}`);
  log(`paired with ${test.value.host.deviceName} (${test.value.host.platform}, ${test.value.host.harnessVersion || 'version unknown'})`);

  const connect = await control(clientSide.origin, clientSide.cookie, 'connect', { url: REMOTE_URL });
  assert(connect.ok === true, `connect failed: ${connect.error?.code}`);
  const remoteStatus = await control(clientSide.origin, clientSide.cookie, 'status');
  assert(remoteStatus.value.mode === 'remote', `expected remote mode, got ${remoteStatus.value.mode}`);
  assert(remoteStatus.value.remote.connected === true, 'remote not connected');
  log('remote mode active in the local Host switch');

  // Settings writes reload the plugin, so they must be refused while a remote
  // connection is active; otherwise the official UI could keep showing remote
  // sessions after the switch was silently uninstalled.
  const blockedSave = await controlRetry(clientSide.origin, clientSide.cookie, 'saveSettings', {
    role: 'both',
    port: CLIENT_HOST_PORT,
  });
  assert(blockedSave.ok === false, 'settings were written while a remote connection was active');
  assert(blockedSave.error.code === 'host/remote-active', `active remote save produced ${blockedSave.error.code}`);
  const stillRemote = await control(clientSide.origin, clientSide.cookie, 'status');
  assert(stillRemote.ok === true && stillRemote.value.remote.active === true, 'blocked settings write changed the remote mode');
  log('settings write blocked while remote is active; remote mode unchanged');

  // Boot-time reads: the Desktop locale bootstrap and the settings forms POST
  // settings/describe before the first screen; the owner baseline follows
  // remoteAccess/follow at boot. Both must be allowed through the bridge.
  const remoteSettings = await api(clientSide.origin, clientSide.cookie, 'settings/describe', { args: {} });
  assert(remoteSettings.ok === true, `settings/describe through the switch failed: ${remoteSettings.error?.code}`);
  const namespaces = remoteSettings.value?.namespaces;
  assert(Array.isArray(namespaces), 'settings/describe result lacks namespaces for the Desktop locale bootstrap');
  assert(
    namespaces.some((namespace) => namespace?.ns === 'locale' || namespace?.id === 'locale'),
    'settings/describe result lacks the locale namespace',
  );
  log('remote settings/describe forwarded for the Desktop locale/bootstrap');

  const accessStream = await openMux(clientSide, 'remoteAccess/follow', { args: {} }, 10000);
  const accessBaseline = await accessStream.waitFor(
    (frame) => frame.type === 'item',
    15000,
    'remoteAccess/follow baseline',
  );
  assert(
    accessBaseline.value?.type === 'baseline' || accessBaseline.value?.owner === true,
    `unexpected remoteAccess/follow frame: ${JSON.stringify(accessBaseline).slice(0, 160)}`,
  );
  await accessStream.close();
  log('remoteAccess/follow owner baseline through local mux');

  // Permission boundary: a non-allowlisted endpoint must fail at the bridge
  // instead of reaching the remote Gateway.
  const denied = await api(clientSide.origin, clientSide.cookie, 'commands/execute', { args: {} });
  assert(denied.ok === false, 'a non-allowlisted endpoint was forwarded');
  assert(denied.error.code === 'remote/endpoint-denied', `expected remote/endpoint-denied, got ${denied.error.code}`);
  log('non-allowlisted endpoint denied through the switch');

  // Workspace surface: the official sidebar follows the remote workspace
  // registry over /api/remote.mux, so a selected remote workspace comes from
  // the paired Host rather than this client's local registry.
  const workspaceStream = await openMux(clientSide, 'workspace/follow', { args: {} }, 10000);
  const workspaceBaseline = await workspaceStream.waitFor(
    (frame) => frame.type === 'item' && Array.isArray(frame.value?.value?.items),
    15000,
    'workspace/follow baseline',
  );
  const workspaceItems = workspaceBaseline.value.value.items;
  assert(workspaceItems.some((item) => typeof item.path === 'string' && item.path !== ''), 'workspace/follow baseline lists no remote workspace');
  log(`remote workspace baseline through local mux: ${workspaceItems.length} workspace(s)`);
  await workspaceStream.close();

  const { items } = await sessionSnapshot(clientSide);
  assert(items.some((entry) => String(entry.sessionId ?? entry.id) === SESSION_ID), 'the remote session was not visible through the local client switch');
  log(`remote session list through local /api: ${items.length} entries; target found`);

  const history = await sessionEvents(clientSide, (await sessionSnapshot(clientSide)).item.projections.asOfSeq);
  assert(history.length > 0, 'session/page result lacks records');
  log(`remote session page through local /api: ${history.length} records`);

  // New session: the official UI creates sessions through the switched /api.
  // Create one in the same remote directory and run the live prompt checks in
  // it, so the earlier history and model context cannot leak into these turns.
  const source = items.find((entry) => String(entry.sessionId ?? entry.id) === SESSION_ID);
  assert(typeof source?.cwd === 'string' && source.cwd !== '', 'the target session has no cwd');
  await createSession(clientSide, source.cwd);

  // Streams: the official UI opens $events for approvals/questions and
  // session/follow for live transcripts, both over /api/remote.mux.
  const eventsStream = await openMux(clientSide, '$events', { args: {} }, 10000);
  const ready = await eventsStream.waitFor(
    (frame) => frame.type === 'item' && frame.value?.type === 'ready',
    10000,
    '$events ready frame',
  );
  assert(ready !== undefined, '$events stream did not become ready');
  assert(typeof ready.value.clientId === 'string' && ready.value.clientId !== '', '$events ready frame lacks a clientId');
  const eventsClientId = ready.value.clientId;
  log('$events stream through local mux forwarded to the remote Host');

  const follow = await openMux(clientSide, 'session/follow', {
    args: { request: { address: { kind: 'session', sessionId: SESSION_ID }, assistantStream: true } },
  }, 10000);
  await follow.waitFor((frame) => frame.type === 'item', 15000, 'session/follow opening snapshot');
  log('session/follow stream through local mux forwarded to the remote Host');

  // Live prompt: send through the switched /api, watch assistant-stream frames
  // arrive on the follow stream, then read the committed assistant message.
  const marker = `REMOTE-OK-${Math.random().toString(16).slice(2, 8)}`;
  const beforeSnap = await sessionSnapshot(clientSide);
  const promptRequestId = `e2e-prompt-${marker}`;
  const prompt = await api(clientSide.origin, clientSide.cookie, 'session/prompt', {
    args: {
      request: {
        requestId: promptRequestId,
        sessionId: SESSION_ID,
        mode: 'queue',
        content: [{ type: 'text', text: `Reply with exactly this token and nothing else: ${marker}` }],
        clientTimeZone: 'Asia/Shanghai',
      },
    },
  });
  assert(prompt.ok === true, `session/prompt failed: ${prompt.error?.code}`);
  const endFrame = await follow.waitFor(
    (frame) => frame.type === 'item' && frame.value?.type === 'event' && frame.value.event?.type === 'turn/end',
    180000,
    'remote turn/end frame on the follow stream',
  );
  assert(endFrame.value.event.data.reason?.kind === 'completed', `remote turn ended with ${JSON.stringify(endFrame.value.event.data.reason)}`);
  log('prompt accepted; assistant streaming frames delivered through the switched mux');

  const afterSnap = await waitForSeq(clientSide, endFrame.value.event.seq, 30000);
  assert(afterSnap.item.projections.asOfSeq > beforeSnap.item.projections.asOfSeq, 'remote session cursor did not advance');
  const events = await sessionEvents(clientSide, afterSnap.item.projections.asOfSeq);
  const reply = events.filter((event) => event.type === 'assistant/message').at(-1);
  const replyText = assistantText(reply);
  assert(replyText.includes(marker), `remote assistant reply missing marker: ${JSON.stringify(replyText).slice(0, 120)}`);
  log(`remote assistant reply through local /api: ${JSON.stringify(replyText.slice(0, 40))}`);

  // Cancel: start a long generation, wait for its first stream frame, then stop
  // it through the switch. Only frames after `cancelMark` belong to this turn.
  const cancelMark = follow.mark();
  const cancelPrompt = await api(clientSide.origin, clientSide.cookie, 'session/prompt', {
    args: {
      request: {
        requestId: `e2e-cancel-${marker}`,
        sessionId: SESSION_ID,
        mode: 'queue',
        content: [{ type: 'text', text: 'Write the numbers 1 through 800, one number per line, and nothing else.' }],
        clientTimeZone: 'Asia/Shanghai',
      },
    },
  });
  assert(cancelPrompt.ok === true, `cancel-test prompt failed: ${cancelPrompt.error?.code}`);
  const sawStream = await follow.waitForAfter(
    cancelMark,
    (frame) => frame.type === 'item' && frame.value?.type === 'assistant-stream',
    120000,
    'assistant stream frame before cancel',
  ).catch(() => undefined);
  assert(sawStream !== undefined, 'the remote turn never produced an assistant stream frame');
  const cancel = await api(clientSide.origin, clientSide.cookie, 'session/cancel', {
    args: { request: { sessionId: SESSION_ID } },
  });
  assert(cancel.ok === true, `session/cancel failed: ${cancel.error?.code}`);
  const cancelEnd = await follow.waitForAfter(
    cancelMark,
    (frame) => frame.type === 'item' && frame.value?.type === 'event' && frame.value.event?.type === 'turn/end',
    120000,
    'turn/end frame after cancel',
  );
  const reason = cancelEnd.value.event.data.reason?.kind;
  assert(reason === 'aborted' || reason === 'cancelled' || reason === 'canceled', `expected an aborted turn after cancel, got ${JSON.stringify(cancelEnd.value.event.data.reason)}`);
  await waitForTurnEnd(clientSide, 30000);
  log(`remote cancel confirmed by the Host: turn ended as ${reason}; task stopped, not misreported`);

  await follow.close();

  // Approval: run in a fresh session so no earlier prompt leaks into this
  // turn. The forwarded approval/request must reach this client over $events,
  // and the answer must travel back through $events/result.
  await createSession(clientSide, source.cwd);
  const approvalBaseSeq = (await sessionSnapshot(clientSide)).item.projections.asOfSeq;
  const approvalEventsMark = eventsStream.mark();
  const approvalPrompt = await api(clientSide.origin, clientSide.cookie, 'session/prompt', {
    args: {
      request: {
        requestId: `e2e-approval-${marker}`,
        sessionId: SESSION_ID,
        mode: 'queue',
        content: [{ type: 'text', text: `Call the ${SHELL_TOOL} tool exactly once with these exact arguments: command = ${JSON.stringify(SHELL_COMMAND)}, description = "Create approval test dir", sandbox_permissions = "danger-full-access", justification = "E2E test must verify the approval round-trip." Then reply with exactly DONE and nothing else.` }],
        clientTimeZone: 'Asia/Shanghai',
      },
    },
  });
  assert(approvalPrompt.ok === true, `approval-test prompt failed: ${approvalPrompt.error?.code}`);
  const approval = await eventsStream.waitForAfter(
    approvalEventsMark,
    (frame) => frame.type === 'item' && frame.value?.type === 'waterfall' && frame.value.event === 'approval/request',
    120000,
    'forwarded approval/request frame',
  );
  const eventId = approval.value.eventId;
  assert(typeof eventId === 'string' && eventId !== '', 'approval/request frame lacks an eventId');
  assert(approval.value.request?.toolName === SHELL_TOOL, `approval/request names ${approval.value.request?.toolName ?? 'nothing'} rather than ${SHELL_TOOL}`);
  log(`remote approval/request delivered through the switched mux (${approval.value.request.toolName})`);
  const answered = await api(clientSide.origin, clientSide.cookie, '$events/result', {
    args: {
      clientId: eventsClientId,
      eventId,
      outcome: { kind: 'result', value: 'allowed-once' },
    },
  });
  assert(answered.ok === true, `$events/result failed: ${answered.error?.code}`);
  const approvalTurn = await waitForTurnEnd(clientSide, 180000, approvalBaseSeq);
  assert(approvalTurn.end.data.reason?.kind === 'completed', `turn after approval ended with ${JSON.stringify(approvalTurn.end.data.reason)}`);
  const approvalEvents = approvalTurn.events;
  const decided = approvalEvents.filter((event) => event.type === 'approval/decided').at(-1);
  assert(decided !== undefined, 'session log has no approval/decided record');
  const decidedResult = JSON.stringify(decided.data);
  assert(/allowed-once/.test(decidedResult), `approval/decided does not record allowed-once: ${decidedResult.slice(0, 160)}`);
  const asked = approvalEvents.filter((event) => event.type === 'approval/asked').at(-1);
  assert(asked !== undefined, 'session log has no approval/asked record');
  assert(JSON.stringify(asked.data).includes(String(approval.value.request?.callId ?? '')) || String(approval.value.request?.callId ?? '') === '', 'approval/asked does not reference the forwarded call');
  const approvalToolResult = approvalEvents.filter((event) => event.type === 'tool/result').at(-1);
  assert(approvalToolResult !== undefined, 'approved tool call produced no tool/result record');
  assert(approvalToolResult.data?.message?.isError !== true, 'approved tool call ended with an error');
  log('approval answered through the switch; the Host executed the approved tool call');

  // Question: a blocking ask_user_question call becomes a forwarded
  // user-questions/request waterfall in another fresh session. The official UI
  // answers that waterfall through $events/result; the answer must reach the
  // same Host tool call.
  await createSession(clientSide, source.cwd);
  const questionBaseSeq = (await sessionSnapshot(clientSide)).item.projections.asOfSeq;
  const questionEventsMark = eventsStream.mark();
  const questionPrompt = await api(clientSide.origin, clientSide.cookie, 'session/prompt', {
    args: {
      request: {
        requestId: `e2e-question-${marker}`,
        sessionId: SESSION_ID,
        mode: 'queue',
        content: [{ type: 'text', text: 'Call the ask_user_question tool exactly once with one question: id "q1", header "E2E", question "Reply OK", options [{label:"OK"}]. Do not answer it yourself; wait for my answer. Then reply with exactly DONE and nothing else.' }],
        clientTimeZone: 'Asia/Shanghai',
      },
    },
  });
  assert(questionPrompt.ok === true, `question-test prompt failed: ${questionPrompt.error?.code}`);
  const question = await eventsStream.waitForAfter(
    questionEventsMark,
    (frame) => frame.type === 'item' && frame.value?.type === 'waterfall' && frame.value.event === 'user-questions/request',
    120000,
    'forwarded user-questions/request frame',
  );
  const questionId = question.value.request?.questions?.[0]?.id;
  assert(typeof questionId === 'string' && questionId !== '', 'question frame lacks a question id');
  const questionEventId = question.value.eventId;
  assert(typeof questionEventId === 'string' && questionEventId !== '', 'question frame lacks an eventId');
  log(`remote user-questions/request delivered through the switched mux (${questionId})`);
  const questionAnswer = await api(clientSide.origin, clientSide.cookie, '$events/result', {
    args: {
      clientId: eventsClientId,
      eventId: questionEventId,
      outcome: { kind: 'result', value: { answers: [{ id: questionId, selected: ['OK'] }] } },
    },
  });
  assert(questionAnswer.ok === true, `question $events/result failed: ${questionAnswer.error?.code}`);
  const questionTurn = await waitForTurnEnd(clientSide, 180000, questionBaseSeq);
  assert(questionTurn.end.data.reason?.kind === 'completed', `question turn ended with ${JSON.stringify(questionTurn.end.data.reason)}`);
  const questionEvents = questionTurn.events;
  const questionCall = questionEvents.filter((event) => event.type === 'tool/call' && event.data?.name === 'ask_user_question').at(-1);
  assert(questionCall !== undefined, 'the Host log has no ask_user_question tool call');
  const questionResult = questionEvents.find((event) => event.type === 'tool/result' && (event.data?.message?.toolCallId === questionCall.data.callId || event.data?.toolCallId === questionCall.data.callId));
  assert(questionResult !== undefined, 'the Host log has no result for the ask_user_question call');
  const questionResultText = JSON.stringify(questionResult.data);
  assert(questionResultText.includes(questionId) && questionResultText.includes('OK'), `the question result does not carry the forwarded answer: ${questionResultText.slice(0, 160)}`);
  log('blocking question answered through $events/result; the Host tool call received the reply');

  await eventsStream.close();

  const disconnected = await control(clientSide.origin, clientSide.cookie, 'disconnect');
  assert(disconnected.ok === true, 'disconnect failed');
  assert(disconnected.value.mode === 'local', `expected local after disconnect, got ${disconnected.value.mode}`);
  assert(disconnected.value.remote.installed === false, 'disconnect left the Gateway switch installed');
  assert(disconnected.value.clientConfig.url === REMOTE_URL, 'disconnect should keep the saved URL for a later reconnect');
  const localAfterDisconnect = await api(clientSide.origin, clientSide.cookie, 'session/list', { args: { _request: {} } });
  assert(localAfterDisconnect.ok === true, `local session/list failed after disconnect: ${localAfterDisconnect.error?.code}`);
  log('explicit disconnect returns to local mode, keeps the saved URL and restores local /api');

  const local = await control(clientSide.origin, clientSide.cookie, 'useLocal');
  assert(local.ok === true, 'useLocal failed');
  assert(local.value.mode === 'local', `expected local after useLocal, got ${local.value.mode}`);
  assert(local.value.clientConfig.url === '', 'useLocal should clear the saved pairing');
  const localList = await api(clientSide.origin, clientSide.cookie, 'session/list', { args: { _request: {} } });
  assert(localList.ok === true, `local session/list failed after useLocal: ${localList.error?.code}`);
  log(`explicit local mode restored local /api (${(localList.value.items ?? localList.value.sessions ?? []).length} local sessions)`);

  console.log('PASS local two-instance integration (token and cookie redacted)');
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
