import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewStore } from '../src/store.mjs';
import { formatTaskDate, taskTag } from '../src/shared.mjs';

const roots = [];

async function makeStore() {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-tasks-'));
  roots.push(root);
  const dataDir = join(root, '.review');
  const store = new ReviewStore({ root, dataDir, sourceRoot: root });
  await store.init();
  return { root, dataDir, store };
}

async function addComment(store, text) {
  return store.add({
    comment: text,
    url: 'http://127.0.0.1/',
    anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
  });
}

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop(), { recursive: true, force: true });
  }
});

test('formats task dates as dd.mm.yy and builds a tag', () => {
  const date = new Date(2026, 10, 13, 21, 40);
  assert.equal(formatTaskDate(date.toISOString()), '13.11.26');
  assert.equal(taskTag({ number: 12 }), 'T-12');
});

test('runs the task lifecycle: active, review, closed, next task', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Сделай заголовок крупнее');

  let task = await store.currentTask();
  assert.ok(task);
  assert.equal(task.number, 1);
  assert.equal(task.status, 'active');
  assert.equal(task.description, 'Сделай заголовок крупнее');
  assert.equal(task.total, 1);
  assert.equal(first.taskId, task.id);

  await assert.rejects(
    () => store.submitTask('current'),
    (err) => err.status === 409 && err.details?.blockers?.length === 1
  );

  await store.update(first.id, { status: 'resolved', resolution: 'Увеличил размер' });
  task = await store.submitTask('current');
  assert.equal(task.status, 'review');
  assert.equal((await store.currentTask()), null);

  const second = await addComment(store, 'Добавь отступ');
  const next = await store.currentTask();
  assert.ok(next);
  assert.equal(next.number, 2);
  assert.equal(second.taskId, next.id);

  task = await store.closeTask('T-1');
  assert.equal(task.status, 'closed');
  assert.ok(task.closedAt);

  const reopened = await store.reopenComment(first.id);
  assert.equal(reopened.cloned, true);
  assert.equal(reopened.comment.taskId, next.id);
  assert.equal(reopened.comment.status, 'open');
  assert.deepEqual(reopened.comment.reopenedFrom, {
    taskId: task.id,
    commentId: first.id,
  });

  const original = (await store.read()).comments.find((comment) => comment.id === first.id);
  assert.equal(original.status, 'resolved');

  const updated = await store.updateTask('T-2', { description: 'Отступы и возврат заголовка' });
  assert.equal(updated.description, 'Отступы и возврат заголовка');

  const deleted = await store.removeTask('T-2');
  assert.equal(deleted.deletedComments, 2);
  const state = await store.read();
  assert.deepEqual(state.tasks.map((item) => item.number), [1]);
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].id, first.id);
});

test('refuses to close a task with unresolved comments', async () => {
  const { store } = await makeStore();
  await addComment(store, 'Поправь кнопку');
  await assert.rejects(
    () => store.closeTask('T-1'),
    (err) => err.status === 409 && err.details?.blockers?.length === 1
  );
});

test('migrates version 1 comments into a legacy task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-migrate-'));
  roots.push(root);
  const dataDir = join(root, '.review');
  await mkdir(dataDir, { recursive: true });
  const createdAt = '2026-11-13T18:40:00.000Z';
  await writeFile(
    join(dataDir, 'comments.json'),
    `${JSON.stringify({
      version: 1,
      project: 'legacy',
      comments: [
        {
          id: 'c_legacy',
          status: 'open',
          comment: 'Старый комментарий',
          anchor: { selector: 'h1', tag: 'h1' },
          createdAt,
          updatedAt: createdAt,
        },
      ],
    }, null, 2)}\n`,
    'utf8'
  );

  const store = new ReviewStore({ root, dataDir, sourceRoot: root });
  await store.init();
  const state = await store.read();
  assert.equal(state.version, 2);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].number, 1);
  assert.equal(state.tasks[0].status, 'active');
  assert.equal(state.comments[0].taskId, state.tasks[0].id);
  assert.equal(formatTaskDate(state.tasks[0].createdAt), '13.11.26');

  const feedback = await readFile(join(dataDir, 'feedback.md'), 'utf8');
  assert.match(feedback, /T-1/);
  assert.match(feedback, /13\.11\.26/);
  assert.match(feedback, /Старый комментарий/);
});

test('removing the last comment removes an empty active task', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Один комментарий');
  await store.remove(comment.id);
  const state = await store.read();
  assert.deepEqual(state.tasks, []);
  assert.equal(state.activeTaskId, null);
});
