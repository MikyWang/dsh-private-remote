/**
 * Verify the generated bundle without installing it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'bundle');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  await fs.access(bundle);
} catch {
  console.error('bundle/ does not exist; run node scripts/build.mjs first');
  process.exit(1);
}

const packageJson = JSON.parse(await fs.readFile(path.join(bundle, 'package.json'), 'utf8'));
check(packageJson.name === 'dsh-private-remote', 'bundle name must be dsh-private-remote');
check(packageJson.type === 'module', 'bundle must be ESM');
check(packageJson.private === true, 'bundle must stay private');
check(packageJson.dsh?.bundle?.patch === './cordis.patch.yml', 'bundle patch metadata missing');
check(packageJson.dsh?.client?.platform === 'web', 'client platform missing');
check(packageJson.dsh?.client?.immediately === true, 'client immediately flag missing');
check(packageJson.exports?.['./client'] === './client.js', 'client export missing');
check(packageJson.exports?.['./icon'] === './icon.svg', 'icon export missing');
check(typeof packageJson.engines?.dsh === 'string' && packageJson.engines.dsh.length > 0, 'engines.dsh missing');
check(!packageJson.dependencies && !packageJson.devDependencies, 'bundle must have no runtime dependencies');

for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/zh.json', 'locale/en.json', 'host/controller.js', 'host/bridge-server.js', 'host/bridge-client.js', 'shared/secure-channel.js']) {
  try {
    await fs.access(path.join(bundle, file));
  } catch {
    failures.push(`missing bundle file: ${file}`);
  }
}

try {
  await fs.access(path.join(bundle, 'node_modules'));
  failures.push('bundle must not contain node_modules');
} catch {
  // expected
}

const clientCheck = spawnSync(process.execPath, ['--check', path.join(bundle, 'client.js')], { encoding: 'utf8' });
check(clientCheck.status === 0, `client.js syntax: ${clientCheck.stderr}`);

try {
  const entry = await import(`${pathToFileURL(path.join(bundle, 'index.js')).href}?verify=${Date.now()}`);
  check(typeof entry.apply === 'function', 'bundle index.js must export apply');
  check(Array.isArray(entry.inject) && entry.inject.includes('connection'), 'bundle index.js must inject connection');
} catch (error) {
  failures.push(`bundle index.js import failed: ${error.message}`);
}

const buildInfo = JSON.parse(await fs.readFile(path.join(bundle, 'BUILD-INFO.json'), 'utf8'));
check(buildInfo.package === 'dsh-private-remote', 'BUILD-INFO package missing');
check(typeof buildInfo.files === 'object' && buildInfo.files !== null, 'BUILD-INFO file hashes missing');

const text = await fs.readFile(path.join(bundle, 'client.js'), 'utf8');
check(text.includes('window.__ModuleLoader__.load'), 'client.js must use the official ModuleLoader');
check(!/\blocalStorage\s*(?:\.|\[)/.test(text), 'client.js must not access localStorage');
check(!text.includes('dangerouslySetInnerHTML'), 'client.js must not use dangerouslySetInnerHTML');

const source = await fs.readFile(path.join(bundle, 'shared/protocol.js'), 'utf8');
const forbidden = [/\bsk-[A-Za-z0-9_-]{16,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for (const pattern of forbidden) {
  if (pattern.test(source) || pattern.test(text)) failures.push(`possible secret in bundle: ${pattern}`);
}

if (failures.length > 0) {
  console.error(`${failures.length} bundle check(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`bundle verified: ${packageJson.name}@${packageJson.version}, ${Object.keys(buildInfo.files).length} hashed files`);
