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

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-accept-api-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Hello</h1>\n', 'utf8');
  review = await createReviewServer({ root, watch: false });
  const listening = await review.listen(0, '127.0.0.1');
  base = listening.url;
});

after(async () => {
  await review.close();
  await rm(root, { recursive: true, force: true });
});

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

async function setStatus(commentId, status) {
  return json(`/__review/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, resolution: status === 'approved' ? 'Готово' : undefined }),
  });
}

test('rejects full acceptance while a fix is on review and accepts it after approval', async () => {
  const created = await createComment('Проверка строгого принятия');
  const taskId = created.body.task.id;
  const commentId = created.body.comment.id;

  await setStatus(commentId, 'review');
  const rejected = await json(`/__review/tasks/${taskId}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(rejected.response.status, 409);
  assert.match(rejected.body.error, /непринятых/i);

  await setStatus(commentId, 'approved');
  const accepted = await json(`/__review/tasks/${taskId}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.task.status, 'closed');
});
