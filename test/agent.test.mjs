import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';
import { checkAgentReadiness, resolveAgentConfig } from '../src/agent.mjs';
import { installInfo, installSupported } from '../src/agent-install.mjs';

let root;
let dataDir;
let script;
let logFile;
let review;
let base;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeout = 6000) {
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

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-agent-'));
  dataDir = join(root, '.review');
  script = join(root, 'fake-agent.cjs');
  logFile = join(root, 'agent.log');
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Agent test</h1>\n', 'utf8');
  await writeFile(
    script,
    `const fs = require('node:fs');
const args = process.argv.slice(2);
const resume = args[0] === 'resume';
const sessionId = resume ? args[1] : 'session-fake-1';
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
  console.log(JSON.stringify({ type: 'tool_call', tool: 'bash', input: { command: 'npm test' } }));
  setTimeout(() => {
    console.log(JSON.stringify({ type: 'final', sessionId, reason: { kind: 'completed' } }));
    process.exit(0);
  }, 60);
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

test('runs each PinNote task in its own agent session and reworks rejected comments there', async () => {
  const created = await json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: 'Поправь заголовок',
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Agent test' },
    }),
  });
  assert.equal(created.response.status, 201);
  const commentId = created.body.comment.id;

  const dispatched = await json('/__review/tasks/T-1/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'task' }),
  });
  assert.equal(dispatched.response.status, 200);
  assert.ok(['running', 'queued'].includes(dispatched.body.agent.status));

  const initial = await waitFor(async () => {
    const lines = await agentLog();
    return lines.length >= 1 ? lines[0] : null;
  });
  assert.equal(initial.mode, 'initial');
  assert.match(initial.prompt, /T-1/);
  assert.match(initial.prompt, /Поправь заголовок/);
  assert.match(initial.prompt, /AGENT\.md/);

  const stored = await waitFor(async () => {
    const state = await json('/__review/state');
    const comment = state.body.comments.find((item) => item.id === commentId);
    if (!comment) return null;
    const task = state.body.tasks.find((item) => item.id === comment.taskId);
    return task?.agentSessionId ? task : null;
  });
  assert.equal(stored.agentSessionId, 'session-fake-1');
  assert.equal(stored.agentProvider, 'custom');

  const completed = await waitFor(async () => {
    const result = await json('/__review/tasks/T-1/agent');
    return result.body.agent.status === 'completed' ? result.body.agent : null;
  });
  assert.match(completed.activity, /npm test/);

  await json(`/__review/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review', resolution: 'Поправил заголовок' }),
  });
  const submitted = await json('/__review/tasks/T-1/submit', { method: 'POST' });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.task.status, 'review');

  const rejected = await json(`/__review/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'rejected',
      rejectionReason: 'Заголовок всё ещё слишком мелкий',
    }),
  });
  assert.equal(rejected.response.status, 200);
  assert.ok(rejected.body.agent);

  const rework = await waitFor(async () => {
    const lines = await agentLog();
    return lines.length >= 2 ? lines[1] : null;
  });
  assert.equal(rework.mode, 'resume');
  assert.equal(rework.sessionId, 'session-fake-1');
  assert.match(rework.prompt, /слишком мелкий/);
  assert.match(rework.prompt, /этой же сессии/);

  await waitFor(async () => {
    const result = await json('/__review/tasks/T-1/agent');
    return result.body.agent.status === 'completed' ? result.body.agent : null;
  });

  const reset = await json('/__review/tasks/T-1/agent', { method: 'DELETE' });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.agent.sessionId, null);

  const again = await json('/__review/tasks/T-1/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'task' }),
  });
  assert.equal(again.response.status, 200);

  const fresh = await waitFor(async () => {
    const lines = await agentLog();
    return lines.length >= 3 ? lines[2] : null;
  });
  assert.equal(fresh.mode, 'initial');
});


test('sends a customer reply in the dialogue to the agent', async () => {
  const created = await json('/__review/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: 'Проверь отступ у кнопки',
      url: `${base}/`,
      anchor: { selector: 'h1', tag: 'h1', text: 'Agent test' },
    }),
  });
  assert.equal(created.response.status, 201);
  const commentId = created.body.comment.id;
  const taskId = created.body.comment.taskId;

  const reviewed = await json(`/__review/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review', resolution: 'Добавил отступ' }),
  });
  assert.equal(reviewed.response.status, 200);

  const reply = await json(`/__review/comments/${encodeURIComponent(commentId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Уточнение в диалоге: нужно 24px', dispatchAgent: true }),
  });
  assert.equal(reply.response.status, 200);
  assert.equal(reply.body.comment.status, 'rejected');
  assert.equal(reply.body.comment.thread.at(-1).text, 'Уточнение в диалоге: нужно 24px');
  assert.ok(reply.body.agent);
  assert.equal(reply.body.task.id, taskId);

  const logged = await waitFor(async () => {
    const lines = await agentLog();
    return lines.find((line) => line.prompt.includes('Уточнение в диалоге: нужно 24px')) || null;
  });
  assert.equal(logged.mode, 'initial');
  assert.match(logged.prompt, /Уточнение в диалоге: нужно 24px/);
  assert.match(logged.prompt, /thread/);
});


test('describes install commands and checks a custom agent readiness', async () => {
  assert.equal(installInfo('codex').command, 'npm install -g @openai/codex');
  assert.equal(installInfo('dsh').command, 'npm install -g @deepseek-ai/dsh');
  assert.equal(installSupported('custom'), false);

  const root = await mkdtemp(join(tmpdir(), 'pin-note-readiness-'));
  try {
    const config = await resolveAgentConfig({
      options: {
        provider: 'custom',
        command: process.execPath,
        configFile: join(root, 'missing-agent.json'),
      },
      dataDir: join(root, '.review'),
      root,
    });
    const readiness = await checkAgentReadiness(config, { root, dataDir: join(root, '.review') });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.provider, 'custom');
    assert.equal(readiness.checks[0].status, 'ok');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('adds the selected Codex model to the CLI arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-model-'));
  try {
    const config = await resolveAgentConfig({
      options: {
        provider: 'codex',
        command: process.execPath,
        model: 'gpt-5.4',
        configFile: join(root, 'missing-agent.json'),
      },
      dataDir: join(root, '.review'),
      root,
    });
    assert.equal(config.model, 'gpt-5.4');
    assert.deepEqual(config.args.slice(0, 3), ['--model', 'gpt-5.4', 'exec']);
    assert.deepEqual(config.resumeArgs.slice(0, 3), ['--model', 'gpt-5.4', 'exec']);
    assert.ok(config.args.includes('-c'));
    assert.ok(config.args.some((arg) => arg.startsWith('log_dir=')));
    assert.ok(config.resumeArgs.includes('-c'));
    assert.ok(config.resumeArgs.some((arg) => arg.startsWith('log_dir=')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
