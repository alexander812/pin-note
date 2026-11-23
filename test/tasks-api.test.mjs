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

async function createComment(comment, extra = {}) {
  return json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment,
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
      ...extra,
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

test('reviews comments through the review API', async () => {
  const created = await createComment('Проверь отступ');
  assert.equal(created.response.status, 201);
  const id = created.body.comment.id;
  const taskNumber = created.body.task.number;

  const review = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review', resolution: 'Поправил отступ' }),
  });
  assert.equal(review.response.status, 200);
  assert.equal(review.body.comment.status, 'review');

  const submitted = await json(`/__review/tasks/T-${taskNumber}/submit`, { method: 'POST' });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.task.status, 'review');
  assert.equal(submitted.body.task.counts.review, 1);

  const noReason = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' }),
  });
  assert.equal(noReason.response.status, 400);

  const rejected = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'rejected', rejectionReason: 'Всё ещё съезжает' }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.comment.rejection.reason, 'Всё ещё съезжает');

  const blocked = await json(`/__review/tasks/T-${taskNumber}/close`, { method: 'POST' });
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.body.details.blockers[0].status, 'rejected');

  const resubmitted = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review', resolution: 'Поправил снова' }),
  });
  assert.equal(resubmitted.response.status, 200);
  assert.equal(resubmitted.body.comment.status, 'review');

  const approved = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.comment.status, 'approved');

  const closed = await json(`/__review/tasks/T-${taskNumber}/close`, { method: 'POST' });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.body.task.status, 'closed');

  const state = await json('/__review/state');
  const comment = state.body.comments.find((item) => item.id === id);
  assert.equal(comment.status, 'resolved');
  assert.ok(comment.resolvedAt);
});

