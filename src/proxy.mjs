import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  brotliDecompressSync,
  gunzipSync,
  inflateRawSync,
  inflateSync,
} from 'node:zlib';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const BODYLESS_STATUS = new Set([204, 304]);

function normalizeTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Некорректный target: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Target должен начинаться с http:// или https://');
  }
  url.hash = '';
  return url;
}

function joinPath(target, requestUrl) {
  const incoming = new URL(requestUrl || '/', 'http://pin-note.local');
  const base = target.pathname.replace(/\/+$/, '');
  const path = incoming.pathname.startsWith('/') ? incoming.pathname : `/${incoming.pathname}`;
  const joined = base ? `${base}${path === '/' ? '/' : path}` : path;
  return `${joined}${incoming.search}`;
}

function proxyOrigin(request) {
  return `http://${request.headers.host || '127.0.0.1'}`;
}

function rewriteOrigin(value, from, to) {
  if (!value) return value;
  if (value === from) return to;
  if (value.startsWith(`${from}/`)) return `${to}${value.slice(from.length)}`;
  return value;
}

function requestHeaders(request, target) {
  const from = proxyOrigin(request);
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || HOP_BY_HOP.has(lower)) continue;
    headers[key] = value;
  }
  headers.host = target.host;
  headers['accept-encoding'] = 'identity';
  if (headers.origin) headers.origin = rewriteOrigin(headers.origin, from, target.origin);
  if (headers.referer) headers.referer = rewriteOrigin(headers.referer, from, target.origin);
  return headers;
}

function upgradeHeaders(request, target) {
  const headers = requestHeaders(request, target);
  headers.connection = 'Upgrade';
  headers.upgrade = request.headers.upgrade || 'websocket';
  return headers;
}

function responseHeaders(upstreamResponse) {
  const headers = {};
  for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
    const key = String(upstreamResponse.rawHeaders[index]).toLowerCase();
    const value = upstreamResponse.rawHeaders[index + 1];
    if (HOP_BY_HOP.has(key)) continue;
    if (key === 'set-cookie') {
      if (!headers[key]) headers[key] = [];
      headers[key].push(value);
    } else if (headers[key] === undefined) {
      headers[key] = value;
    } else if (Array.isArray(headers[key])) {
      headers[key].push(value);
    } else {
      headers[key] = [headers[key], value];
    }
  }
  return headers;
}

function rewriteLocation(value, target) {
  try {
    const location = new URL(value, target);
    if (location.origin === target.origin) {
      return `${location.pathname}${location.search}${location.hash}`;
    }
  } catch {
    // Leave malformed locations untouched.
  }
  return value;
}

