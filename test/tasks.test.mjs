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

async function addComment(store, text, extra = {}) {
  return store.add({
    comment: text,
    url: 'http://127.0.0.1/',
    anchor: { selector: 'h1', tag: 'h1', text: 'Hello' },
    ...extra,
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

test('creates an empty active task and keeps the previous one in work', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Первый комментарий');

  const created = await store.createTask();
  assert.equal(created.number, 2);
  assert.equal(created.status, 'active');
  assert.equal(created.total, 0);
  assert.equal(created.description, 'Задача T-2');
  assert.equal((await store.currentTask()).id, created.id);

  let state = await store.read();
  assert.equal(state.activeTaskId, created.id);
  assert.deepEqual(
    state.tasks.map((task) => [task.number, task.status]),
    [
      [1, 'active'],
      [2, 'active'],
    ]
  );

  const next = await addComment(store, 'Правка в новой задаче');
  assert.equal(next.taskId, created.id);

  state = await store.read();
  assert.equal(state.tasks.find((task) => task.id === created.id).description, 'Правка в новой задаче');
  assert.equal(state.tasks.find((task) => task.id === first.taskId).description, 'Первый комментарий');
});

test('creates a named task and keeps its description after the first comment', async () => {
  const { store } = await makeStore();
  const task = await store.createTask({ description: 'Отдельная ручная задача' });
  assert.equal(task.description, 'Отдельная ручная задача');

  const comment = await addComment(store, 'Комментарий к ручной задаче', { taskId: task.id });
  assert.equal(comment.taskId, task.id);
  const stored = (await store.read()).tasks.find((item) => item.id === task.id);
  assert.equal(stored.description, 'Отдельная ручная задача');
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

test('reviews a comment, rejects it with a reason and resolves everything on close', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Поправь кнопку');

  const review = await store.update(comment.id, {
    status: 'review',
    resolution: 'Поправил отступ',
  });
  assert.equal(review.status, 'review');
  assert.ok(review.reviewedAt);

  let task = await store.submitTask('current');
  assert.equal(task.status, 'review');
  assert.equal(task.counts.review, 1);

  const approved = await store.update(comment.id, { status: 'approved' });
  assert.equal(approved.status, 'approved');
  assert.ok(approved.approvedAt);

  const rejected = await store.update(comment.id, {
    status: 'rejected',
    rejectionReason: 'Кнопка всё ещё съезжает',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection.reason, 'Кнопка всё ещё съезжает');
  assert.ok(rejected.rejectedAt);

  await assert.rejects(
    () => store.update(comment.id, { status: 'rejected' }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => store.closeTask('T-1'),
    (err) =>
      err.status === 409 &&
      err.details?.blockers?.length === 1 &&
      err.details.blockers[0].status === 'rejected'
  );

  const resubmitted = await store.update(comment.id, {
    status: 'review',
    resolution: 'Поправил ещё раз',
  });
  assert.equal(resubmitted.status, 'review');
  assert.equal(resubmitted.rejection.reason, 'Кнопка всё ещё съезжает');

  await store.update(comment.id, { status: 'approved' });
  task = await store.closeTask('T-1');
  assert.equal(task.status, 'closed');

  const stored = (await store.read()).comments.find((item) => item.id === comment.id);
  assert.equal(stored.status, 'resolved');
  assert.ok(stored.resolvedAt);
  assert.equal(stored.rejection, undefined);
});

test('moves resolved comments to review when the task is submitted', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Поправь заголовок');
  await store.update(comment.id, { status: 'resolved', resolution: 'Поправил' });

  const task = await store.submitTask('current');
  assert.equal(task.status, 'review');
  const submitted = (await store.read()).comments.find((item) => item.id === comment.id);
  assert.equal(submitted.status, 'review');
  assert.equal(submitted.resolution, 'Поправил');

  const closed = await store.closeTask('T-1');
  assert.equal(closed.status, 'closed');
  const stored = (await store.read()).comments.find((item) => item.id === comment.id);
  assert.equal(stored.status, 'resolved');
});

test('adds a comment to a review task by id without creating a new task', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Поправь заголовок');
  await store.update(first.id, { status: 'resolved', resolution: 'Поправил' });
  const submitted = await store.submitTask('current');
  assert.equal(submitted.status, 'review');

  const second = await addComment(store, 'Ещё отступ', { taskId: ` ${submitted.id} ` });
  assert.equal(second.taskId, submitted.id);

  const state = await store.read();
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, submitted.id);
  assert.equal(state.tasks[0].status, 'review');
  assert.equal(state.activeTaskId, null);
  assert.equal(state.comments.filter((item) => item.taskId === submitted.id).length, 2);
});

test('falls back to the active task for absent or unknown task ids', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Первый');
  const unknown = await addComment(store, 'Второй', { taskId: 't_unknown' });
  assert.equal(unknown.taskId, first.taskId);

  let state = await store.read();
  assert.equal(state.tasks.length, 1);

  await store.update(first.id, { status: 'resolved', resolution: 'Готово' });
  await store.update(unknown.id, { status: 'resolved', resolution: 'Готово' });
  await store.submitTask('current');

  const next = await addComment(store, 'Третий');
  state = await store.read();
  assert.equal(state.tasks.length, 2);
  assert.equal(next.taskId, state.activeTaskId);
  assert.equal(state.tasks.find((task) => task.id === next.taskId).status, 'active');
});

test('rejects a comment for a closed task with 409', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Первый');
  await store.update(comment.id, { status: 'approved' });
  await store.submitTask('current');
  const closed = await store.closeTask(comment.taskId);
  assert.equal(closed.status, 'closed');

  const before = await store.read();
  await assert.rejects(
    () => addComment(store, 'Поздно', { taskId: closed.id }),
    (err) => err.status === 409 && /закрыта/i.test(err.message)
  );
  const after = await store.read();
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(after.comments.length, before.comments.length);
});

