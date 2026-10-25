/**
 * Static checks that can run without the Harness runtime.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function walk(dir, predicate, base = dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'bundle'
      || entry.name === '.tmp' || entry.name === 'dist' || entry.name === 'test-output') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full, predicate, base));
    else if (entry.isFile() && predicate(full)) result.push(full);
  }
  return result;
}

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

const jsFiles = await walk(root, (file) => /\.(?:js|mjs)$/.test(file));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`syntax: ${path.relative(root, file)}\n${result.stderr}`);
  }
}
console.log(`checked syntax: ${jsFiles.length} JS files`);

const sourceFiles = await walk(path.join(root, 'src'), () => true);
const sourceText = new Map();
for (const file of sourceFiles) {
  if (!/\.(?:js|mjs|json|yml|yaml|md|svg)$/.test(file)) continue;
  sourceText.set(path.relative(root, file).split(path.sep).join('/'), await fs.readFile(file, 'utf8'));
}

for (const [name, text] of sourceText) {
  if (!name.endsWith('.js')) continue;
  if (name === 'src/client.js' && /\bimport\s+[\w{*]/.test(text)) {
    fail(`client.js must be a classic loader script, not an ESM import: ${name}`);
  }
  if (text.includes('dangerouslySetInnerHTML')) fail(`dangerouslySetInnerHTML is forbidden: ${name}`);
  if (/\blocalStorage\s*(?:\.|\[)/.test(text)) fail(`localStorage is forbidden: ${name}`);
  if (text.includes('/Applications/DeepSeek Harness.app') || text.includes('app.asar')) {
    fail(`official install path must not be referenced by plugin code: ${name}`);
  }
}

const forbiddenSecrets = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const [name, text] of sourceText) {
  if (!name.endsWith('.json') && !name.endsWith('.js') && !name.endsWith('.yml') && !name.endsWith('.md')) continue;
  for (const pattern of forbiddenSecrets) {
    if (pattern.test(text)) fail(`possible secret in ${name}: ${pattern}`);
  }
}

const protocol = sourceText.get('src/shared/protocol.js') ?? '';
const client = sourceText.get('src/client.js') ?? '';
check(protocol.includes("CONTROL_CHANNEL = '/private-remote'"), 'Host control channel constant missing');
check(client.includes("const CHANNEL = '/private-remote'"), 'Client control channel constant missing');
check(client.includes("const PANEL_ID = 'private-remote'"), 'Client panel id missing');
check(client.includes("settings.section"), 'Client settings section missing');
check(protocol.includes("PLUGIN_VERSION = '0.1.0'"), 'Plugin version missing');
check(protocol.includes("SUPPORTED_HARNESS = '0.2.1-rc.3'"), 'Supported Harness version missing');
check(protocol.includes("CONFIG_SAVE_FAILED: 'host/config-save-failed'"), 'Host config save error code missing');
check(protocol.includes("REMOTE_ACTIVE: 'host/remote-active'"), 'Host remote-active error code missing');

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
check(packageJson.type === 'module', 'root package must be ESM');
check(packageJson.dependencies === undefined && packageJson.devDependencies === undefined, 'runtime dependencies are forbidden');

const patch = await fs.readFile(path.join(root, 'src/cordis.patch.yml'), 'utf8');
check(patch.includes('id: private-remote'), 'patch id missing');
check(patch.includes('name: dsh-private-remote'), 'patch package name missing');
check(patch.includes('role: client'), 'patch default role missing');

for (const locale of ['zh', 'en']) {
  const file = path.join(root, 'src/locale', `${locale}.json`);
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    check(typeof parsed.title === 'string' && parsed.title !== '', `locale ${locale} title missing`);
    check(typeof parsed.description === 'string' && parsed.description !== '', `locale ${locale} description missing`);
  } catch (error) {
    fail(`locale ${locale} is not valid JSON: ${error.message}`);
  }
}

const hostEntry = sourceText.get('src/host.js') ?? '';
check(hostEntry.includes('export function apply'), 'Host entry lacks apply');
check(hostEntry.includes("export const inject = ['connection']"), 'Host entry inject missing');
check(client.includes('window.__ModuleLoader__.load'), 'Client entry must use the official ModuleLoader');

const docs = ['README.md', 'docs/ARCHITECTURE.md', 'docs/SECURITY.md', 'docs/PROTOCOL.md', 'docs/COMPATIBILITY.md', 'docs/TEST-REPORT.md'];
for (const doc of docs) {
  try {
    await fs.access(path.join(root, doc));
  } catch {
    // Documentation is checked separately; warn instead of failing code checks.
    console.warn(`warning: document not written yet: ${doc}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('static checks passed');
