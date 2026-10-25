/**
 * Local two-instance end-to-end runner.
 *
 * Boots one isolated Host profile and one isolated Client profile from this
 * checkout's bundle, seeds a remote workspace/session on the Host, then runs
 * test/e2e/local-two-instance.mjs. Everything runs on loopback: the Host's
 * bridge binds 127.0.0.1:47821 and both Harness web apps bind their own ports.
 *
 * Usage:
 *   node scripts/e2e-local.mjs
 *   DSH_CLI=/path/to/dsh DSH_E2E_HOST_HOME=... DSH_E2E_CLIENT_HOME=... node scripts/e2e-local.mjs
 *
 * The runner never prints a launch token, pairing token or browser cookie.
 * It requires a running local Ollama daemon and the model named in
 * test/e2e/host-patch.yml. Set DSH_E2E_KEEP=1 to leave the isolated homes.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = process.env.DSH_CLI ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
const HOST_HOME = path.resolve(process.env.DSH_E2E_HOST_HOME ?? path.join(root, '.tmp', 'e2e-home'));
const CLIENT_HOME = path.resolve(process.env.DSH_E2E_CLIENT_HOME ?? path.join(root, '.tmp', 'e2e-client-home'));
const HOST_PORT = Number(process.env.DSH_E2E_HOST_PORT ?? 18080);
const CLIENT_PORT = Number(process.env.DSH_E2E_CLIENT_PORT ?? 18081);
const REMOTE_PORT = Number(process.env.DSH_E2E_REMOTE_PORT ?? 18082);
const BUNDLE = path.join(root, 'bundle');
const HOST_PATCH = path.join(root, 'test', 'e2e', 'host-patch.yml');
const CLIENT_PATCH = path.join(root, 'test', 'e2e', 'client-patch.yml');
const DEMO = path.join(HOST_HOME, 'workspaces', 'demo');
const KEEP = process.env.DSH_E2E_KEEP === '1';
const children = new Set();
let stopping = false;

function log(message) {
  console.log(`- ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function redact(text) {
  return String(text).replace(/token=[A-Za-z0-9_-]+/g, 'token=<redacted>');
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function spawnProcess(args, env, label) {
  const invocation = resolveCli(args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: root,
    env: { ...process.env, ...invocation.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(child);
  child.stderr.setEncoding('utf8');
  child.stderrTail = '';
  child.stderr.on('data', (chunk) => {
    const text = redact(chunk);
    child.stderrTail = `${child.stderrTail}${text}`.slice(-4000);
    const trimmed = text.trim();
    if (trimmed !== '' && trimmed.includes('[private-remote]')) console.error(`  ${label}: ${trimmed}`);
  });
  return child;
}

/**
 * Resolve the Desktop's `dsh.cmd` to the Electron executable it wraps.
 * Spawning the `.cmd` through cmd.exe on Windows loses argument quoting and
 * leaves a shell in the process tree; the underlying executable accepts the
 * same CLI entry point with ELECTRON_RUN_AS_NODE=1.
 */
