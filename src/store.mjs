import { randomBytes } from 'node:crypto';
import { access, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  formatAllMarkdown,
  isOpenStatus,
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

const MAX_ATTACHMENTS = 10;
const MAX_THREAD_MESSAGES = 200;
const MESSAGE_ROLES = ['user', 'agent', 'system'];
const MESSAGE_KINDS = ['reply', 'resolution', 'rejection', 'status', 'note'];

function sanitizeAttachmentName(value) {
  const name = text(value, 240)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .trim();
  return name || 'file';
}

function sanitizeAttachment(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = text(raw.file, 400).replace(/\\/g, '/');
  if (!/^attachments\/a_[a-z0-9_]+\.(?:[a-z0-9]{1,12})$/i.test(file)) return null;
  const attachment = {
    file,
    name: sanitizeAttachmentName(raw.name || basename(file)),
    type: text(raw.type, 120).trim() || 'application/octet-stream',
    size: Math.round(number(raw.size, 0, 0, 1e9)),
  };
  const width = Math.round(number(raw.width, 0, 0, 100000));
  const height = Math.round(number(raw.height, 0, 0, 100000));
  if (width > 0) attachment.width = width;
  if (height > 0) attachment.height = height;
  return attachment;
}

function sanitizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    const attachment = sanitizeAttachment(item);
    if (attachment) result.push(attachment);
  }
  return result;
}

