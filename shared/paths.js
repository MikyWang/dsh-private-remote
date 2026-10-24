/**
 * Remote-path helpers.
 *
 * Paths in the official session data belong to the Host. A Windows Host must
 * have its paths interpreted with Windows separators and case folding even
 * when the client runs on macOS. Never feed a remote path to node:path.
 */

/** Normalize a remote path for comparison without touching the local filesystem. */
export function normalizeRemotePath(value, platform = process.platform) {
  if (typeof value !== 'string') return '';
  let normalized = value.trim().replace(/\\/g, '/');
  if (normalized === '') return '';
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/g, '');
  // Preserve a Windows drive root such as C:/.
  if (normalized.length === 2 && normalized[1] === ':') normalized += '/';
  if (platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

/** True when `candidate` is the root or inside it, according to the Host platform. */
export function isPathInside(candidate, root, platform = process.platform) {
  const c = normalizeRemotePath(candidate, platform);
  const r = normalizeRemotePath(root, platform);
  if (c === '' || r === '') return false;
  if (c === r) return true;
  if (r === '/' || /^[a-z]:\/$/.test(r)) return c.startsWith(r);
  return c.startsWith(`${r}/`);
}

/** Last path segment of a remote path, without using node:path. */
export function remoteBasename(value, platform = process.platform) {
  const normalized = normalizeRemotePath(value, platform);
  if (normalized === '') return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

/** Pick the best workspace root containing a session cwd. */
export function findWorkspaceForPath(paths, cwd, platform = process.platform) {
  if (!Array.isArray(paths)) return null;
  let best = null;
  for (const workspace of paths) {
    if (workspace === null || typeof workspace !== 'object') continue;
    const root = workspace.path;
    if (!isPathInside(cwd, root, platform)) continue;
    if (best === null || normalizeRemotePath(root, platform).length > normalizeRemotePath(best.path, platform).length) {
      best = workspace;
    }
  }
  return best;
}
