import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEV_COMMAND = /(vite|astro|next|nuxt|remix|svelte|webpack|parcel|angular|react-scripts|vue-cli-service|http-server|live-server|\bnode\b|\bbun\b|\bdeno\b|\bpython[\d.]*\b|\bruby\b|\bphp\b|\bgo\b|\bcargo\b|\bdotnet\b|\bjava\b)/i;
const FRAMEWORK_COMMAND = /(vite|astro|next|nuxt|remix|svelte|webpack|parcel|angular|react-scripts|vue-cli-service|http-server|live-server)/i;
const PIN_NOTE_COMMAND = /(?:^|[\s/])pin-note(?:\.mjs)?(?:\s|$)/i;

function scoreCandidate(command) {
  let score = 0;
  if (FRAMEWORK_COMMAND.test(command)) score += 6;
  if (/\bdev\b/i.test(command)) score += 3;
  if (/\bpreview\b/i.test(command)) score -= 10;
  return score;
}

export function parseAddress(value) {
  const text = String(value || '').trim().replace(/^n/, '');
  const colon = text.lastIndexOf(':');
  if (colon === -1) return null;
  const host = text.slice(0, colon);
  const port = Number(text.slice(colon + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

export function parseListeners(output) {
  const entries = new Map();
  let current = null;
  for (const raw of String(output || '').split('\n')) {
    if (!raw) continue;
    const tag = raw[0];
    const value = raw.slice(1);
    if (tag === 'p') {
      const pid = Number(value);
      if (!Number.isInteger(pid)) continue;
      current = entries.get(pid) || { pid, command: '', addresses: [] };
      entries.set(pid, current);
    } else if (!current) {
      continue;
    } else if (tag === 'c') {
      current.command = value;
    } else if (tag === 'n') {
      current.addresses.push(value);
    }
  }

  return [...entries.values()]
    .map((entry) => ({
      pid: entry.pid,
      command: entry.command,
      sockets: entry.addresses
        .map(parseAddress)
        .filter((socket) => socket && socket.port >= 1024),
    }))
    .filter((entry) => entry.sockets.length > 0);
}

export function isInside(root, directory) {
  return directory === root || directory.startsWith(`${root}${sep}`);
}

function displayHost(host) {
  const value = String(host || '').replace(/^\[|\]$/g, '');
  if (!value || value === '*' || value === '0.0.0.0' || value === '::') return '127.0.0.1';
  if (value === '::1') return '[::1]';
  if (value.includes(':')) return `[${value}]`;
  return value;
}

async function processDetails(pids) {
  const details = new Map();
  if (pids.length === 0) return details;

  try {
    const { stdout } = await execFileAsync(
      'ps',
      ['-p', pids.join(','), '-o', 'pid=,command='],
      { timeout: 3000, maxBuffer: 1024 * 1024 }
    );
    for (const line of stdout.split('\n')) {
      const match = /^\s*(\d+)\s+(.+)$/.exec(line);
      if (match) details.set(Number(match[1]), { command: match[2].trim() });
    }
  } catch {
    // Fall back to lsof's short command names.
  }

  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'],
      { timeout: 3000, maxBuffer: 1024 * 1024 }
    );
    let pid = null;
    for (const line of stdout.split('\n')) {
      if (line.startsWith('p')) pid = Number(line.slice(1));
      else if (line.startsWith('n') && Number.isInteger(pid)) {
        const entry = details.get(pid) || {};
        entry.cwd = line.slice(1);
        details.set(pid, entry);
      }
    }
  } catch {
    // Processes without readable cwd are simply skipped.
  }

  return details;
}

async function probe(url, timeout = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
      signal: controller.signal,
    });
    const type = response.headers.get('content-type') || '';
    const location = response.headers.get('location');
    const isHtml = /text\/html/i.test(type);
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
    try {
      await response.body?.cancel();
    } catch {
      // Ignore body cancellation errors.
    }
    return response.status >= 200 && response.status < 400 && (isHtml || isRedirect);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectDevServer(root, options = {}) {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return {
      url: null,
      candidates: [],
      reason: 'автоопределение dev-сервера поддерживается только на macOS и Linux',
    };
  }

  let listeners;
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcPn'],
      { timeout: 5000, maxBuffer: 5 * 1024 * 1024 }
    );
    listeners = parseListeners(stdout);
  } catch (err) {
    return {
      url: null,
      candidates: [],
      reason: `не удалось получить список портов: ${err.message}`,
    };
  }

  const details = await processDetails(listeners.map((entry) => entry.pid));
  const rootPath = await realpath(root).catch(() => root);
  const candidatesByUrl = new Map();

  for (const entry of listeners) {
    const detail = details.get(entry.pid) || {};
    const command = detail.command || entry.command || '';
    if (PIN_NOTE_COMMAND.test(command)) continue;
    if (!DEV_COMMAND.test(command)) continue;
    if (!detail.cwd) continue;
    const cwd = await realpath(detail.cwd).catch(() => detail.cwd);
    if (!isInside(rootPath, cwd)) continue;

    for (const socket of entry.sockets) {
      const url = `http://${displayHost(socket.host)}:${socket.port}`;
      if (!candidatesByUrl.has(url)) {
        candidatesByUrl.set(url, {
          url,
          pid: entry.pid,
          port: socket.port,
          command,
          cwd,
        });
      }
    }
  }

  const all = [...candidatesByUrl.values()];
  const checks = await Promise.all(
    all.map(async (candidate) => ({ ...candidate, html: await probe(candidate.url, options.probeTimeout) }))
  );
  const html = [];
  const seen = new Set();
  for (const candidate of checks) {
    if (!candidate.html) continue;
    const key = `${candidate.pid}:${candidate.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    html.push(candidate);
  }

  if (html.length === 0) {
    return {
      url: null,
      candidates: [],
      reason: `в ${rootPath} не найден запущенный dev-сервер`,
    };
  }

  if (html.length === 1) {
    return { url: html[0].url, candidates: html, reason: '' };
  }

  const ranked = [...html].sort(
    (a, b) => scoreCandidate(b.command) - scoreCandidate(a.command)
  );
  const bestScore = scoreCandidate(ranked[0].command);
  const best = ranked.filter((candidate) => scoreCandidate(candidate.command) === bestScore);
  if (best.length === 1) {
    return { url: best[0].url, candidates: ranked, reason: '' };
  }

  return {
    url: null,
    candidates: ranked,
    reason: 'найдено несколько dev-серверов',
  };
}