function newMessageId() {
  return `m_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function sanitizeThreadMessage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const messageText = text(raw.text, 5000).trim();
  if (!messageText && !Array.isArray(raw.attachments)) return null;
  const role = MESSAGE_ROLES.includes(raw.role) ? raw.role : 'user';
  const kind = MESSAGE_KINDS.includes(raw.kind) ? raw.kind : 'reply';
  const message = {
    id: text(raw.id, 120) || newMessageId(),
    role,
    kind,
    text: messageText,
    at: timestamp(raw.at, null) || new Date().toISOString(),
  };
  const attachments = sanitizeAttachments(raw.attachments);
  if (attachments.length > 0) message.attachments = attachments;
  return message;
}

function normalizeCommentThread(comment) {
  const rawThread = Array.isArray(comment.thread) ? comment.thread : null;
  let changed = false;
  if (rawThread && rawThread.length > 0) {
    const messages = rawThread
      .slice(-MAX_THREAD_MESSAGES)
      .map((message) => sanitizeThreadMessage(message))
      .filter(Boolean);
    if (messages.length !== rawThread.length) changed = true;
    comment.thread = messages;
    return changed;
  }

  const seeded = [];
  const status = comment.status;
  if (
    comment.resolution &&
    ['review', 'approved', 'rejected', 'resolved', 'wontfix', 'orphaned'].includes(status)
  ) {
    seeded.push({
      id: newMessageId(),
      role: status === 'wontfix' || status === 'orphaned' ? 'system' : 'agent',
      kind: 'resolution',
      text: comment.resolution,
      at: comment.reviewedAt || comment.resolvedAt || comment.updatedAt || comment.createdAt,
    });
  }
  if (comment.rejection?.reason) {
    seeded.push({
      id: newMessageId(),
      role: 'user',
      kind: 'rejection',
      text: comment.rejection.reason,
      at: comment.rejectedAt || comment.updatedAt || comment.createdAt,
    });
  }
  if (seeded.length > 0) {
    comment.thread = seeded
      .map((message) => sanitizeThreadMessage(message))
      .filter(Boolean);
    changed = comment.thread.length > 0;
  }
  return changed;
}

function pushThreadMessage(comment, message) {
  if (!Array.isArray(comment.thread)) comment.thread = [];
  const normalized = sanitizeThreadMessage({
    ...message,
    id: message?.id || newMessageId(),
  });
  if (!normalized) return null;
  comment.thread.push(normalized);
  if (comment.thread.length > MAX_THREAD_MESSAGES) {
    comment.thread = comment.thread.slice(-MAX_THREAD_MESSAGES);
  }
  return normalized;
}

function commentAttachmentFiles(comment) {
  const files = [];
  for (const attachment of comment?.attachments || []) {
    if (attachment?.file) files.push(attachment.file);
  }
  for (const message of comment?.thread || []) {
    for (const attachment of message?.attachments || []) {
      if (attachment?.file) files.push(attachment.file);
    }
  }
  return files;
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
    agentSessionId: text(raw.agentSessionId, 300) || null,
    agentProvider: text(raw.agentProvider, 80) || null,
    agentUpdatedAt: timestamp(raw.agentUpdatedAt, null),
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
    const hasWork = comments.some((comment) => isOpenStatus(comment.status));
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

function sanitizeCommentExtras(comment) {
  for (const key of ['reviewedAt', 'approvedAt', 'rejectedAt', 'resolvedAt']) {
    if (comment[key] === undefined) continue;
    const value = timestamp(comment[key], null);
    if (value) comment[key] = value;
    else delete comment[key];
  }
  const rejection = comment.rejection;
  if (!rejection || typeof rejection !== 'object' || Array.isArray(rejection)) {
    delete comment.rejection;
    return;
  }
  const reason = text(rejection.reason, 5000).trim();
  if (!reason) {
    delete comment.rejection;
    return;
  }
  comment.rejection = {
    reason,
    at: timestamp(rejection.at, comment.rejectedAt || comment.updatedAt || null),
  };
}

function applyCommentStatus(comment, status, { at = new Date().toISOString(), rejectionReason } = {}) {
  comment.status = status;
  comment.updatedAt = at;
  if (status === 'review') {
    comment.reviewedAt = at;
    comment.approvedAt = null;
    comment.rejectedAt = null;
    comment.resolvedAt = null;
  } else if (status === 'approved') {
    comment.approvedAt = at;
    comment.rejectedAt = null;
    comment.resolvedAt = null;
    comment.rejection = null;
  } else if (status === 'rejected') {
    const reason = text(rejectionReason, 5000).trim();
    if (!reason) throw error('Укажите причину отклонения', 400);
    comment.rejectedAt = at;
    comment.rejection = { reason, at };
    comment.approvedAt = null;
    comment.resolvedAt = null;
  } else if (status === 'resolved') {
    comment.resolvedAt = at;
    comment.rejectedAt = null;
    comment.rejection = null;
  } else if (status === 'open') {
    comment.reviewedAt = null;
    comment.approvedAt = null;
    comment.rejectedAt = null;
    comment.resolvedAt = null;
    comment.rejection = null;
  } else if (status === 'wontfix' || status === 'orphaned') {
    comment.resolvedAt = null;
    comment.rejection = null;
  }
}

function taskSummary(task, comments) {
  const items = comments.filter((comment) => comment.taskId === task.id);
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
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
    .filter((comment) => isOpenStatus(comment.status))
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
  const current = findTaskIn(store, 'current');
  if (current) return current;
  const taskWithRejected = sortTasks(store.tasks || []).find(
    (task) =>
      task.status !== 'closed' &&
      (store.comments || []).some(
        (comment) => comment.taskId === task.id && comment.status === 'rejected'
      )
  );
  return taskWithRejected || findTaskIn(store, 'latest');
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

function placeholderTaskDescription(task) {
  const description = text(task?.description, 120).trim();
  return !description || /^Задача\s+T-\d+$/i.test(description) || description === 'Новая задача';
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
    this.attachmentsDir = join(dataDir, 'attachments');
    this.queue = Promise.resolve();
    this.migrationPending = false;
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.screenshotsDir, { recursive: true });
    await mkdir(this.attachmentsDir, { recursive: true });
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

- \`comments.json\` — источник правды. Здесь задачи, комментарии, якоря DOM, статусы, диалог и подсказки по исходникам.
- \`feedback.md\` — сгенерированное представление текущей задачи. Не редактируй его вручную.
- \`screenshots/\` — скриншоты с пометками.
- \`attachments/\` — файлы и картинки, прикреплённые заказчиком.
- \`AGENT.md\` — этот файл.

## Задачи

Комментарии группируются в задачи. У задачи есть номер, дата, короткое описание и статус:
\`active\` («В работе»), \`review\` («На проверке»), \`closed\` («Закрыта»).
Новые комментарии попадают в активную задачу. Задачу закрывает человек, а не агент.
При закрытии все комментарии задачи получают статус «Решён» (\`resolved\`).

## Статусы комментариев

- \`open\` — открыт, нужна работа.
- \`review\` — «На проверке»: правка внесена, человек должен её проверить.
- \`approved\` — «Проверен»: человек принял правку.
- \`rejected\` — «Отклонён»: человек не принял правку. В поле \`rejection.reason\` указана
  причина и что нужно доделать. Такой комментарий снова требует работы.
- \`resolved\` — «Решён»: финальный статус после закрытия задачи.
- \`wontfix\` — «Не правим».
- \`orphaned\` — «Не найден».

Если команда \`pin-note\` недоступна в PATH, используй
\`node <путь-к-pin-note>/bin/pin-note.mjs\` с теми же аргументами.

## Как разбирать комментарии

1. Посмотри текущую задачу: \`pin-note tasks current --json\`. Если активной задачи нет, возьми
   последнюю незакрытую: \`pin-note tasks list --json\`.
2. Возьми открытые комментарии: \`pin-note comments list --task current --status open --json\`.
3. Отклонённые комментарии могут остаться в задаче на проверке. Найди их по всем задачам:
   \`pin-note comments list --status rejected --json\`, при необходимости открой детали:
   \`pin-note comments show <id>\`.
4. У отклонённых комментариев прочитай \`rejection.reason\` — это причина отказа и задача на доработку.
5. Найди исходник по \`anchor.selector\`, \`anchor.text\`, \`anchor.html\` и \`sourceHints\`.
6. Если у комментария есть \`screenshot.file\` или \`attachments[]\`, открой файлы относительно этого каталога:
   на скриншоте могут быть цветные пометки, а в attachments — картинки и документы заказчика.
7. Прочитай диалог: первое сообщение — \`comment\`, ответы — в \`thread[]\`. Сообщения \`role: "user"\` — это
   заказчик, \`role: "agent"\` — предыдущие ответы исполнителя, \`role: "system"\` — итог без правки.
   Последний ответ заказчика может уточнять или отклонять предыдущую правку. Учти весь диалог.
8. Внеси минимальную правку, не затрагивая несвязанные части сайта.
9. После правки переведи комментарий на проверку: \`pin-note comments resolve <id> --resolution "..."\`.
   Текст \`resolution\` попадёт в диалог как ответ агента.
10. Когда все комментарии разобраны, выполни \`pin-note tasks submit\` для текущей или последней
    незакрытой задачи. Не закрывай задачу самостоятельно.
11. Если элемент не найден — выполни \`pin-note comments set-status <id> --status orphaned --resolution "..."\`.
12. Не удаляй комментарии и не переписывай чужие поля без необходимости. Ответы заказчика в \`thread[]\`
    не редактируй: новый ответ заказчик добавляет из панели.

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

    let migratedComments = false;
    for (const comment of comments) {
      if (typeof comment.status === 'string') comment.status = comment.status.toLowerCase();
      if (!STATUSES.includes(comment.status)) comment.status = 'open';
      sanitizeCommentExtras(comment);
      const attachments = sanitizeAttachments(comment.attachments);
      if (attachments.length > 0) comment.attachments = attachments;
      else delete comment.attachments;
      const screenshot = sanitizeScreenshot(comment.screenshot);
      if (screenshot) comment.screenshot = screenshot;
      else delete comment.screenshot;
      if (normalizeCommentThread(comment)) migratedComments = true;
    }

    const tasks = normalizeTasks(
      Array.isArray(parsed) ? [] : parsed?.tasks,
      comments,
      Array.isArray(parsed) ? null : parsed?.activeTaskId,
      Array.isArray(parsed) ? 1 : parsed?.nextTaskNumber
    );
    if (tasks.migrated || migratedComments || Number(parsed?.version) !== 2) {
      this.migrationPending = true;
    }

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

  async saveAttachment(buffer, { name = 'file', type = '', size = buffer.length } = {}) {
    const original = sanitizeAttachmentName(name);
    const match = /\.([a-z0-9]{1,12})$/i.exec(original);
    const extension = match ? match[1].toLowerCase() : 'bin';
    const stored = `a_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}.${extension}`;
    await writeFile(join(this.attachmentsDir, stored), buffer);
    return {
      file: `attachments/${stored}`,
      name: original,
      type: text(type, 120).trim() || 'application/octet-stream',
      size: Math.round(number(size, buffer.length, 0, 1e9)),
    };
  }

  resolveScreenshot(name) {
    if (!/^s_[a-z0-9_]+\.(?:png|jpe?g|webp)$/i.test(String(name || ''))) return null;
    return join(this.screenshotsDir, String(name));
  }

  resolveAttachment(name) {
    if (!/^a_[a-z0-9_]+\.(?:[a-z0-9]{1,12})$/i.test(String(name || ''))) return null;
    return join(this.attachmentsDir, String(name));
  }

  attachmentContentType(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    const types = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      txt: 'text/plain; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
      json: 'application/json; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      zip: 'application/zip',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
    };
    return types[ext] || 'application/octet-stream';
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

      const requestedTaskId = text(input?.taskId, 120).trim();
      const requestedTask = requestedTaskId
        ? (store.tasks || []).find((item) => item.id === requestedTaskId)
        : null;
      if (requestedTask?.status === 'closed') {
        throw error('Задача закрыта', 409);
      }

      const anchor = sanitizeAnchor(input?.anchor);
      const screenshot = sanitizeScreenshot(input?.screenshot);
      const attachments = sanitizeAttachments(input?.attachments);
      const now = new Date().toISOString();
      let sourceHints = [];
      try {
        sourceHints = await findSourceHints(this.sourceRoot, anchor);
      } catch {
        sourceHints = [];
      }

      const task = requestedTask || ensureActiveTask(store, commentText);
      if (requestedTask?.status === 'active' && !store.activeTaskId) {
        store.activeTaskId = requestedTask.id;
      }
      const firstComment = !store.comments.some((comment) => comment.taskId === task.id);
      if (firstComment && placeholderTaskDescription(task)) {
        task.description = shortDescription(commentText, 120);
        task.updatedAt = now;
      }
      const comment = {
        id: newId(),
        taskId: task.id,
        status: 'open',
        comment: commentText,
        url: text(input?.url, 4000),
        anchor,
        sourceHints,
        resolution: '',
        thread: [],
        createdAt: now,
        updatedAt: now,
      };
      if (screenshot) comment.screenshot = screenshot;
      if (attachments.length > 0) comment.attachments = attachments;
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

      const previousStatus = comment.status;
      const previousResolution = text(comment.resolution, 5000).trim();
      let rejectionReason = '';
      let changed = false;
      if (patch?.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw error('Неизвестный статус', 400);
        if (task && task.status !== 'active' && patch.status !== comment.status) {
          if (task.status === 'closed') {
            throw error('Задача закрыта. Верните комментарий в текущую задачу', 409);
          }
          const reviewerVerdict =
            ['review', 'approved', 'rejected'].includes(comment.status) &&
            ['approved', 'rejected'].includes(patch.status);
          const resubmitRejected = comment.status === 'rejected' && patch.status === 'review';
          const submitNewFix = comment.status === 'open' && patch.status === 'review';
          if (!reviewerVerdict && !resubmitRejected && !submitNewFix) {
            throw error(
              'Задача на проверке. Разрешены только «Проверен», «Отклонён», отправка новой правки и повторная отправка отклонённой',
              409
            );
          }
        }
        rejectionReason = text(patch.rejectionReason ?? patch.rejection?.reason, 5000).trim();
        applyCommentStatus(comment, patch.status, { rejectionReason });
        if (patch.status === 'open' && patch.resolution === undefined) comment.resolution = '';
        changed = true;
      }
      if (patch?.comment !== undefined) {
        const commentText = text(patch.comment, 10000).trim();
        if (!commentText) throw error('Комментарий не может быть пустым', 400);
        comment.comment = commentText;
        changed = true;
      }
      let resolutionText = null;
      if (patch?.resolution !== undefined) {
        resolutionText = text(patch.resolution, 5000).trim();
        comment.resolution = resolutionText;
        changed = true;
      }
      if (patch?.screenshot !== undefined) {
        const screenshot = sanitizeScreenshot(patch.screenshot);
        if (screenshot) comment.screenshot = screenshot;
        else delete comment.screenshot;
        changed = true;
      }
      if (patch?.attachments !== undefined) {
        const attachments = sanitizeAttachments(patch.attachments);
        if (attachments.length > 0) comment.attachments = attachments;
        else delete comment.attachments;
        changed = true;
      }
      if (!changed) throw error('Нет полей для обновления', 400);

      const now = new Date().toISOString();
      comment.updatedAt = now;
      if (!Array.isArray(comment.thread)) comment.thread = [];

      if (resolutionText) {
        const status = patch?.status !== undefined ? patch.status : comment.status;
        const role = status === 'wontfix' || status === 'orphaned' ? 'system' : 'agent';
        const last = comment.thread.at(-1);
        const repeated = last?.role === role && last?.text === resolutionText;
        const changedResolution = resolutionText !== previousResolution;
        const newReviewCycle = patch?.status === 'review' && previousStatus !== 'review';
        if (!repeated && (changedResolution || newReviewCycle || previousStatus === 'open')) {
          pushThreadMessage(comment, {
            role,
            kind: 'resolution',
            text: resolutionText,
            at: now,
          });
        }
      }

      if (patch?.status === 'rejected' && rejectionReason) {
        const last = comment.thread.at(-1);
        if (!last || last.role !== 'user' || last.text !== rejectionReason) {
          pushThreadMessage(comment, {
            role: 'user',
            kind: 'rejection',
            text: rejectionReason,
            at: now,
          });
        }
      }

      await this.write(store);
      return comment;
    });
  }

  reply(id, textValue) {
    return this.enqueue(async () => {
      const store = await this.read();
      const comment = store.comments.find((item) => item.id === id);
      if (!comment) throw error('Комментарий не найден', 404);
      const task = taskForComment(store, comment);
      if (!task) throw error('Задача комментария не найдена', 404);
      if (task.status === 'closed') {
        throw error('Задача закрыта. Верните комментарий в текущую задачу', 409);
      }
      const replyText = text(textValue, 5000).trim();
      if (!replyText) throw error('Ответ не может быть пустым', 400);

      const now = new Date().toISOString();
      pushThreadMessage(comment, {
        role: 'user',
        kind: 'reply',
        text: replyText,
        at: now,
      });

      if (['review', 'approved', 'rejected'].includes(comment.status)) {
        applyCommentStatus(comment, 'rejected', { at: now, rejectionReason: replyText });
      } else if (comment.status !== 'open') {
        applyCommentStatus(comment, 'open', { at: now });
        comment.resolution = '';
      }
      comment.updatedAt = now;
      await this.write(store);
      return { comment, task: taskSummary(task, store.comments) };
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
      const files = [
        removed.screenshot?.file,
        ...commentAttachmentFiles(removed),
      ].filter(Boolean);
      for (const file of new Set(files)) {
        const stillUsed = store.comments.some(
          (comment) =>
            comment.screenshot?.file === file || commentAttachmentFiles(comment).includes(file)
        );
        if (stillUsed) continue;
        if (file.startsWith('screenshots/')) {
          const screenshot = this.resolveScreenshot(basename(file));
          if (screenshot) await unlink(screenshot).catch(() => {});
        } else if (file.startsWith('attachments/')) {
          const attachment = this.resolveAttachment(basename(file));
          if (attachment) await unlink(attachment).catch(() => {});
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

  createTask(input = {}) {
    return this.enqueue(async () => {
      const store = await this.read();
      const now = new Date().toISOString();
      const taskNumber = Math.max(1, Math.round(number(store.nextTaskNumber, 1, 1, 1e9)));
      const task = sanitizeTask(
        {
          id: newTaskId(),
          number: taskNumber,
          status: 'active',
          description: shortDescription(input?.description, 120) || `Задача T-${taskNumber}`,
          createdAt: now,
        },
        taskNumber,
        now
      );
      store.tasks.push(task);
      store.nextTaskNumber = taskNumber + 1;
      store.activeTaskId = task.id;
      await this.write(store);
      return taskSummary(task, store.comments);
    });
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

  setTaskAgent(ref, patch) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      let changed = false;
      if (patch?.agentSessionId !== undefined) {
        task.agentSessionId = text(patch.agentSessionId, 300) || null;
        changed = true;
      }
      if (patch?.agentProvider !== undefined) {
        task.agentProvider = text(patch.agentProvider, 80) || null;
        changed = true;
      }
      if (!changed) throw error('Нет полей для обновления', 400);
      task.agentUpdatedAt = new Date().toISOString();
      await this.write(store);
      return taskSummary(task, store.comments);
    });
  }

  submitTask(ref) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      if (task.status === 'closed') throw error('Задача уже закрыта', 409);
      const comments = store.comments.filter((comment) => comment.taskId === task.id);
      if (task.status === 'review') {
        const blockers = taskBlockers(comments);
        if (blockers.length > 0) {
          throw error(
            `Нельзя отправить задачу: осталось неразобранных комментариев — ${blockers.length}`,
            409,
            { task: taskSummary(task, store.comments), blockers }
          );
        }
        const now = new Date().toISOString();
        const pending = comments.filter((comment) => comment.status === 'resolved');
        for (const comment of pending) applyCommentStatus(comment, 'review', { at: now });
        if (pending.length > 0) await this.write(store);
        return taskSummary(task, store.comments);
      }
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
      for (const comment of comments) {
        if (comment.status === 'resolved') {
          applyCommentStatus(comment, 'review', { at: now });
        }
      }
      await this.write(store);
      return taskSummary(task, store.comments);
    });
  }

  acceptTask(ref) {
    return this.enqueue(async () => {
      const store = await this.read();
      const task = findTaskIn(store, ref);
      if (!task) throw error('Задача не найдена', 404);
      if (task.status === 'closed') return taskSummary(task, store.comments);
      const comments = store.comments.filter((comment) => comment.taskId === task.id);
      if (comments.length === 0) throw error('В задаче нет комментариев', 400);
      const pending = comments.filter(
        (comment) => !['approved', 'resolved', 'wontfix'].includes(comment.status)
      );
      if (pending.length > 0) {
        throw error(
          `Нельзя принять задачу: осталось непринятых правок — ${pending.length}`,
          409,
          {
            task: taskSummary(task, store.comments),
            blockers: pending.map((comment) => ({
              id: comment.id,
              status: comment.status,
              comment: shortDescription(comment.comment, 120),
            })),
          }
        );
      }
      const now = new Date().toISOString();
      task.status = 'closed';
      task.closedAt = now;
      task.submittedAt = task.submittedAt || now;
      task.updatedAt = now;
      if (store.activeTaskId === task.id) store.activeTaskId = null;
      for (const comment of comments) {
        applyCommentStatus(comment, 'resolved', { at: now });
      }
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
      for (const comment of comments) {
        applyCommentStatus(comment, 'resolved', { at: now });
      }
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
      const files = new Set();
      for (const comment of comments) {
        if (comment.screenshot?.file) files.add(comment.screenshot.file);
        for (const file of commentAttachmentFiles(comment)) files.add(file);
      }
      store.comments = store.comments.filter((comment) => comment.taskId !== task.id);
      store.tasks = store.tasks.filter((item) => item.id !== task.id);
      if (store.activeTaskId === task.id) store.activeTaskId = null;
      await this.write(store);
      for (const file of files) {
        const stillUsed = store.comments.some(
          (comment) =>
            comment.screenshot?.file === file || commentAttachmentFiles(comment).includes(file)
        );
        if (stillUsed) continue;
        if (file.startsWith('screenshots/')) {
          const screenshot = this.resolveScreenshot(basename(file));
          if (screenshot) await unlink(screenshot).catch(() => {});
        } else if (file.startsWith('attachments/')) {
          const attachment = this.resolveAttachment(basename(file));
          if (attachment) await unlink(attachment).catch(() => {});
        }
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
        applyCommentStatus(comment, 'open');
        comment.resolution = '';
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
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,
        resolvedAt: null,
        rejection: null,
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
