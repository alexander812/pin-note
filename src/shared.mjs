export const STATUSES = ['open', 'review', 'approved', 'rejected', 'resolved', 'wontfix', 'orphaned'];

export const STATUS_LABELS = {
  open: 'Открыт',
  review: 'На проверке',
  approved: 'Проверен',
  rejected: 'Отклонён',
  resolved: 'Решён',
  wontfix: 'Не правим',
  orphaned: 'Не найден',
};

export const STATUS_ORDER = {
  open: 0,
  rejected: 1,
  orphaned: 2,
  review: 3,
  approved: 4,
  resolved: 5,
  wontfix: 6,
};

export const BLOCKING_STATUSES = ['open', 'orphaned', 'rejected'];

export const TASK_STATUSES = ['active', 'review', 'closed'];

export const TASK_STATUS_LABELS = {
  active: 'В работе',
  review: 'На проверке',
  closed: 'Закрыта',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Неизвестно';
}

export function taskStatusLabel(status) {
  return TASK_STATUS_LABELS[status] || status || 'Неизвестно';
}

export function isOpenStatus(status) {
  return BLOCKING_STATUSES.includes(status);
}

export function isReviewableStatus(status) {
  return status === 'review' || status === 'approved' || status === 'rejected';
}

export function taskTag(task) {
  const number = Number(task?.number);
  return Number.isFinite(number) && number > 0 ? `T-${number}` : '';
}

export function formatTaskDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

export function taskTitle(task, { withDescription = true } = {}) {
  if (!task) return '';
  const parts = [taskTag(task), formatTaskDate(task.createdAt)].filter(Boolean);
  const description = String(task.description || '').replace(/\s+/g, ' ').trim();
  if (withDescription && description) parts.push(description);
  return parts.join(' · ');
}

