import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

let root;
let dataDir;
let script;
let logFile;
let review;
let base;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check();
    if (value) return value;
    await sleep(50);
  }
  throw new Error('Условие не выполнилось за отведённое время');
}

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function agentLog() {
  try {
    const raw = await readFile(logFile, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function createTask(description) {
  const result = await json('/__review/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(description ? { description } : {}),
  });
  assert.equal(result.response.status, 201);
  return result.body.task;
}

async function addComment(taskId, comment) {
  const result = await json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment,
      taskId,
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Agent batch test' },
    }),
  });
  assert.equal(result.response.status, 201);
  return result.body.comment;
}

async function patchComment(id, patch) {
  const result = await json(`/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  assert.equal(result.response.status, 200);
  return result.body.comment;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-agent-batch-'));
  dataDir = join(root, '.review');
  script = join(root, 'fake-agent.cjs');
  logFile = join(root, 'agent.log');
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Agent batch test</h1>\n', 'utf8');
  await writeFile(
    script,
    `const fs = require('node:fs');
const args = process.argv.slice(2);
const resume = args[0] === 'resume';
const sessionId = resume ? args[1] : 'session-batch';
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({
    mode: resume ? 'resume' : 'initial',
    sessionId,
    prompt,
  }) + '\\n');
  console.log(JSON.stringify({ type: 'session', sessionId }));
  setTimeout(() => {
    console.log(JSON.stringify({ type: 'final', sessionId, reason: { kind: 'completed' } }));
    process.exit(0);
  }, 300);
});
`,
    'utf8'
  );
  review = await createReviewServer({
    root,
    dataDir,
    watch: false,
    agent: {
      provider: 'custom',
      autoRework: false,
      command: process.execPath,
      args: [script, '-'],
      resumeArgs: [script, 'resume', '{sessionId}', '-'],
      env: { FAKE_AGENT_LOG: logFile },
      timeoutMs: 5000,
    },
  });
  const listening = await review.listen(0, '127.0.0.1');
  base = listening.url;
});

after(async () => {
  await review.close();
  await rm(root, { recursive: true, force: true });
});

test('dispatches every task with work except accepted and review-only ones', async () => {
  const task1 = await createTask('Первый пакет');
  const task2 = await createTask('Уже принята');
  const task3 = await createTask('На проверке');
  const task4 = await createTask('Доработка');

  const comment1 = await addComment(task1.id, 'Открытая правка');
  const comment2 = await addComment(task2.id, 'Принятая правка');
  const comment3 = await addComment(task3.id, 'Готовая правка');
  const comment4 = await addComment(task4.id, 'Отклонённая правка');

  await patchComment(comment2.id, { status: 'approved' });
  await patchComment(comment3.id, { status: 'review', resolution: 'Готово' });
  await patchComment(comment4.id, { status: 'review', resolution: 'Сделал' });
  await patchComment(comment4.id, { status: 'rejected', rejectionReason: 'Нужно иначе' });

  const dispatched = await json('/__review/agent/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: task4.id }),
  });
  assert.equal(dispatched.response.status, 200, JSON.stringify(dispatched.body));
  assert.equal(dispatched.body.queued, 2);
  assert.deepEqual(
    dispatched.body.tasks.map((task) => task.id),
    [task4.id, task1.id]
  );
  assert.ok(['running', 'queued'].includes(dispatched.body.agent.status));

  const again = await json('/__review/agent/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: task1.id }),
  });
  assert.equal(again.response.status, 409);
  assert.match(again.body.error, /уже работает/i);

  const lines = await waitFor(async () => {
    const entries = await agentLog();
    return entries.length >= 2 ? entries : null;
  });
  assert.match(lines[0].prompt, /T-4/);
  assert.match(lines[0].prompt, /Нужно иначе/);
  assert.match(lines[1].prompt, /T-1/);
  assert.match(lines[1].prompt, /Открытая правка/);
  assert.doesNotMatch(lines[1].prompt, /Принятая правка/);

  const completed = await waitFor(async () => {
    const result = await json('/__review/agent');
    const byTag = new Map(result.body.tasks.map((task) => [task.taskTag, task]));
    return byTag.get('T-1')?.status === 'completed' &&
      byTag.get('T-4')?.status === 'completed'
      ? byTag
      : null;
  });
  assert.equal(completed.get('T-4').status, 'completed');
  assert.equal(completed.get('T-1').status, 'completed');
  assert.equal(completed.has('T-2'), false);
  assert.equal(completed.has('T-3'), false);

  await sleep(250);
  assert.equal((await agentLog()).length, 2);

  await patchComment(comment1.id, { status: 'approved' });
  await patchComment(comment4.id, { status: 'approved' });
});

test('stopping the running agent clears the remaining batch queue', async () => {
  const before = (await agentLog()).length;
  const task5 = await createTask('Первая в очереди');
  const task6 = await createTask('Вторая в очереди');
  await addComment(task5.id, 'Правка пятой задачи');
  await addComment(task6.id, 'Правка шестой задачи');

  const dispatched = await json('/__review/agent/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: task5.id }),
  });
  assert.equal(dispatched.response.status, 200);
  assert.equal(dispatched.body.queued, 2);

  const cancelled = await json(`/__review/tasks/T-5/agent/cancel`, { method: 'POST' });
  assert.equal(cancelled.response.status, 200);

  await waitFor(async () => {
    const result = await json('/__review/agent');
    return result.body.tasks.find((task) => task.taskTag === 'T-5')?.status === 'cancelled';
  });
  await sleep(350);
  const lines = await agentLog();
  assert.ok(lines.length <= before + 1);
  assert.equal(lines.some((line) => /T-6/.test(line.prompt)), false);

  const agentState = await json('/__review/agent');
  const tags = agentState.body.tasks.map((task) => task.taskTag);
  assert.equal(tags.includes('T-6'), false);
});

test('rejects a bulk dispatch when there are no tasks with work', async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), 'pin-note-agent-batch-empty-'));
  const isolated = await createReviewServer({
    root: isolatedRoot,
    watch: false,
    agent: {
      provider: 'custom',
      autoRework: false,
      command: process.execPath,
      args: [script, '-'],
      resumeArgs: [script, 'resume', '{sessionId}', '-'],
      env: { FAKE_AGENT_LOG: join(isolatedRoot, 'agent.log') },
      timeoutMs: 5000,
    },
  });
  const listening = await isolated.listen(0, '127.0.0.1');
  try {
    const response = await fetch(`${listening.url}/__review/agent/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.error, /Нет задач/i);
  } finally {
    await isolated.close();
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});
