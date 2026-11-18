import { randomBytes } from 'node:crypto';
import { access, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  formatAllMarkdown,
  shortDescription,
  STATUSES,
  TASK_STATUSES,
  taskTag,
} from './shared.mjs';
import { findSourceHints } from './source-hints.mjs';

const commentsFileTemplate = (project) => ({
  version: 2,
  project,
  createdAt: new Date().toISOString(),
  updatedAt: null,
  nextTaskNumber: 1,
  activeTaskId: null,
  tasks: [],
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

function sanitizeScreenshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = text(raw.file, 300);
  if (!/^screenshots\/s_[a-z0-9_]+\.(?:png|jpe?g|webp)$/i.test(file)) return null;
  return {
    file,
    width: Math.round(number(raw.width, 0, 0, 100000)),
    height: Math.round(number(raw.height, 0, 0, 100000)),
  };
}

function sanitizeTask(raw, fallbackNumber = 1, fallbackCreatedAt = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = text(raw.id, 120) || newTaskId();
  const parsedNumber = Math.round(number(raw.number, fallbackNumber, 1, 1e9));
  const status = TASK_STATUSES.includes(raw.status) ? raw.status : 'active';
  return {
    id,
    number: parsedNumber,
    status,
    description: shortDescription(raw.description, 120),
    createdAt: timestamp(raw.createdAt, fallbackCreatedAt || new Date().toISOString()),
    updatedAt: timestamp(raw.updatedAt, null),
    submittedAt: timestamp(raw.submittedAt, null),
    closedAt: timestamp(raw.closedAt, null),
  };
}

function taskCreatedAtForComments(comments) {
  const dates = comments
    .map((comment) => timestamp(comment.createdAt, null))
    .filter(Boolean)
    .sort();
  return dates[0] || new Date().toISOString();
}

function normalizeTasks(parsedTasks, comments, rawActiveTaskId = null, rawNextTaskNumber = 1) {
  const rawTasks = Array.isArray(parsedTasks) ? parsedTasks : [];
  const tasks = [];
  let migrated = rawTasks.length === 0 && comments.length > 0;
  const usedIds = new Set();
  const usedNumbers = new Set();
  let nextNumber = Math.max(1, Math.round(number(rawNextTaskNumber, 1, 1, 1e9)));

  for (const raw of rawTasks) {
    const task = sanitizeTask(raw, nextNumber, taskCreatedAtForComments(comments));
    if (!task) continue;
    if (usedIds.has(task.id)) {
      task.id = newTaskId();
      migrated = true;
    }
    if (usedNumbers.has(task.number)) {
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      task.number = nextNumber;
      migrated = true;
    }
    usedIds.add(task.id);
    usedNumbers.add(task.number);
    nextNumber = Math.max(nextNumber, task.number + 1);
    tasks.push(task);
  }

  if (tasks.length === 0 && comments.length > 0) {
    const createdAt = taskCreatedAtForComments(comments);
    const hasWork = comments.some((comment) => comment.status === 'open' || comment.status === 'orphaned');
    const legacy = sanitizeTask(
      {
        id: 't_legacy_1',
        number: 1,
        status: hasWork ? 'active' : 'review',
        description: shortDescription(comments[0]?.comment, 120),
        createdAt,
        submittedAt: hasWork ? null : createdAt,
      },
      1,
      createdAt
    );
    tasks.push(legacy);
    usedIds.add(legacy.id);
    usedNumbers.add(legacy.number);
    nextNumber = Math.max(nextNumber, 2);
    migrated = true;
  }

  const fallbackTask =
    tasks.find((task) => task.status === 'active') ||
    sortTasks(tasks)[0] ||
    null;

  for (const comment of comments) {
    if (!comment.taskId || !usedIds.has(comment.taskId)) {
      if (fallbackTask) {
        comment.taskId = fallbackTask.id;
        migrated = true;
      }
    }
  }

  for (const task of tasks) {
    if (!task.description) {
      const first = comments.find((comment) => comment.taskId === task.id);
      task.description = shortDescription(first?.comment, 120) || `Задача ${taskTag(task)}`;
      migrated = true;
    }
  }

  const activeTasks = tasks.filter((task) => task.status === 'active');
  let activeTaskId = usedIds.has(rawActiveTaskId) ? rawActiveTaskId : null;
  if (!activeTasks.some((task) => task.id === activeTaskId)) {
    activeTaskId = activeTasks[0]?.id || null;
  }
  if (activeTasks.length > 1) {
    for (const task of activeTasks) {
      if (task.id === activeTaskId) continue;
      task.status = 'review';
      task.submittedAt = task.submittedAt || new Date().toISOString();
      migrated = true;
    }
  } else if (activeTasks.length === 1 && activeTaskId !== activeTasks[0].id) {
    activeTaskId = activeTasks[0].id;
    migrated = true;
  }

  return { tasks, activeTaskId, nextTaskNumber: Math.max(1, nextNumber), migrated };
}

function newId() {
  return `c_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function newTaskId() {
  return `t_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function timestamp(value, fallback = null) {
  const textValue = text(value, 80);
  if (!textValue) return fallback;
  const date = new Date(textValue);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function taskSummary(task, comments) {
  const items = comments.filter((comment) => comment.taskId === task.id);
  const counts = { open: 0, resolved: 0, wontfix: 0, orphaned: 0 };
  for (const comment of items) {
    const status = STATUSES.includes(comment.status) ? comment.status : 'open';
    counts[status] += 1;
  }
  return {
    ...task,
    total: items.length,
    counts,
  };
}

function taskBlockers(comments) {
  return comments
    .filter((comment) => comment.status === 'open' || comment.status === 'orphaned')
    .map((comment) => ({
      id: comment.id,
      status: comment.status,
      comment: shortDescription(comment.comment, 120),
    }));
}

function findTaskIn(store, ref) {
  const tasks = Array.isArray(store.tasks) ? store.tasks : [];
  const value = String(ref ?? '').trim();
  if (!value || value === 'current' || value === 'active') {
    return tasks.find((task) => task.id === store.activeTaskId && task.status === 'active') || null;
  }
  if (value === 'latest') {
    return [...tasks].sort((left, right) => right.number - left.number)[0] || null;
  }
  const numberMatch = /^#?(?:t-)?(\d+)$/i.exec(value);
  if (numberMatch) {
    const number = Number(numberMatch[1]);
    return tasks.find((task) => task.number === number) || null;
  }
  return tasks.find((task) => task.id === value) || null;
}

function taskForComment(store, comment) {
  return (store.tasks || []).find((task) => task.id === comment.taskId) || null;
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => right.number - left.number);
}

function feedbackTask(store) {
  return findTaskIn(store, 'current') || findTaskIn(store, 'latest');
}

function ensureActiveTask(store, description) {
  const current = findTaskIn(store, 'current');
  if (current) return current;
  const now = new Date().toISOString();
  const taskNumber = Math.max(1, Math.round(number(store.nextTaskNumber, 1, 1, 1e9)));
  const task = sanitizeTask(
    {
      id: newTaskId(),
      number: taskNumber,
      status: 'active',
      description: shortDescription(description, 120) || `Задача T-${taskNumber}`,
      createdAt: now,
    },
    taskNumber,
    now
  );
  if (!Array.isArray(store.tasks)) store.tasks = [];
  store.tasks.push(task);
  store.nextTaskNumber = taskNumber + 1;
  store.activeTaskId = task.id;
  return task;
}

function removeEmptyTask(store, taskId) {
  const task = (store.tasks || []).find((item) => item.id === taskId);
  if (!task) return null;
  if (store.comments.some((comment) => comment.taskId === taskId)) return null;
  if (task.status === 'active' && store.activeTaskId === taskId) store.activeTaskId = null;
  store.tasks = store.tasks.filter((item) => item.id !== taskId);
  return task;
}

function temporaryPath(file) {
  return `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
}

function error(message, status, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
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
    this.screenshotsDir = join(dataDir, 'screenshots');
    this.queue = Promise.resolve();
    this.migrationPending = false;
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.screenshotsDir, { recursive: true });
    if (!(await exists(this.commentsFile))) {
      await this.withLock(() => this.write(commentsFileTemplate(this.project)));
    }
    const data = await this.read();
    if (this.migrationPending) await this.withLock(() => this.write(data));
    else await this.writeFeedback(data);
    await this.ensureInstructions();
  }

  async ensureInstructions() {
    const content = `# PinNote

Этот каталог создан локальным review-сервером.

- \`comments.json\` — источник правды. Здесь задачи, комментарии, якоря DOM, статусы и подсказки по исходникам.
- \`feedback.md\` — сгенерированное представление текущей задачи. Не редактируй его вручную.
- \`AGENT.md\` — этот файл.

## Задачи

Комментарии группируются в задачи. У задачи есть номер, дата, короткое описание и статус:
\`active\` («В работе»), \`review\` («На проверке»), \`closed\` («Закрыта»).
Новые комментарии попадают в активную задачу. Задачу закрывает человек, а не агент.

Если команда \`pin-note\` недоступна в PATH, используй
\`node <путь-к-pin-note>/bin/pin-note.mjs\` с теми же аргументами.

## Как разбирать комментарии

1. Посмотри текущую задачу: \`pin-note tasks current --json\`.
2. Возьми открытые комментарии текущей задачи: \`pin-note comments list --task current --status open --json\`.
3. Найди исходник по \`anchor.selector\`, \`anchor.text\`, \`anchor.html\` и \`sourceHints\`.
4. Если у комментария есть \`screenshot.file\`, открой файл относительно этого каталога: на скриншоте могут быть цветные пометки.
5. Внеси минимальную правку, не затрагивая несвязанные части сайта.
6. После проверки обнови комментарий: \`pin-note comments resolve <id> --resolution "..."\`.
7. Когда все комментарии задачи разобраны, выполни \`pin-note tasks submit\`. Не закрывай задачу самостоятельно.
8. Если элемент не найден — выполни \`pin-note comments set-status <id> --status orphaned --resolution "..."\`.
9. Не удаляй комментарии и не переписывай чужие поля без необходимости.

Сервер следит за \`comments.json\` и обновляет \`feedback.md\`, а браузер получает изменения по SSE.
`;
    await writeFile(this.instructionsFile, content, 'utf8');
  }

  async read() {
    this.migrationPending = false;
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

    const tasks = normalizeTasks(
      Array.isArray(parsed) ? [] : parsed?.tasks,
      comments,
      Array.isArray(parsed) ? null : parsed?.activeTaskId,
      Array.isArray(parsed) ? 1 : parsed?.nextTaskNumber
    );
    if (tasks.migrated || Number(parsed?.version) !== 2) this.migrationPending = true;

    return {
      version: 2,
      project: typeof parsed?.project === 'string' ? parsed.project : this.project,
      createdAt: typeof parsed?.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      nextTaskNumber: tasks.nextTaskNumber,
      activeTaskId: tasks.activeTaskId,
      tasks: tasks.tasks,
      comments,
    };
  }

  async write(data) {
    const now = new Date().toISOString();
    const payload = {
      version: 2,
      project: data.project || this.project,
      createdAt: data.createdAt || now,
      updatedAt: now,
      nextTaskNumber: Math.max(1, Math.round(number(data.nextTaskNumber, 1, 1, 1e9))),
      activeTaskId: data.activeTaskId || null,
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      comments: Array.isArray(data.comments) ? data.comments : [],
    };
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    const temporary = temporaryPath(this.commentsFile);
    await writeFile(temporary, json, 'utf8');
    await rename(temporary, this.commentsFile);
    this.migrationPending = false;
    await this.writeFeedback(payload);
    return payload;
  }

  async writeFeedback(data) {
    const task = feedbackTask(data);
    const comments = task
      ? data.comments.filter((comment) => comment.taskId === task.id)
      : data.comments;
    const markdown = formatAllMarkdown(comments, {
      project: data.project || this.project,
      updatedAt: data.updatedAt || new Date().toISOString(),
      task,
    });
    const temporary = temporaryPath(this.feedbackFile);
    await writeFile(temporary, markdown, 'utf8');
    await rename(temporary, this.feedbackFile);
  }

  async saveScreenshot(buffer, extension, { width = 0, height = 0 } = {}) {
    const ext = extension === 'jpeg' ? 'jpg' : extension;
    if (!['png', 'jpg', 'webp'].includes(ext)) throw error('Неподдерживаемый формат скриншота', 415);
    const name = `s_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}.${ext}`;
    await writeFile(join(this.screenshotsDir, name), buffer);
    return {
      file: `screenshots/${name}`,
      width: Math.round(number(width, 0, 0, 100000)),
      height: Math.round(number(height, 0, 0, 100000)),
    };
  }

  resolveScreenshot(name) {
    if (!/^s_[a-z0-9_]+\.(?:png|jpe?g|webp)$/i.test(String(name || ''))) return null;
    return join(this.screenshotsDir, String(name));
  }

  screenshotContentType(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }

  async withLock(work) {
    const lockPath = join(this.dataDir, '.comments.lock');
    const started = Date.now();
    let handle = null;
    while (!handle) {
      try {
        handle = await open(lockPath, 'wx');
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const info = await stat(lockPath);
          if (Date.now() - info.mtimeMs > 10000) {
            await unlink(lockPath).catch(() => {});
            continue;
          }
        } catch {
          // Lock disappeared between open and stat; retry immediately.
        }
        if (Date.now() - started > 10000) {
          throw new Error('Не удалось получить блокировку comments.json');
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      }
    }
    try {
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`, 'utf8');
    } catch (err) {
      await handle.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
      throw err;
    }
    try {
      return await work();
    } finally {
      await handle.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
    }
  }

  enqueue(work) {
    const run = this.queue.then(() => this.withLock(work));
    this.queue = run.catch(() => {});
    return run;
  }

  add(input) {
    return this.enqueue(async () => {
      const store = await this.read();
      const commentText = text(input?.comment, 10000).trim();
      if (!commentText) throw error('Комментарий не может быть пустым', 400);

      const anchor = sanitizeAnchor(input?.anchor);
      const screenshot = sanitizeScreenshot(input?.screenshot);
      const now = new Date().toISOString();
      let sourceHints = [];
      try {
        sourceHints = await findSourceHints(this.sourceRoot, anchor);
      } catch {
        sourceHints = [];
      }

      const task = ensureActiveTask(store, commentText);
      const comment = {
        id: newId(),
        taskId: task.id,
        status: 'open',
        comment: commentText,
        url: text(input?.url, 4000),
        anchor,
        sourceHints,
        resolution: '',
        createdAt: now,
        updatedAt: now,
      };
      if (screenshot) comment.screenshot = screenshot;
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
      const task = taskForComment(store, comment);

      let changed = false;
      if (patch?.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw error('Неизвестный статус', 400);
        if (task && task.status !== 'active' && patch.status !== comment.status) {
          throw error('Задача уже не активна. Верните комментарий в текущую задачу', 409);
        }
        comment.status = patch.status;
        comment.resolvedAt = patch.status === 'resolved' ? new Date().toISOString() : null;
        if (patch.status === 'open' && patch.resolution === undefined) comment.resolution = '';
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
      if (patch?.screenshot !== undefined) {
        const screenshot = sanitizeScreenshot(patch.screenshot);
        if (screenshot) comment.screenshot = screenshot;
        else delete comment.screenshot;
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
      if (removed.taskId) removeEmptyTask(store, removed.taskId);
      await this.write(store);
      if (removed.screenshot?.file) {
        const stillUsed = store.comments.some(
          (comment) => comment.screenshot?.file === removed.screenshot.file
        );
        if (!stillUsed) {
          const name = basename(removed.screenshot.file);
          const file = this.resolveScreenshot(name);
          if (file) await unlink(file).catch(() => {});
        }
      }
      return removed;
    });
  }

  async currentTask() {
    const store = await this.read();
    const task = findTaskIn(store, 'current');
    return task ? taskSummary(task, store.comments) : null;
  }

  async listTasks() {
    const store = await this.read();
    return sortTasks(store.tasks).map((task) => taskSummary(task, store.comments));
  }

  async getTask(ref) {
    const store = await this.read();
    const task = findTaskIn(store, ref);
    return task ? taskSummary(task, store.comments) : null;
  }

  updateTask(ref, patch) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      if (patch?.description === undefined) throw error('Нет полей для обновления', 400);
      task.description = shortDescription(patch.description, 120);
      task.updatedAt = new Date().toISOString();
      await this.write(store);
      return taskSummary(task, store.comments);
    });
  }

  submitTask(ref) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      if (task.status === 'review') return taskSummary(task, store.comments);
      if (task.status === 'closed') throw error('Задача уже закрыта', 409);
      const comments = store.comments.filter((comment) => comment.taskId === task.id);
      if (comments.length === 0) throw error('В задаче нет комментариев', 400);
      const blockers = taskBlockers(comments);
      const summary = taskSummary(task, store.comments);
      if (blockers.length > 0) {
        throw error(
          `Нельзя отправить задачу: осталось неразобранных комментариев — ${blockers.length}`,
          409,
          { task: summary, blockers }
        );
      }
      const now = new Date().toISOString();
      task.status = 'review';
      task.submittedAt = now;
      task.updatedAt = now;
      if (store.activeTaskId === task.id) store.activeTaskId = null;
      await this.write(store);
      return taskSummary(task, store.comments);
    });
  }

  closeTask(ref) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      if (task.status === 'closed') return taskSummary(task, store.comments);
      const comments = store.comments.filter((comment) => comment.taskId === task.id);
      if (comments.length === 0) throw error('В задаче нет комментариев', 400);
      const blockers = taskBlockers(comments);
      if (blockers.length > 0) {
        throw error(
          `Нельзя закрыть задачу: осталось неразобранных комментариев — ${blockers.length}`,
          409,
          { task: taskSummary(task, store.comments), blockers }
        );
      }
      const now = new Date().toISOString();
      task.status = 'closed';
      task.closedAt = now;
      task.submittedAt = task.submittedAt || now;
      task.updatedAt = now;
      if (store.activeTaskId === task.id) store.activeTaskId = null;
      await this.write(store);
      return taskSummary(task, store.comments);
    });
  }

  removeTask(ref) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      const comments = store.comments.filter((comment) => comment.taskId === task.id);
      const summary = taskSummary(task, store.comments);
      const screenshotFiles = new Set(
        comments.map((comment) => comment.screenshot?.file).filter(Boolean)
      );
      store.comments = store.comments.filter((comment) => comment.taskId !== task.id);
      store.tasks = store.tasks.filter((item) => item.id !== task.id);
      if (store.activeTaskId === task.id) store.activeTaskId = null;
      await this.write(store);
      for (const file of screenshotFiles) {
        const stillUsed = store.comments.some((comment) => comment.screenshot?.file === file);
        if (stillUsed) continue;
        const screenshot = this.resolveScreenshot(basename(file));
        if (screenshot) await unlink(screenshot).catch(() => {});
      }
      return { task: summary, deletedComments: comments.length };
    });
  }

  reopenComment(id) {
    return this.enqueue(async () => {
      const store = await this.read();
      const comment = store.comments.find((item) => item.id === id);
      if (!comment) throw error('Комментарий не найден', 404);
      const task = taskForComment(store, comment);
      if (!task) throw error('Задача комментария не найдена', 404);

      if (task.status === 'active') {
        comment.status = 'open';
        comment.resolution = '';
        comment.resolvedAt = null;
        comment.updatedAt = new Date().toISOString();
        await this.write(store);
        return {
          comment,
          task: taskSummary(task, store.comments),
          cloned: false,
        };
      }

      const activeTask = ensureActiveTask(store, comment.comment);
      const now = new Date().toISOString();
      const clone = {
        ...comment,
        id: newId(),
        taskId: activeTask.id,
        status: 'open',
        resolution: '',
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
        reopenedFrom: { taskId: task.id, commentId: comment.id },
      };
      if (comment.screenshot) clone.screenshot = { ...comment.screenshot };
      store.comments.push(clone);
      await this.write(store);
      return {
        comment: clone,
        task: taskSummary(activeTask, store.comments),
        cloned: true,
      };
    });
  }

  async exportMarkdown({ status, task: taskRef = 'current' } = {}) {
    const store = await this.read();
    let task = null;
    if (taskRef !== 'all') {
      task = findTaskIn(store, taskRef || 'current');
      if (!task && taskRef !== 'current') throw error('Задача не найдена', 404);
      if (!task) task = findTaskIn(store, 'latest');
    }
    const taskComments = task
      ? store.comments.filter((comment) => comment.taskId === task.id)
      : store.comments;
    const comments = status
      ? taskComments.filter((comment) => comment.status === status)
      : taskComments;
    return formatAllMarkdown(comments, {
      project: store.project,
      updatedAt: store.updatedAt || new Date().toISOString(),
      task,
    });
  }
}

export { sanitizeAnchor };
