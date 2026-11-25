import { createHash } from 'node:crypto';
import { createReadStream, watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBasePath } from './base-path.mjs';
import { buildReworkPrompt, buildTaskPrompt, resolveAgentConfig } from './agent.mjs';
import { AgentRunner } from './agent-runner.mjs';
import { createProxy } from './proxy.mjs';
import { isOpenStatus } from './shared.mjs';
import { ReviewStore } from './store.mjs';

const VERSION = '0.1.0';
const CLIENT_DIR = dirname(fileURLToPath(import.meta.url));
const API_PREFIX = '/__review/';
const MAX_BODY = 512 * 1024;
const MAX_SCREENSHOT = 12 * 1024 * 1024;
const MAX_ATTACHMENT = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.pdf', 'application/pdf'],
]);

const WATCH_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.woff',
  '.woff2',
]);

const IGNORED_WATCH_PREFIXES = [
  '.git/',
  '.review/',
  'node_modules/',
  '.next/',
  '.nuxt/',
  '.cache/',
  '.turbo/',
  '.vercel/',
];

function mimeType(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function sendJson(response, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sendText(response, status, value, contentType = 'text/plain; charset=utf-8') {
  const body = String(value);
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function injectClient(html) {
  if (html.includes('data-pin-note')) return html;
  const snippet = '<script type="module" src="/__review/client.js" data-pin-note></script>';
  const lower = html.toLowerCase();
  const bodyIndex = lower.lastIndexOf('</body>');
  if (bodyIndex !== -1) return `${html.slice(0, bodyIndex)}${snippet}${html.slice(bodyIndex)}`;
  const htmlIndex = lower.lastIndexOf('</html>');
  if (htmlIndex !== -1) return `${html.slice(0, htmlIndex)}${snippet}${html.slice(htmlIndex)}`;
  return `${html}${snippet}`;
}

function isHtmlPath(filePath) {
  const extension = extname(filePath).toLowerCase();
  return extension === '.html' || extension === '.htm';
}

function safeRelativePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const withoutLeading = decoded.replace(/^\/+/, '');
  const normalized = resolve('/', withoutLeading).replace(/^\/+/, '');
  return normalized;
}

function readJson(request) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolvePromise({});
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Ожидался JSON-объект');
        }
        resolvePromise(parsed);
      } catch (err) {
        reject(Object.assign(new Error(`Некорректный JSON: ${err.message}`), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function readBinary(request, limit, label = 'Файл') {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error(`${label} слишком большой`), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolvePromise(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function screenshotExtension(buffer, contentType) {
  const type = String(contentType || '').toLowerCase();
  if (
    type.includes('image/png') &&
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return 'png';
  }
  if (type.includes('image/jpeg') && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'jpg';
  }
  if (
    type.includes('image/webp') &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function safeDownloadName(value) {
  const name = String(value || '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .trim()
    .slice(0, 240);
  return name || 'file';
}

function contentDisposition(name, inline = false) {
  const safe = safeDownloadName(name);
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isInlineImage(name) {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(
    extname(String(name || '')).toLowerCase()
  );
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== request.headers.host) {
      throw Object.assign(new Error('Cross-origin запросы к review API запрещены'), { status: 403 });
    }
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error('Некорректный Origin'), { status: 403 });
  }
}

function requireJson(request) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('Ожидался Content-Type: application/json'), { status: 415 });
  }
}

function debounce(fn, delay) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export async function createReviewServer(options = {}) {
  const root = resolve(options.root || process.cwd());
  const sourceRoot = resolve(options.sourceRoot || root);
  const dataDir = resolve(options.dataDir || join(root, '.review'));
  const projectId = createHash('sha1').update(root).digest('hex').slice(0, 16);
  const watchFiles = options.watch !== false;
  const watchRoot = watchFiles && !options.target;
  const spa = Boolean(options.spa);
  const basePath = normalizeBasePath(options.basePath);
  const proxy = options.target ? createProxy({ target: options.target, injectClient }) : null;
  const store = new ReviewStore({ root, dataDir, sourceRoot });
  await store.init();
  const agentConfig = options.agent
    ? await resolveAgentConfig({ options: options.agent, dataDir, root })
    : null;

  const clients = new Set();
  let watchHandle = null;
  let dataWatchHandle = null;
  let pollTimer = null;
  let heartbeatTimer = null;
  let lastEntryMtime = null;
  let closed = false;
  let url = '';

  const broadcast = (event, payload = {}) => {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of clients) {
      try {
        response.write(chunk);
      } catch {
        clients.delete(response);
      }
    }
  };

  const agentBatch = { queue: [], current: null };

  const agentRunner = agentConfig
    ? new AgentRunner({
        root,
        store,
        config: agentConfig,
        onEvent: (payload) => {
          broadcast('agent', payload);
          if (
            agentBatch.current &&
            payload.taskId === agentBatch.current &&
            ['completed', 'error', 'cancelled', 'idle'].includes(payload.status)
          ) {
            agentBatch.current = null;
            startNextAgentBatchTask().catch((err) => {
              console.error(`[pin-note] пакетный запуск агента: ${err.message}`);
            });
          }
        },
      })
    : null;

  function clearAgentBatch() {
    agentBatch.queue = [];
    agentBatch.current = null;
  }

  function agentBatchEligible(state) {
    return [...state.tasks]
      .filter((task) => task.status !== 'closed')
      .filter((task) => {
        const comments = state.comments.filter((comment) => comment.taskId === task.id);
        return comments.some((comment) => isOpenStatus(comment.status));
      })
      .sort((left, right) => left.number - right.number);
  }

  async function startNextAgentBatchTask() {
    if (!agentRunner?.enabled || closed) return;
    if (agentBatch.current) return;
    while (agentBatch.queue.length > 0) {
      const taskId = agentBatch.queue.shift();
      let state;
      try {
        state = await store.read();
      } catch (err) {
        console.error(`[pin-note] пакетный запуск агента: ${err.message}`);
        break;
      }
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task || task.status === 'closed') continue;
      const comments = state.comments.filter((comment) => comment.taskId === task.id);
      if (!comments.some((comment) => isOpenStatus(comment.status))) continue;
      const mode = comments.some((comment) => comment.status === 'rejected') ? 'rework' : 'task';
      const focusComment =
        comments.find((comment) => comment.status === 'rejected') ||
        comments.find((comment) => isOpenStatus(comment.status)) ||
        null;
      const providerLabel = agentRunner.publicConfig().label;
      const prompt =
        mode === 'rework'
          ? buildReworkPrompt({
              task,
              comments,
              project: root,
              dataDir: store.dataDir,
              providerLabel,
            })
          : buildTaskPrompt({
              task,
              comments,
              project: root,
              dataDir: store.dataDir,
              providerLabel,
            });
      agentBatch.current = task.id;
      try {
        agentRunner.dispatch(task, {
          prompt,
          mode,
          commentId: focusComment?.id || null,
          replaceQueued: mode === 'rework',
        });
      } catch (err) {
        agentBatch.current = null;
        console.error(`[pin-note] пакетный запуск агента: ${err.message}`);
        continue;
      }
      return;
    }
    agentBatch.current = null;
  }

  const notifyReload = debounce(() => {
    broadcast('reload', { at: Date.now() });
  }, 220);

  const notifyComments = debounce(async () => {
    try {
      const data = await store.read();
      await store.writeFeedback(data);
    } catch (err) {
      console.error(`[pin-note] не удалось обновить feedback.md: ${err.message}`);
    }
    broadcast('comments', { at: Date.now() });
  }, 140);

  const startPolling = () => {
    if (pollTimer) return;
    const poll = async () => {
      try {
        const info = await stat(join(root, 'index.html'));
        if (lastEntryMtime !== null && info.mtimeMs !== lastEntryMtime) notifyReload();
        lastEntryMtime = info.mtimeMs;
      } catch {
        // Entry file may not exist (for example, a SPA shell elsewhere).
      }
    };
    poll();
    pollTimer = setInterval(poll, 800);
    pollTimer.unref?.();
  };

  const onWatchEvent = (event, filename) => {
    if (!filename) return;
    const rel = String(filename).replaceAll('\\', '/');
    const base = rel.split('/').pop() || '';

    if (rel.startsWith('.review/') || rel === '.review') return;
    if (IGNORED_WATCH_PREFIXES.some((prefix) => rel.startsWith(prefix))) return;
    const extension = extname(base).toLowerCase();
    if (WATCH_EXTENSIONS.has(extension)) notifyReload();
  };

  const onDataWatchEvent = (event, filename) => {
    if (!filename) return;
    const base = String(filename).replaceAll('\\', '/').split('/').pop() || '';
    if (base === 'comments.json') notifyComments();
  };

  const startDataWatching = () => {
    if (!watchFiles) return;
    try {
      dataWatchHandle = watch(dataDir, { recursive: false }, onDataWatchEvent);
      dataWatchHandle.on('error', (err) => {
        console.warn(`[pin-note] watcher данных: ${err.message}`);
        dataWatchHandle = null;
      });
    } catch (err) {
      console.warn(`[pin-note] watcher данных недоступен: ${err.message}`);
    }
  };

  const startWatching = () => {
    if (!watchFiles) return;
    if (watchRoot) {
      try {
        watchHandle = watch(root, { recursive: true }, onWatchEvent);
        watchHandle.on('error', (err) => {
          console.warn(`[pin-note] file watcher: ${err.message}`);
          startPolling();
        });
      } catch (err) {
        console.warn(`[pin-note] file watcher недоступен: ${err.message}`);
        startPolling();
      }
    }
    startDataWatching();
  };

  const stopWatching = () => {
    if (watchHandle) {
      try {
        watchHandle.close();
      } catch {
        // Ignore.
      }
      watchHandle = null;
    }
    if (dataWatchHandle) {
      try {
        dataWatchHandle.close();
      } catch {
        // Ignore.
      }
      dataWatchHandle = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  startWatching();

  const handleSse = (request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 1500\n\n');
    response.write('event: hello\ndata: {}\n\n');
    clients.add(response);
    request.on('close', () => {
      clients.delete(response);
    });
  };

  const handleStatic = async (request, response, pathname) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    let relativePath;
    try {
      relativePath = safeRelativePath(pathname);
    } catch {
      sendText(response, 400, 'Bad Request');
      return;
    }

    if (
      relativePath === '.review' ||
      relativePath.startsWith('.review/') ||
      relativePath === '.git' ||
      relativePath.startsWith('.git/')
    ) {
      sendText(response, 404, 'Not Found');
      return;
    }

    let filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    let info;
    try {
      info = await stat(filePath);
    } catch {
      info = null;
    }

    if (info?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        const location = `${pathname}/${new URL(request.url || '/', 'http://localhost').search}`;
        response.writeHead(301, { Location: location });
        response.end();
        return;
      }
      filePath = join(filePath, 'index.html');
      try {
        info = await stat(filePath);
      } catch {
        info = null;
      }
    }

    if (!info?.isFile()) {
      if (spa && (request.headers.accept || '').includes('text/html')) {
        await serveIndex(request, response);
        return;
      }
      sendText(response, 404, 'Not Found');
      return;
    }

    if (isHtmlPath(filePath)) {
      let html;
      try {
        html = await readFile(filePath, 'utf8');
      } catch {
        sendText(response, 500, 'Internal Server Error');
        return;
      }
      const body = injectClient(html);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeType(filePath),
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  };

  const serveIndex = async (request, response) => {
    const indexPath = join(root, 'index.html');
    let html;
    try {
      html = await readFile(indexPath, 'utf8');
    } catch {
      sendText(response, 404, 'index.html not found');
      return;
    }
    const body = injectClient(html);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  };

  const handleReview = async (request, response, pathname, searchParams) => {
    const route = pathname.slice(API_PREFIX.length);
    const method = request.method || 'GET';

    if (method === 'GET' && route === 'config') {
      sendJson(response, 200, {
        version: VERSION,
        project: store.project,
        projectId,
        commentsFile: relative(root, store.commentsFile),
        feedbackFile: relative(root, store.feedbackFile),
        instructionsFile: relative(root, store.instructionsFile),
        screenshotsDir: relative(root, store.screenshotsDir),
        attachmentsDir: relative(root, store.attachmentsDir),
        activeTask: await store.currentTask(),
        agent: agentRunner
          ? agentRunner.publicConfig()
          : {
              enabled: false,
              provider: 'off',
              label: 'AI-агент',
              reason: 'Агент не настроен для этого запуска PinNote.',
            },
        capabilities: {
          sourceHints: true,
          screenshots: true,
          canvasArea: false,
          maxScreenshotBytes: MAX_SCREENSHOT,
          attachments: true,
          maxAttachmentBytes: MAX_ATTACHMENT,
          maxAttachments: 10,
        },
      });
      return;
    }

    if (method === 'GET' && route === 'state') {
      sendJson(response, 200, await store.read());
      return;
    }

    if (method === 'GET' && route === 'tasks') {
      sendJson(response, 200, {
        tasks: await store.listTasks(),
        activeTask: await store.currentTask(),
      });
      return;
    }

    if (method === 'POST' && route === 'tasks') {
      assertSameOrigin(request);
      requireJson(request);
      const body = await readJson(request);
      const task = await store.createTask({ description: body.description });
      notifyComments();
      sendJson(response, 201, { task });
      return;
    }

    if (method === 'GET' && route === 'agent') {
      sendJson(response, 200, {
        config: agentRunner
          ? agentRunner.publicConfig()
          : {
              enabled: false,
              provider: 'off',
              label: 'AI-агент',
              reason: 'Агент не настроен для этого запуска PinNote.',
            },
        tasks: agentRunner ? agentRunner.list() : [],
      });
      return;
    }

    if (method === 'POST' && route === 'agent/dispatch') {
      assertSameOrigin(request);
      requireJson(request);
      const body = await readJson(request);
      if (!agentRunner?.enabled) {
        sendJson(response, 409, {
          error: agentRunner?.publicConfig().reason || 'Агент не настроен',
        });
        return;
      }
      const busy = agentRunner
        .list()
        .some((item) => item.status === 'running' || item.status === 'queued');
      if (busy || agentBatch.current || agentBatch.queue.length > 0) {
        sendJson(response, 409, {
          error: 'Агент уже работает — дождитесь завершения или остановите его',
        });
        return;
      }
      const state = await store.read();
      const eligible = agentBatchEligible(state);
      if (eligible.length === 0) {
        sendJson(response, 409, { error: 'Нет задач с правками в работе' });
        return;
      }
      const preferredId = String(body.taskId || '').trim();
      const ordered = [...eligible];
      const preferredIndex = preferredId
        ? ordered.findIndex((task) => task.id === preferredId)
        : -1;
      if (preferredIndex > 0) ordered.unshift(ordered.splice(preferredIndex, 1)[0]);
      agentBatch.queue = ordered.map((task) => task.id);
      agentBatch.current = null;
      await startNextAgentBatchTask();
      sendJson(response, 200, {
        queued: ordered.length,
        tasks: ordered.map((task) => ({ id: task.id, number: task.number })),
        agent: agentBatch.current ? agentRunner.snapshot(agentBatch.current) : null,
      });
      return;
    }

    const taskActionRoute = /^tasks\/([^/]+)\/(submit|close|accept)$/.exec(route);
    if (taskActionRoute && method === 'POST') {
      assertSameOrigin(request);
      const taskRef = decodeURIComponent(taskActionRoute[1]);
      const action = taskActionRoute[2];
      const task =
        action === 'submit'
          ? await store.submitTask(taskRef)
          : action === 'accept'
            ? await store.acceptTask(taskRef)
            : await store.closeTask(taskRef);
      if (action !== 'submit' && agentRunner) agentRunner.cancel(task.id);
      notifyComments();
      sendJson(response, 200, { task });
      return;
    }

    const agentCancelRoute = /^tasks\/([^/]+)\/agent\/cancel$/.exec(route);
    if (agentCancelRoute && method === 'POST') {
      assertSameOrigin(request);
      const taskRef = decodeURIComponent(agentCancelRoute[1]);
      const task = await store.getTask(taskRef);
      if (!task) {
        sendJson(response, 404, { error: 'Задача не найдена' });
        return;
      }
      if (!agentRunner?.enabled) {
        sendJson(response, 409, { error: agentRunner?.publicConfig().reason || 'Агент не настроен' });
        return;
      }
      clearAgentBatch();
      sendJson(response, 200, { agent: agentRunner.cancel(task.id) });
      return;
    }

    const agentRoute = /^tasks\/([^/]+)\/agent$/.exec(route);
    if (agentRoute) {
      const taskRef = decodeURIComponent(agentRoute[1]);
      const task = await store.getTask(taskRef);
      if (!task) {
        sendJson(response, 404, { error: 'Задача не найдена' });
        return;
      }
      if (method === 'GET') {
        sendJson(response, 200, {
          agent: agentRunner
            ? agentRunner.snapshot(task.id, { includeLog: true })
            : {
                taskId: task.id,
                status: 'idle',
                sessionId: null,
                queued: 0,
                error: null,
              },
          config: agentRunner
            ? agentRunner.publicConfig()
            : { enabled: false, provider: 'off', reason: 'Агент не настроен' },
        });
        return;
      }
      if (!agentRunner?.enabled) {
        sendJson(response, 409, {
          error: agentRunner?.publicConfig().reason || 'Агент не настроен',
        });
        return;
      }
      if (method === 'DELETE') {
        assertSameOrigin(request);
        sendJson(response, 200, { agent: await agentRunner.reset(task.id) });
        return;
      }
      if (method === 'POST') {
        assertSameOrigin(request);
        requireJson(request);
        const body = await readJson(request);
        if (task.status === 'closed') {
          sendJson(response, 409, { error: 'Задача уже закрыта' });
          return;
        }
        const state = await store.read();
        const comments = state.comments.filter((comment) => comment.taskId === task.id);
        if (comments.length === 0) {
          sendJson(response, 400, { error: 'В задаче нет комментариев' });
          return;
        }
        const mode = body.mode === 'rework' ? 'rework' : 'task';
        if (mode === 'rework' && !comments.some((comment) => comment.status === 'rejected')) {
          sendJson(response, 400, { error: 'В задаче нет отклонённых комментариев' });
          return;
        }
        const providerLabel = agentRunner.publicConfig().label;
        const prompt =
          mode === 'rework'
            ? buildReworkPrompt({
                task,
                comments,
                project: root,
                dataDir: store.dataDir,
                providerLabel,
              })
            : buildTaskPrompt({
                task,
                comments,
                project: root,
                dataDir: store.dataDir,
                providerLabel,
              });
        const agent = agentRunner.dispatch(task, {
          prompt,
          mode,
          commentId: body.commentId || null,
          replaceQueued: mode === 'rework',
        });
        sendJson(response, 200, { agent });
        return;
      }
    }

    const taskRoute = /^tasks\/([^/]+)$/.exec(route);
    if (taskRoute) {
      const taskRef = decodeURIComponent(taskRoute[1]);
      if (method === 'GET') {
        const task = await store.getTask(taskRef);
        if (!task) {
          sendJson(response, 404, { error: 'Задача не найдена' });
          return;
        }
        const state = await store.read();
        sendJson(response, 200, {
          task,
          comments: state.comments.filter((comment) => comment.taskId === task.id),
        });
        return;
      }
      if (method === 'PATCH') {
        assertSameOrigin(request);
        requireJson(request);
        const body = await readJson(request);
        const task = await store.updateTask(taskRef, body);
        notifyComments();
        sendJson(response, 200, { task });
        return;
      }
      if (method === 'DELETE') {
        assertSameOrigin(request);
        const result = await store.removeTask(taskRef);
        if (agentRunner) agentRunner.cancel(result.task.id);
        notifyComments();
        sendJson(response, 200, result);
        return;
      }
    }

    if (method === 'POST' && route === 'screenshots') {
      assertSameOrigin(request);
      const contentType = String(request.headers['content-type'] || '');
      const buffer = await readBinary(request, MAX_SCREENSHOT, 'Скриншот');
      const extension = screenshotExtension(buffer, contentType);
      if (!buffer.length || !extension) {
        sendJson(response, 415, { error: 'Ожидался PNG, JPEG или WebP' });
        return;
      }
      const width = Number(searchParams.get('width')) || 0;
      const height = Number(searchParams.get('height')) || 0;
      const screenshot = await store.saveScreenshot(buffer, extension, { width, height });
      sendJson(response, 201, { screenshot });
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && route.startsWith('screenshots/')) {
      let name;
      try {
        name = decodeURIComponent(route.slice('screenshots/'.length));
      } catch {
        sendText(response, 400, 'Bad Request');
        return;
      }
      const filePath = store.resolveScreenshot(name);
      if (!filePath) {
        sendText(response, 404, 'Not Found');
        return;
      }
      let info;
      try {
        info = await stat(filePath);
      } catch {
        sendText(response, 404, 'Not Found');
        return;
      }
      if (!info.isFile()) {
        sendText(response, 404, 'Not Found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': store.screenshotContentType(name),
        'Content-Length': info.size,
        'Cache-Control': 'private, max-age=3600',
      });
      if (method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
      return;
    }

    if (method === 'POST' && route === 'attachments') {
      assertSameOrigin(request);
      const buffer = await readBinary(request, MAX_ATTACHMENT, 'Файл');
      if (!buffer.length) {
        sendJson(response, 400, { error: 'Пустой файл' });
        return;
      }
      const name = searchParams.get('name') || 'file';
      const type = searchParams.get('type') || request.headers['content-type'] || '';
      const attachment = await store.saveAttachment(buffer, { name, type, size: buffer.length });
      sendJson(response, 201, { attachment });
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && route.startsWith('attachments/')) {
      let name;
      try {
        name = decodeURIComponent(route.slice('attachments/'.length));
      } catch {
        sendText(response, 400, 'Bad Request');
        return;
      }
      const filePath = store.resolveAttachment(name);
      if (!filePath) {
        sendText(response, 404, 'Not Found');
        return;
      }
      let info;
      try {
        info = await stat(filePath);
      } catch {
        sendText(response, 404, 'Not Found');
        return;
      }
      if (!info.isFile()) {
        sendText(response, 404, 'Not Found');
        return;
      }
      const downloadName = searchParams.get('name') || basename(name);
      response.writeHead(200, {
        'Content-Type': store.attachmentContentType(name),
        'Content-Length': info.size,
        'Content-Disposition': contentDisposition(downloadName, isInlineImage(name)),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      });
      if (method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
      return;
    }

    if (method === 'GET' && route === 'comments') {
      sendJson(response, 200, await store.read());
      return;
    }

    if (method === 'GET' && route === 'export.md') {
      const status = searchParams.get('status') || undefined;
      const task = searchParams.get('task') || 'current';
      const markdown = await store.exportMarkdown({ status, task });
      sendText(response, 200, markdown, 'text/markdown; charset=utf-8');
      return;
    }

    if (method === 'GET' && route === 'events') {
      handleSse(request, response);
      return;
    }

    if (
      method === 'GET' &&
      (route === 'client.js' || route === 'shared.js' || route === 'i18n.js' || route === 'client.css')
    ) {
      const fileName = route === 'shared.js' ? 'shared.mjs' : route;
      await sendAsset(response, join(CLIENT_DIR, fileName));
      return;
    }

    if (method === 'POST' && route === 'comments') {
      assertSameOrigin(request);
      requireJson(request);
      const body = await readJson(request);
      const comment = await store.add(body);
      const task = await store.getTask(comment.taskId);
      notifyComments();
      sendJson(response, 201, { comment, task });
      return;
    }

    const replyRoute = /^comments\/([^/]+)\/messages$/.exec(route);
    if (replyRoute && method === 'POST') {
      assertSameOrigin(request);
      requireJson(request);
      const body = await readJson(request);
      if (body.dispatchAgent && !agentRunner?.enabled) {
        sendJson(response, 409, {
          error: agentRunner?.publicConfig().reason || 'Агент не настроен',
        });
        return;
      }
      const id = decodeURIComponent(replyRoute[1]);
      const result = await store.reply(id, body.text ?? body.message, {
        attachments: body.attachments,
      });
      let agent = null;
      if (body.dispatchAgent && agentRunner?.enabled) {
        const state = await store.read();
        const task = state.tasks.find((item) => item.id === result.comment.taskId);
        if (task && task.status !== 'closed') {
          const comments = state.comments.filter((item) => item.taskId === task.id);
          const providerLabel = agentRunner.publicConfig().label;
          const mode = comments.some((item) => item.status === 'rejected') ? 'rework' : 'task';
          const prompt =
            mode === 'rework'
              ? buildReworkPrompt({
                  task,
                  comments,
                  project: root,
                  dataDir: store.dataDir,
                  providerLabel,
                })
              : buildTaskPrompt({
                  task,
                  comments,
                  project: root,
                  dataDir: store.dataDir,
                  providerLabel,
                });
          agent = agentRunner.dispatch(task, {
            prompt,
            mode,
            commentId: result.comment.id,
            replaceQueued: mode === 'rework',
          });
        }
      }
      notifyComments();
      sendJson(response, 200, { ...result, agent });
      return;
    }

    const messageRoute = /^comments\/([^/]+)\/messages\/([^/]+)$/.exec(route);
    if (messageRoute && method === 'PATCH') {
      assertSameOrigin(request);
      requireJson(request);
      const body = await readJson(request);
      const commentId = decodeURIComponent(messageRoute[1]);
      const messageId = decodeURIComponent(messageRoute[2]);
      const result = await store.updateMessage(commentId, messageId, body);
      notifyComments();
      sendJson(response, 200, result);
      return;
    }

    const reopenRoute = /^comments\/([^/]+)\/reopen$/.exec(route);
    if (reopenRoute && method === 'POST') {
      assertSameOrigin(request);
      const id = decodeURIComponent(reopenRoute[1]);
      const result = await store.reopenComment(id);
      notifyComments();
      sendJson(response, 200, result);
      return;
    }

    const commentRoute = /^comments\/([^/]+)$/.exec(route);
    if (commentRoute) {
      const id = decodeURIComponent(commentRoute[1]);
      if (method === 'PATCH') {
        assertSameOrigin(request);
        requireJson(request);
        const body = await readJson(request);
        const comment = await store.update(id, body);
        let agent = null;
        const agentConfigPublic = agentRunner?.publicConfig();
        if (
          comment.status === 'rejected' &&
          agentRunner?.enabled &&
          agentConfigPublic?.autoRework &&
          body.dispatchAgent !== false
        ) {
          const state = await store.read();
          const task = state.tasks.find((item) => item.id === comment.taskId);
          if (task && task.status !== 'closed') {
            const comments = state.comments.filter((item) => item.taskId === task.id);
            const prompt = buildReworkPrompt({
              task,
              comments,
              project: root,
              dataDir: store.dataDir,
              providerLabel: agentConfigPublic.label,
            });
            agent = agentRunner.dispatch(task, {
              prompt,
              mode: 'rework',
              commentId: comment.id,
              replaceQueued: true,
            });
          }
        }
        notifyComments();
        sendJson(response, 200, { comment, agent });
        return;
      }
      if (method === 'DELETE') {
        assertSameOrigin(request);
        const comment = await store.remove(id);
        notifyComments();
        sendJson(response, 200, { comment });
        return;
      }
    }

    sendJson(response, 404, { error: 'Неизвестный маршрут review API' });
  };

  const handleRequest = async (request, response) => {
    try {
      const origin = `http://${request.headers.host || 'localhost'}`;
      const parsed = new URL(request.url || '/', origin);
      if (parsed.pathname.startsWith(API_PREFIX)) {
        await handleReview(request, response, parsed.pathname, parsed.searchParams);
        return;
      }
      if (
        proxy &&
        basePath &&
        parsed.pathname === '/' &&
        (request.method === 'GET' || request.method === 'HEAD')
      ) {
        response.writeHead(302, {
          Location: `${basePath}${parsed.search}`,
          'Cache-Control': 'no-store',
        });
        response.end();
        return;
      }
      if (proxy) {
        proxy.handleHttp(request, response);
        return;
      }
      await handleStatic(request, response, parsed.pathname);
    } catch (err) {
      const status = Number(err?.status) || 500;
      if (status >= 500) {
        console.error('[pin-note]', err);
      }
      if (!response.headersSent) {
        const payload = { error: err?.message || 'Internal Server Error' };
        if (err?.details) payload.details = err.details;
        sendJson(response, status, payload);
      } else {
        response.destroy();
      }
    }
  };

  const upgradeSockets = new Set();
  const server = createServer(handleRequest);

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    if (!proxy) {
      socket.destroy();
      return;
    }
    upgradeSockets.add(socket);
    socket.on('close', () => upgradeSockets.delete(socket));
    try {
      proxy.handleUpgrade(request, socket, head);
    } catch {
      socket.destroy();
    }
  });

  const listen = async (port = options.port ?? 4174, host = options.host || '127.0.0.1') => {
    await new Promise((resolvePromise, reject) => {
      const onError = (err) => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        resolvePromise();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const displayHost = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    url = `http://${displayHost}:${actualPort}`;
    return { url, port: actualPort, host: displayHost };
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    clearAgentBatch();
    notifyReload.cancel();
    notifyComments.cancel();
    stopWatching();
    if (agentRunner) await agentRunner.close();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    for (const response of clients) {
      try {
        response.end();
      } catch {
        // Ignore.
      }
    }
    clients.clear();
    for (const socket of upgradeSockets) {
      try {
        socket.destroy();
      } catch {
        // Ignore.
      }
    }
    upgradeSockets.clear();
    await new Promise((resolvePromise) => {
      server.close(() => resolvePromise());
      server.closeAllConnections?.();
    });
  };

  heartbeatTimer = setInterval(() => {
    for (const response of clients) {
      try {
        response.write(': ping\n\n');
      } catch {
        clients.delete(response);
      }
    }
  }, 20000);
  heartbeatTimer.unref?.();

  return {
    server,
    store,
    root,
    dataDir,
    listen,
    close,
    broadcast,
    agent: agentRunner,
    basePath,
    target: proxy?.target?.href || null,
    get url() {
      return url;
    },
  };
}

async function sendAsset(response, filePath) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    sendText(response, 404, 'Not Found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mimeType(filePath),
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(response);
}
