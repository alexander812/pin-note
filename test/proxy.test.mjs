import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createReviewServer } from '../src/server.mjs';

const devHtml = `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8"><title>Dev fixture</title></head>
  <body>
    <main id="app"><h1>Dev build</h1></main>
    <script src="/app.js"></script>
  </body>
</html>
`;

let root;
let upstream;
let upstreamUrl;
let review;
let reviewUrl;

async function listen(server) {
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function websocketProbe(url) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(target.port), target.hostname);
    let received = Buffer.alloc(0);
    let upgraded = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('WebSocket proxy timeout'));
    }, 3000);

    const finish = (err, value) => {
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };

    socket.on('error', (err) => finish(err));
    socket.on('connect', () => {
      socket.write(
        `GET /hmr HTTP/1.1\r\n` +
          `Host: ${target.host}\r\n` +
          `Connection: Upgrade\r\n` +
          `Upgrade: websocket\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (!upgraded && received.includes('\r\n\r\n')) {
        upgraded = true;
        socket.write('ping');
        return;
      }
      if (upgraded && received.includes('ping')) {
        finish(null, received.toString('utf8'));
      }
    });
  });
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'pin-note-proxy-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'app.js'), 'const title = "Dev build";\n', 'utf8');

  upstream = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://upstream.local');
    if (url.pathname === '/') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': 'session=1; Domain=localhost; Path=/',
      });
      response.end(devHtml);
      return;
    }
    if (url.pathname === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end('console.log("upstream asset");\n');
      return;
    }
    if (url.pathname === '/gzip') {
      const body = gzipSync(Buffer.from('<html><body><h2>Gzip page</h2></body></html>'));
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': String(body.length),
      });
      response.end(body);
      return;
    }
    if (url.pathname === '/redirect') {
      response.writeHead(302, { Location: `${upstreamUrl}/target` });
      response.end();
      return;
    }
    if (url.pathname === '/target') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('redirect target');
      return;
    }
    if (url.pathname === '/drop') {
      request.socket.destroy();
      return;
    }
    if (url.pathname === '/__review/config') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ project: 'upstream' }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('upstream 404');
  });

  upstream.on('upgrade', (request, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n\r\n'
    );
    socket.on('data', (chunk) => socket.write(chunk));
  });

  upstreamUrl = await listen(upstream);
  review = await createReviewServer({ root, target: upstreamUrl, watch: false });
  reviewUrl = (await review.listen(0, '127.0.0.1')).url;
});

after(async () => {
  await review.close();
  await new Promise((resolvePromise) => {
    upstream.close(() => resolvePromise());
    upstream.closeAllConnections?.();
  });
  await rm(root, { recursive: true, force: true });
});

test('proxies HTML and injects the review client', async () => {
  const response = await fetch(`${reviewUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /Dev build/);
  assert.match(html, /\/__review\/client\.js/);
  assert.match(html, /data-pin-note/);
  const cookie = response.headers.get('set-cookie') || '';
  assert.match(cookie, /session=1/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test('proxies assets unchanged', async () => {
  const response = await fetch(`${reviewUrl}/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.match(await response.text(), /upstream asset/);
});

test('keeps review API local and does not forward it upstream', async () => {
  const response = await fetch(`${reviewUrl}/__review/config`);
  const config = await response.json();
  assert.equal(config.project, root.split('/').pop());
});

test('rewrites absolute redirects to the proxy origin', async () => {
  const response = await fetch(`${reviewUrl}/redirect`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/target');
});

test('decodes compressed HTML before injecting the client', async () => {
  const response = await fetch(`${reviewUrl}/gzip`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Gzip page/);
  assert.match(html, /data-pin-note/);
});

test('returns 502 when the dev server drops the connection', async () => {
  const response = await fetch(`${reviewUrl}/drop`);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /Не удалось подключиться/);
});

test('proxies WebSocket upgrades', async () => {
  const response = await websocketProbe(reviewUrl);
  assert.match(response, /101 Switching Protocols/);
  assert.match(response, /ping/);
});
