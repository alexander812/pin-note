export const STATUSES = ['open', 'resolved', 'wontfix', 'orphaned'];

export const STATUS_LABELS = {
  open: 'Открыт',
  resolved: 'Решён',
  wontfix: 'Не правим',
  orphaned: 'Не найден',
};

export const STATUS_ORDER = {
  open: 0,
  orphaned: 1,
  resolved: 2,
  wontfix: 3,
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Неизвестно';
}

export function isOpenStatus(status) {
  return status === 'open' || status === 'orphaned';
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
  if (comment?.resolution) {
    lines.push('', ...field('Решение', comment.resolution));
  }
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
  const open = list.filter((comment) => comment.status === 'open');
  const orphaned = list.filter((comment) => comment.status === 'orphaned');
  const resolved = list.filter((comment) => comment.status === 'resolved');
  const wontfix = list.filter((comment) => comment.status === 'wontfix');
  const project = meta.project || 'website';
  const updatedAt = meta.updatedAt || new Date().toISOString();
  const sections = [];

  sections.push('# Комментарии к сайту', '');
  sections.push(`- Проект: ${inlineCode(project)}`);
  sections.push(`- Обновлено: ${updatedAt}`);
  sections.push(
    `- Всего: ${list.length} · открытых: ${open.length} · не найдено: ${orphaned.length} · ` +
      `решённых: ${resolved.length} · не правим: ${wontfix.length}`
  );
  sections.push('');
  sections.push(
    'Инструкция для агента: разбери открытые комментарии, найди исходники по селектору, тексту, ' +
      'HTML и подсказкам, внеси минимальные правки. После проверки обнови `status` и `resolution` ' +
      'в `.review/comments.json`. Не удаляй комментарии и не меняй чужие поля.'
  );

  const blocks = [
    ['Открытые', open],
    ['Не найдены', orphaned],
    ['Решённые', resolved],
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
