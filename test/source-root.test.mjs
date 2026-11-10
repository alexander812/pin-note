import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

test('uses sourceRoot for source hints when serving a build directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-dist-'));
  const sourceRoot = await mkdtemp(join(tmpdir(), 'pin-note-src-'));
  let review;

  try {
    await writeFile(
      join(root, 'index.html'),
      '<!doctype html><html><body><h1>Unique phrase</h1></body></html>',
      'utf8'
    );
    await mkdir(join(sourceRoot, 'src'), { recursive: true });
    await writeFile(join(sourceRoot, 'src', 'app.js'), "const title = 'Unique phrase';\n", 'utf8');

    review = await createReviewServer({
      root,
      sourceRoot,
      dataDir: join(root, '.review'),
      watch: false,
    });
    const { url } = await review.listen(0, '127.0.0.1');
    const response = await fetch(`${url}/__review/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        comment: 'Поправь заголовок',
        url: `${url}/`,
        anchor: {
          selector: 'h1',
          tag: 'h1',
          text: 'Unique phrase',
          html: '<h1>Unique phrase</h1>',
        },
      }),
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.ok(
      data.comment.sourceHints.some((hint) => hint.file === 'src/app.js'),
      JSON.stringify(data.comment.sourceHints)
    );
  } finally {
    await review?.close();
    await rm(root, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  }
});