test('uploads attachments and keeps a dialogue through the review API', async () => {
  const body = 'Файл заказчика';
  const upload = await fetch(
    `${base}/__review/attachments?name=${encodeURIComponent('Заметка клиента.txt')}&type=text/plain`,
    {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    }
  );
  assert.equal(upload.status, 201);
  const uploaded = await upload.json();
  assert.equal(uploaded.attachment.name, 'Заметка клиента.txt');
  assert.equal(uploaded.attachment.size, Buffer.byteLength(body));
  assert.match(uploaded.attachment.file, /^attachments\/a_[a-z0-9_]+\.txt$/);

  const created = await json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: 'Посмотри во вложении',
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
      attachments: [uploaded.attachment],
    }),
  });
  assert.equal(created.response.status, 201);
  const id = created.body.comment.id;
  assert.equal(created.body.comment.attachments[0].file, uploaded.attachment.file);

  const filePath = uploaded.attachment.file.split('/').pop();
  const download = await fetch(
    `${base}/__review/attachments/${filePath}?name=${encodeURIComponent('Заметка клиента.txt')}`
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''/);
  assert.equal(await download.text(), body);

  const reviewed = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review', resolution: 'Посмотрел, поправил' }),
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.comment.thread.length, 1);
  assert.equal(reviewed.body.comment.thread[0].role, 'agent');

  const reply = await json(`/__review/comments/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Нужно иначе', dispatchAgent: false }),
  });
  assert.equal(reply.response.status, 200);
  assert.equal(reply.body.comment.status, 'rejected');
  assert.equal(reply.body.comment.rejection.reason, 'Нужно иначе');
  assert.equal(reply.body.comment.thread.length, 2);
  assert.equal(reply.body.comment.thread[1].role, 'user');

  const state = await json('/__review/state');
  const stored = state.body.comments.find((comment) => comment.id === id);
  assert.equal(stored.thread[1].text, 'Нужно иначе');
  assert.equal(stored.attachments[0].name, 'Заметка клиента.txt');

  const missing = await fetch(`${base}/__review/attachments/a_missing.png`);
  assert.equal(missing.status, 404);
  const badName = await fetch(`${base}/__review/attachments/..%2Fcomments.json`);
  assert.equal(badName.status, 404);
});

test('creates an empty task through the review API and selects it as current', async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), 'pin-note-create-task-api-'));
  const isolated = await createReviewServer({ root: isolatedRoot, watch: false });
  const listening = await isolated.listen(0, '127.0.0.1');
  const send = async (path, options = {}) => {
    const response = await fetch(`${listening.url}${path}`, options);
    return { response, body: await response.json() };
  };
  const createTask = (description) =>
    send('/__review/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(description === undefined ? {} : { description }),
    });
  const addComment = (comment, taskId) =>
    send('/__review/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        comment,
        taskId,
        url: `${listening.url}/`,
        anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
      }),
    });

  try {
    const created = await createTask();
    assert.equal(created.response.status, 201);
    assert.equal(created.body.task.number, 1);
    assert.equal(created.body.task.status, 'active');
    assert.equal(created.body.task.total, 0);

    const listed = await send('/__review/tasks');
    assert.equal(listed.body.activeTask.id, created.body.task.id);
    assert.equal(listed.body.tasks.length, 1);

    const second = await createTask('Ручная задача');
    assert.equal(second.response.status, 201);
    assert.equal(second.body.task.number, 2);
    assert.equal(second.body.task.status, 'active');
    assert.equal(second.body.task.description, 'Ручная задача');

    const state = await send('/__review/state');
    assert.equal(state.body.activeTaskId, second.body.task.id);
    assert.deepEqual(
      state.body.tasks.map((task) => [task.number, task.status]),
      [
        [1, 'active'],
        [2, 'active'],
      ]
    );

    const comment = await addComment('Новая правка', second.body.task.id);
    assert.equal(comment.response.status, 201);
    assert.equal(comment.body.comment.taskId, second.body.task.id);
    assert.equal(comment.body.task.description, 'Ручная задача');

    const unnamed = await createTask();
    const namedByComment = await addComment('Правка без описания', unnamed.body.task.id);
    assert.equal(namedByComment.response.status, 201);
    assert.equal(namedByComment.body.task.description, 'Правка без описания');

    const finalState = await send('/__review/state');
    assert.equal(finalState.body.tasks.length, 3);
    assert.equal(finalState.body.activeTaskId, unnamed.body.task.id);
  } finally {
    await isolated.close();
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test('forwards taskId to the store and rejects comments for a closed task', async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), 'pin-note-taskid-api-'));
  const isolated = await createReviewServer({ root: isolatedRoot, watch: false });
  const listening = await isolated.listen(0, '127.0.0.1');
  const send = async (path, options = {}) => {
    const response = await fetch(`${listening.url}${path}`, options);
    return { response, body: await response.json() };
  };
  const addComment = async (comment, extra = {}) =>
    send('/__review/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        comment,
        url: `${listening.url}/`,
        anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
        ...extra,
      }),
    });
  const patchComment = (id, patch) =>
    send(`/__review/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });

  try {
    const created = await addComment('Поправь отступ');
    assert.equal(created.response.status, 201);
    const taskId = created.body.task.id;
    const taskNumber = created.body.task.number;

    await patchComment(created.body.comment.id, {
      status: 'resolved',
      resolution: 'Поправил',
    });
    const submitted = await send(`/__review/tasks/T-${taskNumber}/submit`, { method: 'POST' });
    assert.equal(submitted.body.task.status, 'review');

    const before = await send('/__review/state');
    const second = await addComment('Ещё отступ', { taskId });
    assert.equal(second.response.status, 201);
    assert.equal(second.body.comment.taskId, taskId);
    assert.equal(second.body.task.status, 'review');

    const after = await send('/__review/state');
    assert.equal(after.body.tasks.length, before.body.tasks.length);
    assert.equal(after.body.comments.length, before.body.comments.length + 1);

    const toClose = await addComment('Закрой меня');
    await patchComment(toClose.body.comment.id, { status: 'approved' });
    const closed = await send(`/__review/tasks/T-${toClose.body.task.number}/close`, {
      method: 'POST',
    });
    assert.equal(closed.body.task.status, 'closed');

    const rejected = await addComment('Поздно', { taskId: toClose.body.task.id });
    assert.equal(rejected.response.status, 409);
    assert.match(rejected.body.error, /закрыта/i);

    const finalState = await send('/__review/state');
    assert.equal(finalState.body.tasks.length, after.body.tasks.length + 1);
    assert.equal(finalState.body.comments.length, after.body.comments.length + 1);
  } finally {
    await isolated.close();
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});
