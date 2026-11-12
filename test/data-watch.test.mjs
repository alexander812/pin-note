import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

let root;
let dataDir;
let review;

async function waitFor(check, timeout = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('Условие не выполнилось за отведённое время');
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-watch-root-'));
  dataDir = await mkdtemp(join(tmpdir(), 'pin-note-watch-data-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Watch</h1>\n', 'utf8');
  review = await createReviewServer({ root, dataDir, watch: true });
  await review.listen(0, '127.0.0.1');
});

after(async () => {
  await review.close();
  await rm(root, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

test('watches comments.json outside the served directory and regenerates feedback', async () => {
  const commentsFile = join(dataDir, 'comments.json');
  const data = JSON.parse(await readFile(commentsFile, 'utf8'));
  data.comments.push({
    id: 'c_external',
    status: 'open',
    comment: 'External edit',
    url: '/',
    anchor: { selector: 'h1', tag: 'h1', text: 'Watch' },
    sourceHints: [],
    resolution: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeFile(commentsFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const feedback = await waitFor(async () => {
    try {
      const text = await readFile(join(dataDir, 'feedback.md'), 'utf8');
      return text.includes('External edit') ? text : null;
    } catch {
      return null;
    }
  });
  assert.match(feedback, /External edit/);
});
