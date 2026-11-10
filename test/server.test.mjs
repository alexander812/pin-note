import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

let root;
let review;
let base;

const fixtureHtml = `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8"><title>Fixture</title></head>
  <body>
    <main id="app">
      <h1 class="hero-title">Hello review</h1>
      <button class="cta">Click me</button>
    </main>
  </body>
</html>
`;

const fixtureSource = `const title = 'Hello review';\nconst className = 'hero-title';\n`;

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function createComment(overrides = {}) {
  return json(`${base}/__review/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: 'Сделай заголовок крупнее',
      url: `${base}/`,
      anchor: {
        selector: '#app > h1.hero-title',
        xpath: '/html[1]/body[1]/main[1]/h1[1]',
        tag: 'h1',
        text: 'Hello review',
        html: '<h1 class="hero-title">Hello review</h1>',
        attributes: { class: 'hero-title' },
        ancestors: ['main#app'],
        rect: { x: 10, y: 20, width: 300, height: 40 },
        viewport: { width: 1200, height: 800, dpr: 2 },
        scroll: { x: 0, y: 0 },
        styles: { 'font-size': '48px' },
        point: { x: 0.4, y: 0.5 },
      },
      ...overrides,
    }),
  });
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'index.html'), fixtureHtml, 'utf8');
  await writeFile(join(root, 'src', 'app.js'), fixtureSource, 'utf8');
  review = await createReviewServer({ root, watch: false });
  const listening = await review.listen(0, '127.0.0.1');
  base = listening.url;
});

after(async () => {
  await review.close();
  await rm(root, { recursive: true, force: true });
});

test('serves HTML with the review client injected', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Hello review/);
  assert.match(html, /\/__review\/client\.js/);
  assert.match(html, /data-pin-note/);
  const source = await readFile(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(source, /data-pin-note/);
});

test('serves static assets with the correct content type', async () => {
  const response = await fetch(`${base}/src/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.match(await response.text(), /hero-title/);
});

test('does not expose the review data directory', async () => {
  const response = await fetch(`${base}/.review/comments.json`);
  assert.equal(response.status, 404);
});

test('returns config and initial comments', async () => {
  const config = await json(`${base}/__review/config`);
  assert.equal(config.response.status, 200);
  assert.equal(config.body.project, root.split('/').pop());
  assert.equal(config.body.commentsFile, '.review/comments.json');
  assert.equal(config.body.capabilities.sourceHints, true);
  const instructions = await readFile(join(root, '.review', 'AGENT.md'), 'utf8');
  assert.match(instructions, /comments\.json/);

  const comments = await json(`${base}/__review/comments`);
  assert.equal(comments.response.status, 200);
  assert.deepEqual(comments.body.comments, []);
});

test('creates a comment, writes JSON and feedback, and finds source hints', async () => {
  const { response, body } = await createComment();
  assert.equal(response.status, 201);
  assert.match(body.comment.id, /^c_/);
  assert.equal(body.comment.status, 'open');
  assert.equal(body.comment.comment, 'Сделай заголовок крупнее');
  assert.ok(body.comment.sourceHints.some((hint) => hint.file === 'src/app.js'));

  const stored = JSON.parse(await readFile(join(root, '.review', 'comments.json'), 'utf8'));
  assert.equal(stored.comments.length, 1);
  assert.equal(stored.comments[0].anchor.selector, '#app > h1.hero-title');

  const feedback = await readFile(join(root, '.review', 'feedback.md'), 'utf8');
  assert.match(feedback, /Сделай заголовок крупнее/);
  assert.match(feedback, /src\/app\.js/);
});

test('updates status and exports markdown', async () => {
  const comments = await json(`${base}/__review/comments`);
  const id = comments.body.comments[0].id;
  const updated = await json(`${base}/__review/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'resolved', resolution: 'Увеличил font-size' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.comment.status, 'resolved');
  assert.equal(updated.body.comment.resolution, 'Увеличил font-size');

  const exported = await fetch(`${base}/__review/export.md`);
  assert.equal(exported.status, 200);
  const markdown = await exported.text();
  assert.match(markdown, /resolved/);
  assert.match(markdown, /Увеличил font-size/);
});

test('rejects empty comments and wrong content type', async () => {
  const empty = await createComment({ comment: '   ' });
  assert.equal(empty.response.status, 400);

  const wrongType = await fetch(`${base}/__review/comments`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(wrongType.status, 415);
});

test('rejects cross-origin mutations', async () => {
  const response = await fetch(`${base}/__review/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://evil.example',
    },
    body: JSON.stringify({ comment: 'bad' }),
  });
  assert.equal(response.status, 403);
});

test('deletes a comment', async () => {
  const comments = await json(`${base}/__review/comments`);
  const id = comments.body.comments[0].id;
  const deleted = await json(`${base}/__review/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  assert.equal(deleted.response.status, 200);
  const afterDelete = await json(`${base}/__review/comments`);
  assert.deepEqual(afterDelete.body.comments, []);
});

test('resists path traversal attempts', async () => {
  const response = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.notEqual(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /root:/);
});
