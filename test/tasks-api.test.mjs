import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

let root;
let review;
let base;

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function createComment(comment) {
  return json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment,
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
    }),
  });
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-tasks-api-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Hello</h1>\n', 'utf8');
  review = await createReviewServer({ root, watch: false });
  const listening = await review.listen(0, '127.0.0.1');
  base = listening.url;
});

after(async () => {
  await review.close();
  await rm(root, { recursive: true, force: true });
});

test('exposes tasks through the review API', async () => {
  const created = await createComment('Поправь заголовок');
  assert.equal(created.response.status, 201);
  assert.equal(created.body.task.number, 1);
  assert.equal(created.body.task.status, 'active');
  assert.equal(created.body.task.description, 'Поправь заголовок');

  const state = await json('/__review/state');
  assert.equal(state.body.version, 2);
  assert.equal(state.body.tasks.length, 1);
  assert.equal(state.body.activeTaskId, state.body.tasks[0].id);

  const updated = await json(`/__review/tasks/T-1`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'Заголовок и ритм' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.task.description, 'Заголовок и ритм');

  const unresolved = await json('/__review/tasks/T-1/submit', { method: 'POST' });
  assert.equal(unresolved.response.status, 409);
  assert.equal(unresolved.body.details.blockers.length, 1);

  const commentId = created.body.comment.id;
  await json(`/__review/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'resolved', resolution: 'Поправил' }),
  });

  const submitted = await json('/__review/tasks/T-1/submit', { method: 'POST' });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.task.status, 'review');

  const next = await createComment('Добавь отступ');
  assert.equal(next.body.task.number, 2);

  const closed = await json('/__review/tasks/T-1/close', { method: 'POST' });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.body.task.status, 'closed');

  const reopened = await json(`/__review/comments/${commentId}/reopen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.cloned, true);
  assert.equal(reopened.body.comment.taskId, next.body.task.id);
  assert.equal(reopened.body.comment.reopenedFrom.commentId, commentId);

  const deleted = await json(`/__review/tasks/T-2`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.deletedComments, 2);

  const finalState = await json('/__review/state');
  assert.deepEqual(finalState.body.tasks.map((task) => task.number), [1]);
  assert.equal(finalState.body.comments.length, 1);
});
