import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectBasePath,
  isInside,
  parseAddress,
  parseElapsed,
  parseListeners,
} from '../src/dev-server.mjs';
import { normalizeBasePath } from '../src/base-path.mjs';

test('parses lsof listeners', () => {
  const output = [
    'p100',
    'cnode',
    'f12',
    'PTCP',
    'n*:4322',
    'p200',
    'cpython3',
    'f9',
    'PTCP',
    'n127.0.0.1:8000',
    'n[::1]:8001',
    'p300',
    'crapportd',
    'n*:53',
  ].join('\n');

  const listeners = parseListeners(output);
  assert.deepEqual(
    listeners.map((entry) => ({
      pid: entry.pid,
      command: entry.command,
      sockets: entry.sockets,
    })),
    [
      { pid: 100, command: 'node', sockets: [{ host: '*', port: 4322 }] },
      {
        pid: 200,
        command: 'python3',
        sockets: [
          { host: '127.0.0.1', port: 8000 },
          { host: '[::1]', port: 8001 },
        ],
      },
    ]
  );
});

test('parses IPv4, IPv6 and wildcard addresses', () => {
  assert.deepEqual(parseAddress('n127.0.0.1:5173'), { host: '127.0.0.1', port: 5173 });
  assert.deepEqual(parseAddress('n[::1]:4322'), { host: '[::1]', port: 4322 });
  assert.deepEqual(parseAddress('n*:3000'), { host: '*', port: 3000 });
  assert.equal(parseAddress('nnot-a-port'), null);
});

test('checks that a directory is inside the project root', () => {
  assert.equal(isInside('/p/project', '/p/project'), true);
  assert.equal(isInside('/p/project', '/p/project/apps/web'), true);
  assert.equal(isInside('/p/project', '/p/project-old'), false);
  assert.equal(isInside('/p/project', '/p/other'), false);
});

test('parses process elapsed time', () => {
  assert.equal(parseElapsed('03:55'), 235);
  assert.equal(parseElapsed('1:03:55'), 3835);
  assert.equal(parseElapsed('01-04:21:05'), 102065);
  assert.equal(parseElapsed(''), null);
  assert.equal(parseElapsed('nope'), null);
});

test('normalizes base paths', () => {
  assert.equal(normalizeBasePath('/portfolio'), '/portfolio');
  assert.equal(normalizeBasePath('/portfolio/'), '/portfolio');
  assert.equal(normalizeBasePath('//portfolio///'), '/portfolio');
  assert.equal(normalizeBasePath('https://example.com/portfolio/'), '/portfolio');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath(''), '');
  assert.equal(normalizeBasePath('./portfolio'), '');
});

test('detects the base path from framework configs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-base-'));
  try {
    await writeFile(
      join(root, 'astro.config.mjs'),
      "export default { base: '/portfolio', vite: { server: { port: 4321 } } };\n",
      'utf8'
    );
    assert.equal(await detectBasePath(root), '/portfolio');

    await rm(join(root, 'astro.config.mjs'));
    await writeFile(
      join(root, 'next.config.mjs'),
      "export default { basePath: '/docs' };\n",
      'utf8'
    );
    assert.equal(await detectBasePath(root), '/docs');
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const viteRoot = await mkdtemp(join(tmpdir(), 'pin-note-base-'));
  try {
    await writeFile(join(viteRoot, 'vite.config.js'), "export default { base: './' };\n", 'utf8');
    assert.equal(await detectBasePath(viteRoot), '');
  } finally {
    await rm(viteRoot, { recursive: true, force: true });
  }
});
