import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isInside, parseAddress, parseListeners } from '../src/dev-server.mjs';

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
