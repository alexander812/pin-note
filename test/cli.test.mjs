import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewStore } from '../src/store.mjs';

const bin = fileURLToPath(new URL('../bin/pin-note.mjs', import.meta.url));
const roots = [];

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
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

test('lists rejected comments across tasks by default', async () => {
  const { root, comment } = await makeProject();

  const rejected = run([
    'comments',
    'set-status',
    comment.id,
    '--project',
    root,
    '--status',
    'rejected',
    '--resolution',
    'Не тот отступ',
  ]);
  assert.equal(rejected.status, 0, rejected.stderr);

  const list = run(['comments', 'list', '--project', root, '--status', 'rejected', '--json']);
  assert.equal(list.status, 0, list.stderr);
  const items = JSON.parse(list.stdout).comments;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, comment.id);
  assert.equal(items[0].rejection.reason, 'Не тот отступ');
});


test('agent check --install installs a missing CLI and keeps JSON output clean', async () => {
  const { root } = await makeProject();
  const fakeBin = join(root, 'fake-bin');
  const prefix = join(root, 'npm-prefix');
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    join(fakeBin, 'npm'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'prefix' && args[1] === '-g') { console.log(process.env.FAKE_NPM_PREFIX); process.exit(0); }
if (args[0] === 'install' && args[1] === '-g') {
  const bin = path.join(process.env.FAKE_NPM_PREFIX, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'codex'), '#!/usr/bin/env node\\nconsole.log("fake codex")\\n', { mode: 0o755 });
  process.exit(0);
}
process.exit(1);
`,
    { mode: 0o755 }
  );

  const toolBin = join(root, 'tool-bin');
  await mkdir(toolBin, { recursive: true });
  await symlink(process.execPath, join(toolBin, 'node'));
  const result = run(['agent', 'check', '--project', root, '--agent', 'codex', '--install', '--json'], {
    env: {
      ...process.env,
      PATH: `${fakeBin}:${toolBin}`,
      FAKE_NPM_PREFIX: prefix,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const readiness = JSON.parse(result.stdout);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.provider, 'codex');
  assert.match(result.stderr, /Устанавливаю Codex CLI/);
});
