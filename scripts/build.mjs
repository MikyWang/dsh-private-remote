/**
 * Build the installable bundle from src/. No third-party runtime dependencies.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PLUGIN_VERSION, PROTOCOL_VERSION, SUPPORTED_HARNESS } from '../src/shared/protocol.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = path.join(root, 'src');
const bundle = path.join(root, 'bundle');

async function copyTree(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function walk(dir, base = dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full, base));
    else if (entry.isFile()) result.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return result;
}

async function sha256(file) {
  const data = await fs.readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

const packageJson = {
  name: 'dsh-private-remote',
  version: PLUGIN_VERSION,
  private: true,
  type: 'module',
  description: 'Private Remote for DeepSeek Harness: pair an official Desktop client with a Harness Host and continue its workspaces and sessions in the official session UI.',
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/MikyWang/dsh-private-remote.git' },
  homepage: 'https://github.com/MikyWang/dsh-private-remote',
  bugs: { url: 'https://github.com/MikyWang/dsh-private-remote/issues' },
  exports: {
    '.': './index.js',
    './client': './client.js',
    './locale/*.json': './locale/*.json',
    './icon': './icon.svg',
  },
  files: [
    'index.js',
    'client.js',
    'host/',
    'shared/',
    'cordis.patch.yml',
    'locale/',
    'icon.svg',
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'BUILD-INFO.json',
  ],
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      platform: 'web',
      immediately: true,
      inject: ['@deepseek-ai/dsh-client-ui-conversation'],
    },
  },
  engines: {
    dsh: SUPPORTED_HARNESS,
  },
};

await fs.rm(bundle, { recursive: true, force: true });
await fs.mkdir(bundle, { recursive: true });
await fs.copyFile(path.join(sources, 'host.js'), path.join(bundle, 'index.js'));
await fs.copyFile(path.join(sources, 'client.js'), path.join(bundle, 'client.js'));
await fs.copyFile(path.join(sources, 'cordis.patch.yml'), path.join(bundle, 'cordis.patch.yml'));
await fs.copyFile(path.join(sources, 'icon.svg'), path.join(bundle, 'icon.svg'));
await copyTree(path.join(sources, 'host'), path.join(bundle, 'host'));
await copyTree(path.join(sources, 'shared'), path.join(bundle, 'shared'));
await copyTree(path.join(sources, 'locale'), path.join(bundle, 'locale'));
for (const optional of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  try {
    await fs.copyFile(path.join(root, optional), path.join(bundle, optional));
  } catch {
    // Documentation can be added before the final build; the runtime does not need it.
  }
}
await fs.writeFile(path.join(bundle, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

const files = await walk(bundle);
const hashes = {};
for (const file of files.sort()) {
  hashes[file] = await sha256(path.join(bundle, file));
}
const buildInfo = {
  package: 'dsh-private-remote',
  version: PLUGIN_VERSION,
  protocol: PROTOCOL_VERSION,
  supportedHarness: SUPPORTED_HARNESS,
  builtAt: new Date().toISOString(),
  builtWithNode: process.version,
  files: hashes,
};
await fs.writeFile(path.join(bundle, 'BUILD-INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');

console.log(`built bundle/ (${files.length} files, ${PLUGIN_VERSION}, protocol ${PROTOCOL_VERSION})`);
