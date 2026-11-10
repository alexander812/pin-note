import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.astro',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.md',
  '.mdx',
  '.php',
  '.twig',
  '.njk',
  '.liquid',
]);

const SKIP_DIRS = new Set([
  '.git',
  '.review',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.turbo',
  '.vercel',
  '.output',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'test',
  'tests',
  '__tests__',
  'vendor',
]);

const PRIORITY_DIRS = new Map([
  ['src', 0],
  ['app', 1],
  ['pages', 2],
  ['components', 3],
  ['source', 1],
  ['styles', 4],
  ['css', 4],
  ['lib', 5],
]);

const COMMON_CLASSES = new Set([
  'active',
  'btn',
  'button',
  'card',
  'col',
  'container',
  'content',
  'current',
  'hidden',
  'inner',
  'item',
  'list',
  'main',
  'open',
  'outer',
  'row',
  'section',
  'selected',
  'show',
  'text',
  'title',
  'visible',
  'wrapper',
]);

const MAX_FILES = 600;
const MAX_DEPTH = 7;
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_HTML_SIZE = 200 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

function filePriority(path) {
  const first = path.split('/')[0];
  return PRIORITY_DIRS.get(first) ?? 9;
}

function entryPriority(entry) {
  if (entry.isDirectory()) return PRIORITY_DIRS.get(entry.name) ?? 20;
  return 10;
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function addTerm(terms, seen, value, score, label) {
  const text = String(value ?? '').trim();
  if (text.length < 3) return;
  if (text.length > 160) return;
  if (seen.has(text)) return;
  seen.add(text);
  terms.push({ value: text, score, label });
}

function buildTerms(anchor) {
  const terms = [];
  const seen = new Set();
  const text = normalize(anchor?.text);
  if (text.length >= 3) {
    addTerm(terms, seen, text, 0, 'text');
    if (text.length > 80) addTerm(terms, seen, text.slice(0, 80), 1, 'text');
    else if (text.length > 40) addTerm(terms, seen, text.slice(0, 40), 1, 'text');
    const lastPart = text.split(/[.!?…]/).map((part) => part.trim()).filter(Boolean).pop();
    if (lastPart && lastPart !== text && lastPart.length >= 8) {
      addTerm(terms, seen, lastPart, 1, 'text');
    }
  }

  const attributes = anchor?.attributes && typeof anchor.attributes === 'object' ? anchor.attributes : {};
  if (typeof attributes.id === 'string') {
    addTerm(terms, seen, attributes.id, 2, `id="${attributes.id}"`);
  }
  if (typeof attributes['aria-label'] === 'string') {
    addTerm(terms, seen, attributes['aria-label'], 2, 'aria-label');
  }
  if (typeof attributes.alt === 'string') {
    addTerm(terms, seen, attributes.alt, 2, 'alt');
  }

  const classes = new Set();
  if (typeof attributes.class === 'string') {
    for (const token of attributes.class.split(/\s+/)) classes.add(token);
  }
  const selector = typeof anchor?.selector === 'string' ? anchor.selector : '';
  for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) classes.add(match[1]);

  for (const token of classes) {
    if (token.length < 3 || token.length > 40) continue;
    if (COMMON_CLASSES.has(token)) continue;
    if (/^[a-f0-9]{6,}$/i.test(token)) continue;
    addTerm(terms, seen, token, 3, `class="${token}"`);
    if (terms.length >= 12) break;
  }

  return terms;
}

async function collectFiles(root) {
  const files = [];
  let totalBytes = 0;

  async function walk(directory, depth) {
    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => entryPriority(a) - entryPriority(b) || a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(extension)) continue;

      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }
      const limit = extension === '.html' || extension === '.htm' ? MAX_HTML_SIZE : MAX_FILE_SIZE;
      if (info.size > limit) continue;
      if (totalBytes + info.size > MAX_TOTAL_BYTES) return;
      totalBytes += info.size;
      files.push(fullPath);
    }
  }

  await walk(root, 0);
  return files;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Finds likely source files for a DOM anchor. This is intentionally a
 * best-effort grep, not a source map: the agent still verifies the match.
 */
export async function findSourceHints(root, anchor, options = {}) {
  const terms = buildTerms(anchor);
  if (terms.length === 0) return [];

  const limit = Math.max(1, Math.min(10, options.limit || 5));
  const files = await collectFiles(root);
  const matches = [];

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    let best = null;
    for (const term of terms) {
      const index = text.indexOf(term.value);
      if (index === -1) continue;
      if (!best || term.score < best.score) {
        best = {
          file: relative(root, file),
          line: lineAt(text, index),
          match: term.label,
          score: term.score,
        };
      }
      if (best.score === 0) break;
    }
    if (best) matches.push(best);
  }

  matches.sort((a, b) => {
    return (
      a.score - b.score ||
      filePriority(a.file) - filePriority(b.file) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line
    );
  });

  const seen = new Set();
  const hints = [];
  for (const match of matches) {
    const key = `${match.file}:${match.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ file: match.file, line: match.line, match: match.match });
    if (hints.length >= limit) break;
  }
  return hints;
}
