import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInProgress } from '../src/client/inprogress.js';
import { store } from '../src/client/state.js';
import type { GhIssue } from '../src/shared/protocol.js';

const issue = (over: Partial<GhIssue> = {}): GhIssue => ({ number: 7, title: 'x', state: 'OPEN', assignees: [], labels: [], ...over }) as GhIssue;

test('an open issue nobody is on stays on the wall', () => {
  assert.equal(isInProgress(issue()), false);
});

test('assigned, labelled in progress, or a running queued task: off the wall', () => {
  assert.equal(isInProgress(issue({ assignees: [{ login: 'flrnoh' }] as GhIssue['assignees'] })), true);
  for (const name of ['in progress', 'Doing', 'WIP', 'started']) {
    assert.equal(isInProgress(issue({ labels: [{ name, color: 'fff' }] as GhIssue['labels'] })), true, name);
  }
  const before = store.taskForIssue;
  store.taskForIssue = (n: number) => (n === 7 ? ({ status: 'running' } as ReturnType<typeof before>) : undefined);
  try {
    assert.equal(isInProgress(issue()), true);
    assert.equal(isInProgress(issue({ number: 8 })), false);
  } finally {
    store.taskForIssue = before;
  }
});