export function shortDescription(value, limit = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function oneLine(value, limit = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function inlineCode(value) {
  const text = String(value ?? '');
  let fence = '`';
  while (text.includes(fence)) fence += '`';
  return `${fence}${text}${fence}`;
}

function fenced(value) {
  const text = String(value ?? '');
  let fence = '~~~';
  while (text.includes(fence)) fence += '~';
  return `${fence}html\n${text}\n${fence}`;
}

function whereLine(anchor) {
  const rect = anchor?.rect;
  const viewport = anchor?.viewport;
  const scroll = anchor?.scroll;
  const parts = [];
  if (rect) {
    parts.push(
      `x=${Math.round(Number(rect.x) || 0)}, y=${Math.round(Number(rect.y) || 0)}, ` +
        `${Math.round(Number(rect.width) || 0)}×${Math.round(Number(rect.height) || 0)}`
    );
  }
  if (viewport) {
    parts.push(
      `viewport ${Math.round(Number(viewport.width) || 0)}×${Math.round(Number(viewport.height) || 0)}` +
        (viewport.dpr ? `, dpr=${viewport.dpr}` : '')
    );
  }
  if (scroll) {
    parts.push(`scroll ${Math.round(Number(scroll.x) || 0)}×${Math.round(Number(scroll.y) || 0)}`);
  }
  return parts.join('; ');
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let amount = size;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const rounded = amount >= 10 || index === 0 ? Math.round(amount) : Math.round(amount * 10) / 10;
  return `${rounded} ${units[index]}`;
}

function markdownLinkText(value) {
  return String(value ?? '').replace(/([\\[\]])/g, '\\$1');
}

function attachmentLines(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const lines = ['', '**Файлы:**'];
  for (const attachment of attachments) {
    if (!attachment?.file) continue;
    const name = String(attachment.name || attachment.file);
    const details = [attachment.type, formatBytes(attachment.size)].filter(Boolean).join(', ');
    lines.push(
      `- [${markdownLinkText(name)}](${encodeURI(attachment.file)})` +
        (details ? ` — ${details}` : '')
    );
    if (
      String(attachment.type || '').startsWith('image/') ||
      /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(String(attachment.name || attachment.file))
    ) {
      lines.push('', `![${markdownLinkText(name)}](${encodeURI(attachment.file)})`);
    }
  }
  return lines;
}

function threadLines(thread) {
  if (!Array.isArray(thread) || thread.length === 0) return [];
  const lines = ['', '**Диалог:**'];
  for (const message of thread) {
    const textValue = String(message?.text || '').trim();
    if (!textValue) continue;
    const author =
      message.role === 'agent' ? 'Агент' : message.role === 'system' ? 'Система' : 'Заказчик';
    const at = message.at ? ` · ${message.at}` : '';
    lines.push('', `**${author}${at}:**`, '');
    for (const line of textValue.split('\n')) lines.push(`> ${line}`);
    lines.push(...attachmentLines(message.attachments));
  }
  return lines;
}

function field(label, value) {
  const text = String(value ?? '').trim();
  if (!text) return [`**${label}:** —`];
  if (!text.includes('\n')) return [`**${label}:** ${text}`];
  return [`**${label}:**`, '', ...text.split('\n').map((line) => `> ${line}`)];
}

function sourceHintLine(hints) {
  if (!Array.isArray(hints) || hints.length === 0) return '';
  return hints
    .slice(0, 5)
    .map((hint) => {
      if (!hint || !hint.file) return '';
      const match = hint.match ? ` (${oneLine(hint.match, 40)})` : '';
      return inlineCode(`${hint.file}${hint.line ? `:${hint.line}` : ''}`) + match;
    })
    .filter(Boolean)
    .join(', ');
}

export function formatCommentMarkdown(comment, index = 0) {
  const anchor = comment?.anchor || {};
  const lines = [];
  const id = comment?.id || 'comment';
  const status = comment?.status || 'open';
  const title = `${index ? `${index}. ` : ''}${inlineCode(id)} · ${status}`;
  lines.push(`### ${title}`, '');
  lines.push(...field('Комментарий', comment?.comment));
  lines.push(...attachmentLines(comment?.attachments));
  const thread = Array.isArray(comment?.thread) ? comment.thread : [];
  const threadHasResolution = thread.some((message) => message?.kind === 'resolution');
  if (comment?.rejection?.reason) {
    lines.push('', ...field('Причина отклонения', comment.rejection.reason));
  }
  if (comment?.resolution && !threadHasResolution) {
    lines.push('', ...field('Решение', comment.resolution));
  }
  lines.push(...threadLines(thread));
  const elementText = oneLine(anchor.text, 120);
  const element = [anchor.tag ? inlineCode(anchor.tag) : '', elementText ? `«${elementText}»` : '']
    .filter(Boolean)
    .join(' ');
  if (element) lines.push('', `**Элемент:** ${element}`);
  if (anchor.selector) lines.push(`**Селектор:** ${inlineCode(anchor.selector)}`);
  if (comment?.url) lines.push(`**Страница:** ${inlineCode(comment.url)}`);
  const where = whereLine(anchor);
  if (where) lines.push(`**Где:** ${where}`);
  if (anchor.point) {
    lines.push(
      `**Точка:** ${Math.round((Number(anchor.point.x) || 0) * 100)}% / ` +
        `${Math.round((Number(anchor.point.y) || 0) * 100)}%`
    );
  }
  const hintLine = sourceHintLine(comment?.sourceHints);
  if (hintLine) lines.push(`**Источник:** ${hintLine}`);
  if (comment?.screenshot?.file) {
    lines.push('', `**Скриншот:** ${inlineCode(comment.screenshot.file)}`);
    lines.push('', `![Скриншот](${comment.screenshot.file})`);
  }
  if (anchor.html) {
    const html = String(anchor.html);
    const clipped = html.length > 4000 ? `${html.slice(0, 3999)}…` : html;
    lines.push('', '**HTML:**', '', fenced(clipped));
  }
  if (comment?.createdAt) lines.push('', `**Создан:** ${comment.createdAt}`);
  if (comment?.updatedAt && comment.updatedAt !== comment.createdAt) {
    lines.push(`**Обновлён:** ${comment.updatedAt}`);
  }
  return lines.join('\n').trim();
}

export function formatAllMarkdown(comments, meta = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const byStatus = (status) => list.filter((comment) => comment.status === status);
  const open = byStatus('open');
  const review = byStatus('review');
  const approved = byStatus('approved');
  const rejected = byStatus('rejected');
  const resolved = byStatus('resolved');
  const orphaned = byStatus('orphaned');
  const wontfix = byStatus('wontfix');
  const project = meta.project || 'website';
  const updatedAt = meta.updatedAt || new Date().toISOString();
  const task = meta.task || null;
  const sections = [];

  sections.push('# Комментарии к сайту', '');
  sections.push(`- Проект: ${inlineCode(project)}`);
  if (task) {
    sections.push(
      `- Задача: ${inlineCode(taskTag(task))} · ${formatTaskDate(task.createdAt)}` +
        (task.description ? ` · ${oneLine(task.description, 160)}` : '')
    );
    sections.push(`- Статус задачи: ${taskStatusLabel(task.status)}`);
  }
  sections.push(`- Обновлено: ${updatedAt}`);
  sections.push(
    `- Всего: ${list.length} · открытых: ${open.length} · на проверке: ${review.length} · ` +
      `проверено: ${approved.length} · отклонено: ${rejected.length} · решённых: ${resolved.length} · ` +
      `не найдено: ${orphaned.length} · не правим: ${wontfix.length}`
  );
  sections.push('');
  sections.push(
    'Инструкция для агента: разбери открытые и отклонённые комментарии. У отклонённых в поле ' +
      '«Причина отклонения» указано, что нужно доделать. Найди исходники по селектору, тексту, HTML ' +
      'и подсказкам, внеси минимальные правки. После правок переведи комментарий в «На проверке»: ' +
      '`pin-note comments resolve <id> --resolution "..."`. Когда все комментарии разобраны, выполни ' +
      '`pin-note tasks submit`. Не закрывай задачу самостоятельно: при закрытии человеком все ' +
      'комментарии задачи получают статус «Решён». Не удаляй комментарии.'
  );

  const blocks = [
    ['Открытые', open],
    ['Отклонённые', rejected],
    ['На проверке', review],
    ['Проверенные', approved],
    ['Решённые', resolved],
    ['Не найдены', orphaned],
    ['Не правим', wontfix],
  ];

  let index = 0;
  for (const [label, items] of blocks) {
    if (items.length === 0) continue;
    const countText = `${items.length} ${plural(items.length, 'комментарий', 'комментария', 'комментариев')}`;
    sections.push('', `## ${label} (${countText})`, '');
    for (const comment of items) {
      index += 1;
      sections.push(formatCommentMarkdown(comment, index), '');
    }
  }

  if (list.length === 0) {
    sections.push('', 'Пока нет комментариев.', '');
  }

  return `${sections.join('\n').trim()}\n`;
}
