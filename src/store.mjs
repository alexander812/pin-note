import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { formatAllMarkdown, STATUSES } from './shared.mjs';
import { findSourceHints } from './source-hints.mjs';

const commentsFileTemplate = (project) => ({
  version: 1,
  project,
  createdAt: new Date().toISOString(),
  updatedAt: null,
  comments: [],
});

function exists(path) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

function text(value, limit = 10000) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, limit);
}

function number(value, fallback = 0, min = -1e9, max = 1e9) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function objectOfStrings(value, { maxKeys = 30, maxValue = 600 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= maxKeys) break;
    if (!key || key.length > 100 || key.startsWith('on')) continue;
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    if (raw === null || raw === undefined) continue;
    result[key] = text(raw, maxValue);
    count += 1;
  }
  return result;
}

function sanitizeAnchor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const anchor = {};
  const selector = text(raw.selector, 3000);
  const xpath = text(raw.xpath, 3000);
  const tag = text(raw.tag, 80);
  const anchorText = text(raw.text, 2000);
  const html = text(raw.html, 6000);
  if (selector) anchor.selector = selector;
  if (xpath) anchor.xpath = xpath;
  if (tag) anchor.tag = tag;
  if (anchorText) anchor.text = anchorText;
  if (html) anchor.html = html;

  if (Array.isArray(raw.ancestors)) {
    anchor.ancestors = raw.ancestors
      .slice(0, 10)
      .map((item) => text(item, 300))
      .filter(Boolean);
  }
  if (raw.attributes) anchor.attributes = objectOfStrings(raw.attributes);
  if (raw.styles) anchor.styles = objectOfStrings(raw.styles, { maxKeys: 35, maxValue: 300 });
  if (raw.rect && typeof raw.rect === 'object') {
    anchor.rect = {
      x: number(raw.rect.x),
      y: number(raw.rect.y),
      width: number(raw.rect.width, 0, 0),
      height: number(raw.rect.height, 0, 0),
    };
  }
  if (raw.viewport && typeof raw.viewport === 'object') {
    anchor.viewport = {
      width: number(raw.viewport.width, 0, 0),
      height: number(raw.viewport.height, 0, 0),
      dpr: number(raw.viewport.dpr, 1, 0, 10),
    };
  }
  if (raw.scroll && typeof raw.scroll === 'object') {
    anchor.scroll = { x: number(raw.scroll.x), y: number(raw.scroll.y) };
  }
  if (raw.point && typeof raw.point === 'object') {
    anchor.point = {
      x: number(raw.point.x, 0, 0, 1),
      y: number(raw.point.y, 0, 0, 1),
    };
  }
  return anchor;
}

function newId() {
  return `c_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function temporaryPath(file) {
  return `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
}

