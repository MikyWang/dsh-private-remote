import assert from 'node:assert/strict';
import test from 'node:test';
import { ALLOWED_ENDPOINT_NAMES, isAllowed, isDeniedNamespace } from '../../src/shared/allowlist.js';

test('official session, workspace and event endpoints are allowed in the right mode', () => {
  assert.equal(isAllowed('$events', 'stream'), true);
  assert.equal(isAllowed('$events', 'unary'), false);
  assert.equal(isAllowed('$events/result', 'unary'), true);
  assert.equal(isAllowed('$events/result', 'stream'), false);
  assert.equal(isAllowed('session/page', 'unary'), true);
  assert.equal(isAllowed('session/prompt', 'unary'), true);
  assert.equal(isAllowed('session/follow', 'stream'), true);
  assert.equal(isAllowed('session/control', 'stream'), true);
  assert.equal(isAllowed('workspace/follow', 'stream'), true);
  assert.equal(isAllowed('workspace/create', 'unary'), true);
  assert.equal(isAllowed('session/modelCatalog', 'unary'), true);
  assert.equal(isAllowed('session/selectModel', 'unary'), true);
  assert.equal(isAllowed('fileReferences/list', 'unary'), true);
  assert.equal(isAllowed('skills/list', 'unary'), true);
  assert.equal(isAllowed('directoryPicker/list', 'unary'), true);
  assert.equal(isAllowed('workspace/rename', 'unary'), true);
  assert.equal(isAllowed('workspace/delete', 'unary'), true);
  assert.equal(isAllowed('workspace/create', 'unary'), true);
  assert.equal(isAllowed('permissionPresets/catalog', 'unary'), true);
  assert.equal(isAllowed('agentPresets/list', 'unary'), true);
  assert.equal(isAllowed('commands/list', 'unary'), true);
  assert.equal(isAllowed('userQuestions/answer', 'unary'), true);
  assert.equal(isAllowed('userQuestions/attachWait', 'stream'), true);
  assert.equal(isAllowed('userQuestions/attachWait', 'unary'), false);
});

test('dangerous and unknown endpoints are denied', () => {
  const denied = [
    'credentials/resolve',
    'settings/read',
    'terminal/create',
    'workspaceFiles/read',
    'fileUploads/put',
    'plugins/install',
    'pluginManager/list',
    'inspector/services',
    'account/login',
    'llm/models',
    'subagents/prompt',
    'jobs/list',
    'schedules/create',
    'goals/create',
    'unknown/endpoint',
    '',
  ];
  for (const endpoint of denied) {
    assert.equal(isAllowed(endpoint, 'unary'), false, endpoint);
    assert.equal(isAllowed(endpoint, 'stream'), false, endpoint);
  }
});

test('denied namespace helper covers the documented families', () => {
  assert.equal(isDeniedNamespace('credentials/resolve'), true);
  assert.equal(isDeniedNamespace('terminal/create'), true);
  assert.equal(isDeniedNamespace('workspaceFiles/read'), true);
  assert.equal(isDeniedNamespace('session/page'), false);
});

test('allowlist has no accidental duplicates and is sorted', () => {
  assert.deepEqual(ALLOWED_ENDPOINT_NAMES, [...ALLOWED_ENDPOINT_NAMES].sort());
  assert.equal(new Set(ALLOWED_ENDPOINT_NAMES).size, ALLOWED_ENDPOINT_NAMES.length);
});