test('closing a task resolves every comment regardless of its review status', async () => {
  const { store } = await makeStore();
  const approved = await addComment(store, 'Первый');
  const review = await addComment(store, 'Второй');
  const wontfix = await addComment(store, 'Третий');
  await store.update(approved.id, { status: 'approved' });
  await store.update(review.id, { status: 'review', resolution: 'Готово' });
  await store.update(wontfix.id, { status: 'wontfix', resolution: 'Не требуется' });

  await store.submitTask('current');
  const task = await store.closeTask('T-1');
  assert.equal(task.status, 'closed');

  const state = await store.read();
  for (const comment of state.comments) {
    assert.equal(comment.status, 'resolved');
    assert.ok(comment.resolvedAt);
  }
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

test('keeps a comment dialogue and turns customer replies into rework', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Сделай отступ у кнопки');
  assert.deepEqual(comment.thread, []);

  const reviewed = await store.update(comment.id, {
    status: 'review',
    resolution: 'Добавил отступ 12px',
  });
  assert.equal(reviewed.thread.length, 1);
  assert.equal(reviewed.thread[0].role, 'agent');
  assert.equal(reviewed.thread[0].kind, 'resolution');
  assert.equal(reviewed.thread[0].text, 'Добавил отступ 12px');

  const replied = await store.reply(comment.id, 'Нужно 24px');
  assert.equal(replied.comment.status, 'rejected');
  assert.equal(replied.comment.rejection.reason, 'Нужно 24px');
  assert.equal(replied.comment.thread.length, 2);
  assert.equal(replied.comment.thread[1].role, 'user');
  assert.equal(replied.comment.thread[1].kind, 'reply');
  assert.equal(replied.comment.thread[1].text, 'Нужно 24px');

  const reworked = await store.update(comment.id, {
    status: 'review',
    resolution: 'Теперь 24px',
  });
  assert.equal(reworked.thread.length, 3);
  assert.equal(reworked.thread[2].role, 'agent');
  assert.equal(reworked.thread[2].text, 'Теперь 24px');

  const approved = await store.update(comment.id, { status: 'approved' });
  assert.equal(approved.status, 'approved');

  const followUp = await store.reply(comment.id, 'Ещё нужен hover');
  assert.equal(followUp.comment.status, 'rejected');
  assert.equal(followUp.comment.thread.at(-1).text, 'Ещё нужен hover');

  const markdown = await store.exportMarkdown({ task: 'current' });
  assert.match(markdown, /\*\*Диалог:\*\*/);
  assert.match(markdown, /Добавил отступ 12px/);
  assert.match(markdown, /Нужно 24px/);
  assert.match(markdown, /Теперь 24px/);
});

test('edits customer messages and keeps the rejection reason in sync', async () => {
  const { store } = await makeStore();
  const comment = await addComment(store, 'Сделай отступ у кнопки');

  const reviewed = await store.update(comment.id, {
    status: 'review',
    resolution: 'Добавил отступ 12px',
  });
  const rejected = await store.reply(comment.id, 'Нужно 24px');
  const replyMessage = rejected.comment.thread.at(-1);
  assert.equal(replyMessage.role, 'user');

  const edited = await store.updateMessage(comment.id, replyMessage.id, {
    text: 'Нужно 32px',
  });
  assert.equal(edited.comment.thread.at(-1).text, 'Нужно 32px');
  assert.ok(edited.comment.thread.at(-1).editedAt);
  assert.equal(edited.comment.rejection.reason, 'Нужно 32px');
  assert.equal(edited.comment.status, 'rejected');

  await assert.rejects(
    () => store.updateMessage(comment.id, reviewed.thread[0].id, { text: 'Чужое сообщение' }),
    (err) => err.status === 400
  );

  const initial = await store.update(comment.id, { comment: 'Сделай отступ у кнопки 32px' });
  assert.equal(initial.comment, 'Сделай отступ у кнопки 32px');
  assert.ok(initial.editedAt);
  const task = (await store.read()).tasks[0];
  assert.equal(task.description, 'Сделай отступ у кнопки 32px');
});

test('stores attachments with comments and removes them with the comment', async () => {
  const { store, dataDir } = await makeStore();
  const attachment = await store.saveAttachment(Buffer.from('hello'), {
    name: 'Заметка клиента.txt',
    type: 'text/plain',
  });
  const comment = await store.add({
    comment: 'Смотри файл',
    attachments: [attachment, { file: '../secret', name: 'bad' }],
    anchor: { selector: 'h1', tag: 'h1' },
  });
  assert.equal(comment.attachments.length, 1);
  assert.equal(comment.attachments[0].name, 'Заметка клиента.txt');
  assert.equal(comment.attachments[0].size, 5);

  const stored = (await readFile(join(dataDir, attachment.file), 'utf8'));
  assert.equal(stored, 'hello');

  await store.remove(comment.id);
  await assert.rejects(() => readFile(join(dataDir, attachment.file), 'utf8'), { code: 'ENOENT' });
});

test('migrates legacy resolution and rejection into the dialogue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-thread-migrate-'));
  roots.push(root);
  const dataDir = join(root, '.review');
  await mkdir(dataDir, { recursive: true });
  const createdAt = '2026-11-13T18:40:00.000Z';
  await writeFile(
    join(dataDir, 'comments.json'),
    `${JSON.stringify({
      version: 2,
      project: 'legacy',
      tasks: [
        {
          id: 't_legacy',
          number: 1,
          status: 'review',
          description: 'Старый комментарий',
          createdAt,
        },
      ],
      activeTaskId: null,
      nextTaskNumber: 2,
      comments: [
        {
          id: 'c_legacy',
          taskId: 't_legacy',
          status: 'rejected',
          comment: 'Старый комментарий',
          resolution: 'Поправил',
          rejection: { reason: 'Недостаточно', at: createdAt },
          reviewedAt: createdAt,
          rejectedAt: createdAt,
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
  const comment = state.comments[0];
  assert.equal(comment.thread.length, 2);
  assert.equal(comment.thread[0].role, 'agent');
  assert.equal(comment.thread[0].text, 'Поправил');
  assert.equal(comment.thread[1].role, 'user');
  assert.equal(comment.thread[1].text, 'Недостаточно');
});

test('acceptTask requires every fix to be accepted on the server', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Первый');
  const second = await addComment(store, 'Второй');
  await store.update(first.id, { status: 'approved' });
  await store.update(second.id, { status: 'review', resolution: 'Готово' });

  await assert.rejects(
    () => store.acceptTask('T-1'),
    (err) =>
      err.status === 409 &&
      /непринятых/i.test(err.message) &&
      err.details?.blockers?.length === 1
  );

  await store.update(second.id, { status: 'approved' });
  const task = await store.acceptTask('T-1');
  assert.equal(task.status, 'closed');
  const stored = (await store.read()).comments;
  assert.ok(stored.every((comment) => comment.status === 'resolved'));
});

test('lets an agent submit a new comment added to a review task', async () => {
  const { store } = await makeStore();
  const first = await addComment(store, 'Первый');
  await store.update(first.id, { status: 'resolved', resolution: 'Готово' });
  const submitted = await store.submitTask('current');
  assert.equal(submitted.status, 'review');

  const second = await addComment(store, 'Новая правка', { taskId: submitted.id });
  assert.equal(second.status, 'open');
  const reviewed = await store.update(second.id, {
    status: 'review',
    resolution: 'Сделал новую правку',
  });
  assert.equal(reviewed.status, 'review');

  const approved = await store.update(second.id, { status: 'approved' });
  assert.equal(approved.status, 'approved');
  const task = (await store.read()).tasks.find((item) => item.id === submitted.id);
  assert.equal(task.status, 'review');
});
