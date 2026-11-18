import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewStore } from '../src/store.mjs';

const bin = fileURLToPath(new URL('../bin/pin-note.mjs', import.meta.url));
const roots = [];

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

async function makeProject() {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-cli-'));
  roots.push(root);
  const store = new ReviewStore({
    root,
    dataDir: join(root, '.review'),
    sourceRoot: root,
  });
  await store.init();
  const comment = await store.add({
    comment: 'Поправь заголовок',
    anchor: { selector: 'h1', tag: 'h1' },
  });
  return { root, store, comment };
}

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop(), { recursive: true, force: true });
  }
});

test('tasks and comments CLI commands work with the data store', async () => {
  const { root, store, comment } = await makeProject();

  const list = run(['tasks', 'list', '--project', root, '--json']);
  assert.equal(list.status, 0, list.stderr);
  const tasks = JSON.parse(list.stdout).tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].number, 1);
  assert.equal(tasks[0].description, 'Поправь заголовок');

  const comments = run(['comments', 'list', '--project', root, '--json']);
  assert.equal(comments.status, 0, comments.stderr);
  assert.equal(JSON.parse(comments.stdout).comments[0].id, comment.id);

  const unresolved = run(['tasks', 'submit', '--project', root]);
  assert.equal(unresolved.status, 1);
  assert.match(unresolved.stderr, /неразобранных/);

  const resolved = run([
    'comments',
    'resolve',
    comment.id,
    '--project',
    root,
    '--resolution',
    'Поправил',
  ]);
  assert.equal(resolved.status, 0, resolved.stderr);

  const submitted = run(['tasks', 'submit', '--project', root, '--json']);
  assert.equal(submitted.status, 0, submitted.stderr);
  assert.equal(JSON.parse(submitted.stdout).task.status, 'review');

  const updated = run([
    'tasks',
    'update',
    'T-1',
    '--project',
    root,
    '--description',
    'Заголовок и ритм',
  ]);
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(updated.stdout, /Заголовок и ритм/);

  const deleted = run(['tasks', 'delete', 'T-1', '--project', root, '--confirm']);
  assert.equal(deleted.status, 0, deleted.stderr);
  const state = await store.read();
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.comments, []);
});
