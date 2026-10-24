import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findWorkspaceForPath,
  isPathInside,
  normalizeRemotePath,
  remoteBasename,
} from '../../src/shared/paths.js';

test('windows paths are case-folded and separator-normalized without the local path module', () => {
  assert.equal(normalizeRemotePath('C:\\Users\\Alice\\Project\\', 'win32'), 'c:/users/alice/project');
  assert.equal(normalizeRemotePath('C:\\', 'win32'), 'c:/');
  assert.equal(normalizeRemotePath('/Users/alice/project/', 'darwin'), '/Users/alice/project');
  assert.equal(remoteBasename('C:\\Users\\Alice\\Project', 'win32'), 'project');
  assert.equal(remoteBasename('/Users/alice/project/', 'darwin'), 'project');
});

test('path containment follows the remote platform', () => {
  assert.equal(isPathInside('C:\\Users\\Alice\\Project\\src', 'C:\\Users\\Alice\\Project', 'win32'), true);
  assert.equal(isPathInside('C:\\Users\\Alice\\Project2', 'C:\\Users\\Alice\\Project', 'win32'), false);
  assert.equal(isPathInside('/Users/alice/project/src', '/Users/alice/project', 'darwin'), true);
  assert.equal(isPathInside('/Users/alice/project2', '/Users/alice/project', 'darwin'), false);
  assert.equal(isPathInside('/Users/alice/project', '/', 'darwin'), true);
});

test('workspace matching picks the deepest containing workspace and respects platform', () => {
  const workspaces = [
    { workspaceId: 'a', path: 'C:\\Users\\Alice' },
    { workspaceId: 'b', path: 'C:\\Users\\Alice\\Project' },
    { workspaceId: 'c', path: 'D:\\Other' },
  ];
  assert.equal(findWorkspaceForPath(workspaces, 'C:\\Users\\Alice\\Project\\src\\index.ts', 'win32').workspaceId, 'b');
  assert.equal(findWorkspaceForPath(workspaces, 'c:\\users\\alice\\project', 'win32').workspaceId, 'b');
  assert.equal(findWorkspaceForPath(workspaces, '/users/alice/project', 'darwin'), null);
  assert.equal(findWorkspaceForPath([], '/x', 'darwin'), null);
});