function error(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export class ReviewStore {
  constructor({ root, dataDir, sourceRoot }) {
    this.root = root;
    this.sourceRoot = sourceRoot || root;
    this.dataDir = dataDir;
    this.project = basename(root) || 'website';
    this.commentsFile = join(dataDir, 'comments.json');
    this.feedbackFile = join(dataDir, 'feedback.md');
    this.instructionsFile = join(dataDir, 'AGENT.md');
    this.queue = Promise.resolve();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    if (!(await exists(this.commentsFile))) {
      await this.write(commentsFileTemplate(this.project));
    }
    const data = await this.read();
    await this.writeFeedback(data);
    await this.ensureInstructions();
  }

  async ensureInstructions() {
    if (await exists(this.instructionsFile)) return;
    const content = `# PinNote

Этот каталог создан локальным review-сервером.

- \`comments.json\` — источник правды. Здесь комментарии, якоря DOM, статусы и подсказки по исходникам.
- \`feedback.md\` — сгенерированное представление для чтения. Не редактируй его вручную.
- \`AGENT.md\` — этот файл.

## Как разбирать комментарии

1. Прочитай \`comments.json\` и возьми комментарии со статусом \`open\` (а также \`orphaned\`, если можешь восстановить якорь).
2. Найди исходник по \`anchor.selector\`, \`anchor.text\`, \`anchor.html\` и \`sourceHints\`.
3. Внеси минимальную правку, не затрагивая несвязанные части сайта.
4. После проверки обнови комментарий: \`status: "resolved"\` и \`resolution\` с кратким описанием.
5. Если элемент не найден или правка невозможна, поставь \`status: "orphaned"\` или \`"wontfix"\` и объясни причину в \`resolution\`.
6. Не удаляй комментарии и не переписывай чужие поля без необходимости.

Сервер следит за \`comments.json\` и обновляет \`feedback.md\`, а браузер получает изменения по SSE.
`;
    await writeFile(this.instructionsFile, content, 'utf8');
  }

  async read() {
    let raw;
    try {
      raw = await readFile(this.commentsFile, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return commentsFileTemplate(this.project);
      throw err;
    }
    if (!raw.trim()) return commentsFileTemplate(this.project);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Не удалось прочитать ${this.commentsFile}: ${err.message}`);
    }

    const source = Array.isArray(parsed) ? parsed : parsed?.comments;
    const comments = Array.isArray(source)
      ? source.filter((comment) => comment && typeof comment === 'object' && typeof comment.id === 'string')
      : [];

    for (const comment of comments) {
      if (typeof comment.status === 'string') comment.status = comment.status.toLowerCase();
      if (!STATUSES.includes(comment.status)) comment.status = 'open';
    }

    return {
      version: 1,
      project: typeof parsed?.project === 'string' ? parsed.project : this.project,
      createdAt: typeof parsed?.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      comments,
    };
  }

  async write(data) {
    const now = new Date().toISOString();
    const payload = {
      version: 1,
      project: data.project || this.project,
      createdAt: data.createdAt || now,
      updatedAt: now,
      comments: Array.isArray(data.comments) ? data.comments : [],
    };
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    const temporary = temporaryPath(this.commentsFile);
    await writeFile(temporary, json, 'utf8');
    await rename(temporary, this.commentsFile);
    await this.writeFeedback(payload);
    return payload;
  }

  async writeFeedback(data) {
    const markdown = formatAllMarkdown(data.comments, {
      project: data.project || this.project,
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
    const temporary = temporaryPath(this.feedbackFile);
    await writeFile(temporary, markdown, 'utf8');
    await rename(temporary, this.feedbackFile);
  }

  enqueue(work) {
    const run = this.queue.then(work);
    this.queue = run.catch(() => {});
    return run;
  }

  add(input) {
    return this.enqueue(async () => {
      const store = await this.read();
      const commentText = text(input?.comment, 10000).trim();
      if (!commentText) throw error('Комментарий не может быть пустым', 400);

      const anchor = sanitizeAnchor(input?.anchor);
      const now = new Date().toISOString();
      let sourceHints = [];
      try {
        sourceHints = await findSourceHints(this.sourceRoot, anchor);
      } catch {
        sourceHints = [];
      }

      const comment = {
        id: newId(),
        status: 'open',
        comment: commentText,
        url: text(input?.url, 4000),
        anchor,
        sourceHints,
        resolution: '',
        createdAt: now,
        updatedAt: now,
      };
      store.comments.push(comment);
      await this.write(store);
      return comment;
    });
  }

  update(id, patch) {
    return this.enqueue(async () => {
      const store = await this.read();
      const comment = store.comments.find((item) => item.id === id);
      if (!comment) throw error('Комментарий не найден', 404);

      let changed = false;
      if (patch?.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw error('Неизвестный статус', 400);
        comment.status = patch.status;
        comment.resolvedAt = patch.status === 'resolved' ? new Date().toISOString() : null;
        changed = true;
      }
      if (patch?.comment !== undefined) {
        const commentText = text(patch.comment, 10000).trim();
        if (!commentText) throw error('Комментарий не может быть пустым', 400);
        comment.comment = commentText;
        changed = true;
      }
      if (patch?.resolution !== undefined) {
        comment.resolution = text(patch.resolution, 5000).trim();
        changed = true;
      }
      if (!changed) throw error('Нет полей для обновления', 400);

      comment.updatedAt = new Date().toISOString();
      await this.write(store);
      return comment;
    });
  }

  remove(id) {
    return this.enqueue(async () => {
      const store = await this.read();
      const index = store.comments.findIndex((item) => item.id === id);
      if (index === -1) throw error('Комментарий не найден', 404);
      const [removed] = store.comments.splice(index, 1);
      await this.write(store);
      return removed;
    });
  }

  async exportMarkdown({ status } = {}) {
    const store = await this.read();
    const comments = status
      ? store.comments.filter((comment) => comment.status === status)
      : store.comments;
    return formatAllMarkdown(comments, {
      project: store.project,
      updatedAt: store.updatedAt || new Date().toISOString(),
    });
  }
}

export { sanitizeAnchor };
