import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EN_MESSAGES,
  createTranslator,
  detectBrowserLocale,
  interpolate,
  localeTag,
  normalizeLocale,
  pluralForm,
  readStoredLocale,
  storeLocale,
  translateServerMessage,
} from '../src/i18n.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test('normalizes supported browser locales', () => {
  assert.equal(normalizeLocale('ru'), 'ru');
  assert.equal(normalizeLocale('ru-RU'), 'ru');
  assert.equal(normalizeLocale('RU_ru'), 'ru');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('de-DE'), '');
  assert.equal(normalizeLocale(''), '');
});

test('detects the browser locale with English as fallback', () => {
  assert.equal(detectBrowserLocale({ languages: ['ru-RU', 'en-US'], language: 'ru-RU' }), 'ru');
  assert.equal(detectBrowserLocale({ languages: ['en-GB'], language: 'en-GB' }), 'en');
  assert.equal(detectBrowserLocale({ languages: ['de-DE', 'ru'], language: 'de-DE' }), 'ru');
  assert.equal(detectBrowserLocale({ languages: ['fr-FR'], language: 'fr-FR' }), 'en');
  assert.equal(detectBrowserLocale(null), 'en');
});

test('reads and stores a manual locale choice', () => {
  const storage = memoryStorage();
  assert.equal(readStoredLocale(storage), '');
  assert.equal(storeLocale(storage, 'en'), true);
  assert.equal(readStoredLocale(storage), 'en');
  assert.equal(storeLocale(storage, 'en-US'), true);
  assert.equal(readStoredLocale(storage), 'en');
  assert.equal(storeLocale(storage, 'fr'), false);
});

test('translates UI source strings', () => {
  const ru = createTranslator('ru');
  const en = createTranslator('en');
  assert.equal(ru('Задачи'), 'Задачи');
  assert.equal(en('Задачи'), 'Tasks');
  assert.equal(en('Комментировать'), 'Comment');
  assert.equal(en('Неизвестный ключ'), 'Неизвестный ключ');
  assert.equal(ru('Неизвестный ключ'), 'Неизвестный ключ');
});

test('interpolates placeholders without losing braces for unknown names', () => {
  const en = createTranslator('en');
  assert.equal(en('Файл больше {size} не прикреплён', { size: '12 МБ' }), 'The file is larger than 12 МБ and was not attached');
  assert.equal(interpolate('{known} {unknown}', { known: 'x' }), 'x {unknown}');
  assert.equal(interpolate('no placeholders', { known: 'x' }), 'no placeholders');
});

test('returns locale-aware date tags', () => {
  assert.equal(localeTag('ru'), 'ru-RU');
  assert.equal(localeTag('ru-RU'), 'ru-RU');
  assert.equal(localeTag('en'), 'en-US');
  assert.equal(localeTag('fr'), 'en-US');
});

test('pluralizes fixes and tasks in both locales', () => {
  const forms = {
    ruOne: 'правка',
    ruFew: 'правки',
    ruMany: 'правок',
    enOne: 'fix',
    enMany: 'fixes',
  };
  assert.equal(pluralForm('ru', 1, forms), 'правка');
  assert.equal(pluralForm('ru', 2, forms), 'правки');
  assert.equal(pluralForm('ru', 5, forms), 'правок');
  assert.equal(pluralForm('ru', 11, forms), 'правок');
  assert.equal(pluralForm('ru', 21, forms), 'правка');
  assert.equal(pluralForm('en', 1, forms), 'fix');
  assert.equal(pluralForm('en', 0, forms), 'fixes');
  assert.equal(pluralForm('en', 2, forms), 'fixes');
});

test('translates server errors only for the English locale', () => {
  assert.equal(translateServerMessage('Задача не найдена', 'ru'), 'Задача не найдена');
  assert.equal(translateServerMessage('Задача не найдена', 'en'), 'Task not found');
  assert.equal(
    translateServerMessage('Некорректный JSON: Unexpected token', 'en'),
    'Invalid JSON: Unexpected token'
  );
  assert.equal(
    translateServerMessage('Выполняет: npm test', 'en'),
    'Running: npm test'
  );
  assert.equal(translateServerMessage('Правит: файлы', 'en'), 'Editing: files');
  assert.equal(translateServerMessage('Файл слишком большой', 'en'), 'File is too large');
  assert.equal(
    translateServerMessage('Скриншот слишком большой', 'en'),
    'Screenshot is too large'
  );
  assert.equal(
    translateServerMessage('Агент уже работает — дождитесь завершения или остановите его', 'en'),
    'The agent is already running — wait for it to finish or stop it'
  );
  assert.equal(translateServerMessage('Already English', 'en'), 'Already English');
});

test('every Russian UI literal in the client has an English translation', () => {
  const client = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  // These literals are plural forms or native language names, not UI copy.
  const allowed = new Set(['правка', 'правки', 'правок', 'задача', 'задачи', 'задач', 'Русский']);
  const missing = [];
  for (const line of client.split('\n')) {
    for (const match of line.matchAll(/(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)")/g)) {
      const value = match[1] ?? match[2] ?? '';
      if (!/[А-Яа-яЁё]/.test(value) || allowed.has(value)) continue;
      if (!EN_MESSAGES[value]) missing.push(value);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