function rewriteResponseHeaders(headers, request, target) {
  const origin = proxyOrigin(request);
  if (typeof headers.location === 'string') {
    headers.location = rewriteLocation(headers.location, target);
  }
  if (Array.isArray(headers['set-cookie'])) {
    headers['set-cookie'] = headers['set-cookie'].map((cookie) =>
      cookie.replace(/;\s*Domain=[^;]*/i, '')
    );
  }
  if (headers['access-control-allow-origin'] === target.origin) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

function decodeBody(buffer, encoding) {
  const value = String(encoding || '').trim().toLowerCase();
  if (!value || value === 'identity') return buffer;
  try {
    const encodings = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .reverse();
    let result = buffer;
    for (const item of encodings) {
      if (item === 'gzip' || item === 'x-gzip') {
        result = gunzipSync(result);
      } else if (item === 'deflate') {
        try {
          result = inflateSync(result);
        } catch {
          result = inflateRawSync(result);
        }
      } else if (item === 'br') {
        result = brotliDecompressSync(result);
      } else {
        return null;
      }
    }
    return result;
  } catch {
    return null;
  }
}

function rawStatusLine(response) {
  const status = response.statusCode || 502;
  return `HTTP/1.1 ${status} ${response.statusMessage || 'Bad Gateway'}`;
}

function rawHeaderLines(response) {
  const lines = [];
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    lines.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`);
  }
  return lines;
}

export function createProxy({ target, injectClient }) {
  const targetUrl = normalizeTarget(target);
  const transport = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;

  const upstreamRequest = (request, headers, path) =>
    transport({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname.replace(/^\[|\]$/g, ''),
      port: targetUrl.port || undefined,
      method: request.method,
      path,
      headers,
      agent: false,
    });

  const handleHttp = (request, response) => {
    const upstream = upstreamRequest(
      request,
      requestHeaders(request, targetUrl),
      joinPath(targetUrl, request.url)
    );
    let responded = false;

    upstream.on('response', (upstreamResponse) => {
      responded = true;
      if (response.destroyed || response.writableEnded) {
        upstreamResponse.destroy();
        return;
      }
      const headers = rewriteResponseHeaders(responseHeaders(upstreamResponse), request, targetUrl);
      const contentType = String(upstreamResponse.headers['content-type'] || '');
      const shouldInject =
        request.method !== 'HEAD' &&
        /text\/html/i.test(contentType) &&
        !BODYLESS_STATUS.has(upstreamResponse.statusCode || 0);

      if (!shouldInject) {
        response.writeHead(upstreamResponse.statusCode || 502, headers);
        upstreamResponse.pipe(response);
        return;
      }

      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        if (response.destroyed || response.writableEnded) return;
        const raw = Buffer.concat(chunks);
        const decoded = decodeBody(raw, upstreamResponse.headers['content-encoding']);
        if (!decoded) {
          response.writeHead(upstreamResponse.statusCode || 502, headers);
          response.end(raw);
          return;
        }
        const body = Buffer.from(injectClient(decoded.toString('utf8')), 'utf8');
        delete headers['content-length'];
        delete headers['content-encoding'];
        headers['content-length'] = String(body.length);
        response.writeHead(upstreamResponse.statusCode || 502, headers);
        response.end(body);
      });
      upstreamResponse.on('error', () => response.destroy());
    });

    upstream.on('error', (err) => {
      if (responded) {
        response.destroy();
        return;
      }
      if (response.destroyed || response.writableEnded) return;
      if (!response.headersSent) {
        response.writeHead(502, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(`Не удалось подключиться к ${targetUrl.origin}: ${err.message}\n`);
      } else {
        response.destroy();
      }
    });

    response.on('close', () => {
      if (!response.writableEnded) upstream.destroy();
    });

    request.pipe(upstream);
  };

  const handleUpgrade = (request, socket, head) => {
    const upstream = upstreamRequest(
      request,
      upgradeHeaders(request, targetUrl),
      joinPath(targetUrl, request.url)
    );
    let settled = false;

    upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      settled = true;
      const lines = [rawStatusLine(upstreamResponse), ...rawHeaderLines(upstreamResponse)];
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (upstreamHead?.length) socket.write(upstreamHead);
      if (head?.length) upstreamSocket.write(head);

      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);

      upstreamSocket.on('error', () => socket.destroy());
      upstreamSocket.on('close', () => socket.destroy());
      socket.on('error', () => upstreamSocket.destroy());
      socket.on('close', () => upstreamSocket.destroy());
    });

    upstream.on('response', (upstreamResponse) => {
      settled = true;
      const lines = [rawStatusLine(upstreamResponse), ...rawHeaderLines(upstreamResponse)];
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      upstreamResponse.pipe(socket);
    });

    upstream.on('error', (err) => {
      if (settled) {
        socket.destroy();
        return;
      }
      const message = `Bad Gateway: ${err.message}`;
      socket.write(
        `HTTP/1.1 502 Bad Gateway\r\n` +
          `Content-Type: text/plain; charset=utf-8\r\n` +
          `Content-Length: ${Buffer.byteLength(message)}\r\n` +
          `Connection: close\r\n\r\n${message}`
      );
      socket.destroy();
    });

    upstream.end();
  };

  return { target: targetUrl, handleHttp, handleUpgrade };
}