function resolveCli(args) {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(CLI)) {
    return { command: CLI, args, env: {} };
  }
  const binDir = path.dirname(CLI);
  const resources = path.resolve(binDir, '..', '..', '..');
  const appRoot = path.resolve(resources, '..');
  const executable = path.join(appRoot, 'DeepSeek Harness.exe');
  const asar = path.join(resources, 'app.asar');
  const cliJs = path.join(asar, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
  // Plain Node cannot stat a path inside app.asar; the Electron-backed
  // executable can. Validate the real files around the archive only.
  if (!fsSync.existsSync(executable) || !fsSync.existsSync(asar)) {
    throw new Error(`Cannot resolve the Desktop CLI behind ${CLI}; set DSH_CLI to the bundled runtime\\cli\\bin\\dsh.cmd`);
  }
  return {
    command: executable,
    args: ['--expose-internals', cliJs, ...args],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

function waitForLaunch(child, label, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} did not print a launch URL within ${timeoutMs} ms`));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk;
      const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(buffer);
      if (match === null) return;
      cleanup();
      resolve(match[1]);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`${label} exited before listening (code ${String(code)})`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', onData);
    child.on('exit', onExit);
  });
}

async function profileReady(home) {
  try {
    const profile = path.join(home, 'profiles', 'web');
    const pkg = JSON.parse(await fs.readFile(path.join(profile, 'package.json'), 'utf8'));
    const bundles = pkg?.dsh?.profile?.bundles ?? [];
    const linked = pkg?.dependencies?.['dsh-private-remote'];
    if (typeof linked !== 'string' || !bundles.includes('dsh-private-remote')) return false;
    return await exists(path.join(profile, 'node_modules', 'dsh-private-remote', 'package.json'));
  } catch {
    return false;
  }
}

async function initProfile(home, label) {
  const profile = path.join(home, 'profiles', 'web');
  if (await profileReady(home)) {
    log(`${label}: reusing the installed profile`);
    return;
  }
  await fs.mkdir(home, { recursive: true });
  // `dsh plugin add` initializes a missing profile from the shipped template
  // and links this checkout's bundle. Existing profiles are reused above so a
  // profile installed with a different pnpm store is never rewritten.
  const child = spawnProcess(['plugin', '--profile', 'web', 'add', BUNDLE], { DSH_HOME: home }, label);
  const code = await new Promise((resolve) => child.on('exit', resolve));
  children.delete(child);
  if (code !== 0) fail(`${label}: dsh plugin add exited with ${String(code)}\n${child.stderrTail.trim()}`);
}

async function startHost() {
  const child = spawnProcess([
    '--profile', 'web',
    '--patch', HOST_PATCH,
    '--no-open',
    '--port', String(HOST_PORT),
  ], {
    DSH_HOME: HOST_HOME,
    E2E_OLLAMA_KEY: 'local-ollama-dummy',
    DSH_E2E_REMOTE_PORT: String(REMOTE_PORT),
  }, 'host');
  const url = await waitForLaunch(child, 'host');
  return { child, url };
}

async function startClient() {
  const child = spawnProcess([
    '--profile', 'web',
    '--patch', CLIENT_PATCH,
    '--no-open',
    '--port', String(CLIENT_PORT),
  ], { DSH_HOME: CLIENT_HOME }, 'client');
  const url = await waitForLaunch(child, 'client');
  return { child, url };
}

async function browserSide(launchUrl) {
  const res = await fetch(launchUrl, { redirect: 'manual' });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((value) => value.split(';', 1)[0]).join('; ');
  if (cookie === '') fail('the launch URL did not set an auth cookie');
  return { origin: new URL(launchUrl).origin, cookie };
}

async function api(side, method, payload) {
  const rpcId = `seed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await fetch(`${side.origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: side.cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  });
  const body = await res.json();
  return body.result;
}

/** Make sure the isolated Host has one ordinary Session with history. */
async function seedSession(hostUrl) {
  const side = await browserSide(hostUrl);
  const listed = await api(side, 'session/list', { args: { _request: {} } });
  if (listed.ok !== true) fail(`seed: session/list failed: ${listed.error?.code}`);
  const existing = listed.value.items.find((item) => typeof item.cwd === 'string' && item.cwd !== '' && item.blank === false && item.running === false);
  if (existing !== undefined) {
    log(`seed: reusing Host session ${existing.sessionId}`);
    return existing.sessionId;
  }
  await fs.mkdir(DEMO, { recursive: true });
  const workspace = await api(side, 'workspace/create', { args: { request: { path: DEMO } } });
  if (workspace.ok !== true) fail(`seed: workspace/create failed: ${workspace.error?.code}`);
  const workspaceId = workspace.value.workspace.workspaceId;
  const created = await api(side, 'session/create', { args: { request: { workspaceId } } });
  if (created.ok !== true) fail(`seed: session/create failed: ${created.error?.code}`);
  const sessionId = created.value.sessionId;
  const prompt = await api(side, 'session/prompt', {
    args: {
      request: {
        requestId: `seed-${Date.now()}`,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: 'Reply with exactly SEED and nothing else.' }],
        clientTimeZone: 'Asia/Shanghai',
      },
    },
  });
  if (prompt.ok !== true) fail(`seed: session/prompt failed: ${prompt.error?.code}`);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const current = await api(side, 'session/list', { args: { _request: {} } });
    const item = current.value.items.find((entry) => entry.sessionId === sessionId);
    if (item !== undefined && item.running === false && item.blank === false) {
      log(`seed: created Host session ${sessionId}`);
      return sessionId;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  fail('seed: the isolated Host never finished its seed turn');
}

async function runTest(hostUrl, clientUrl, sessionId) {
  const env = {
    ...process.env,
    DSH_HOST_URL: hostUrl,
    DSH_CLIENT_URL: clientUrl,
    DSH_REMOTE_URL: `http://127.0.0.1:${REMOTE_PORT}`,
    DSH_E2E_SESSION_ID: sessionId,
    DSH_E2E_CWD: DEMO,
  };
  const child = spawn(process.execPath, [path.join(root, 'test', 'e2e', 'local-two-instance.mjs')], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}

async function stopChild(child) {
  if (child === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // The cmd.exe wrapper may exit before the Electron-backed child it started.
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return;
  }
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function cleanup(host, client) {
  if (stopping) return;
  stopping = true;
  await stopChild(client?.child);
  await stopChild(host?.child);
  for (const child of children) await stopChild(child);
  if (!KEEP) {
    // Keep profiles and sessions for a fast next run; only drop transient output.
    await fs.rm(path.join(root, '.tmp', 'e2e-run.log'), { force: true });
  }
}

async function main() {
  if (!(await exists(path.join(BUNDLE, 'package.json')))) fail('bundle/ is missing; run node scripts/build.mjs first');
  if (!(await exists(CLI))) fail(`dsh CLI not found at ${CLI}; set DSH_CLI`);
  log(`preparing isolated profiles in ${HOST_HOME} and ${CLIENT_HOME}`);
  await initProfile(HOST_HOME, 'host');
  await initProfile(CLIENT_HOME, 'client');

  let host;
  let client;
  try {
    log(`starting isolated Host on 127.0.0.1:${HOST_PORT} (bridge ${REMOTE_PORT})`);
    host = await startHost();
    log(`starting isolated Client on 127.0.0.1:${CLIENT_PORT}`);
    client = await startClient();
    const sessionId = await seedSession(host.url);
    log('running local two-instance integration test');
    const code = await runTest(host.url, client.url, sessionId);
    if (code !== 0) process.exitCode = code;
  } finally {
    await cleanup(host, client);
  }
}

process.on('SIGINT', () => {
  void cleanup().then(() => process.exit(130));
});
process.on('SIGTERM', () => {
  void cleanup().then(() => process.exit(143));
});

main().catch(async (error) => {
  console.error(`FAIL ${redact(error.message)}`);
  await cleanup();
  process.exit(1);
});
