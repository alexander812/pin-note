#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReviewServer } from '../src/server.mjs';

const HELP = `PinNote 0.1.0

Локальный сервер для комментирования сайта и передачи отзывов AI-агенту.

Использование:
  pin-note [directory] [options]

Аргументы:
  directory           Папка со статическим сайтом (по умолчанию текущая)

Опции:
  -p, --port <port>   Порт review-сервера (по умолчанию 4174)
      --host <host>   Хост (по умолчанию 127.0.0.1)
      --data-dir <dir> Каталог для comments.json и feedback.md (по умолчанию <directory>/.review)
      --source-dir <dir> Где искать исходники для подсказок (по умолчанию <directory>)
      --spa           Отдавать index.html для неизвестных HTML-маршрутов
      --no-open       Не открывать браузер автоматически
      --no-watch      Не следить за файлами и не перезагружать страницу
  -h, --help          Показать эту справку
  -v, --version       Показать версию
`;

function parseArgs(argv) {
  const options = {
    directory: process.cwd(),
    port: 4174,
    host: '127.0.0.1',
    dataDir: null,
    sourceDir: null,
    spa: false,
    open: true,
    watch: true,
    explicitPort: false,
  };
  let directorySet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true, options };
    if (arg === '--version' || arg === '-v') return { version: true, options };
    if (arg === '--no-open') {
      options.open = false;
      continue;
    }
    if (arg === '--no-watch') {
      options.watch = false;
      continue;
    }
    if (arg === '--spa') {
      options.spa = true;
      continue;
    }
    if (arg === '--port' || arg === '-p') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан порт');
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Некорректный порт: ${value}`);
      options.port = port;
      options.explicitPort = true;
      index += 1;
      continue;
    }
    if (arg === '--host') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан хост');
      options.host = value;
      index += 1;
      continue;
    }
    if (arg === '--data-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан каталог данных');
      options.dataDir = value;
      index += 1;
      continue;
    }
    if (arg === '--source-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан каталог исходников');
      options.sourceDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Неизвестная опция: ${arg}`);
    if (directorySet) throw new Error(`Лишний аргумент: ${arg}`);
    options.directory = arg;
    directorySet = true;
  }

  return { options };
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function displayPath(path) {
  const home = process.env.HOME;
  if (home && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Opening a browser is a convenience; failure is not fatal.
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[pin-note] ${err.message}`);
    console.error('Попробуй --help');
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.version) {
    console.log('0.1.0');
    return;
  }

  const options = parsed.options;
  const root = resolve(options.directory);
  if (!(await isDirectory(root))) {
    console.error(`[pin-note] Папка не найдена: ${root}`);
    process.exitCode = 1;
    return;
  }
  if (!(await exists(`${root}/index.html`))) {
    console.warn(`[pin-note] В ${displayPath(root)} нет index.html — проверь путь.`);
  }

  let review;
  try {
    review = await createReviewServer({
      root,
      dataDir: options.dataDir ? resolve(options.dataDir) : undefined,
      sourceRoot: options.sourceDir ? resolve(options.sourceDir) : undefined,
      watch: options.watch,
      spa: options.spa,
    });
  } catch (err) {
    console.error(`[pin-note] ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let listening;
  const attempts = options.explicitPort ? 1 : 20;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const port = options.port + attempt;
    try {
      listening = await review.listen(port, options.host);
      break;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || attempt === attempts - 1) {
        console.error(`[pin-note] Не удалось запустить сервер: ${err.message}`);
        await review.close();
        process.exitCode = 1;
        return;
      }
    }
  }

  console.log('');
  console.log('  PinNote');
  console.log(`  Сайт:      ${displayPath(root)}`);
  console.log(`  Review:    ${listening.url}`);
  console.log(`  Комментарии: ${displayPath(review.store.commentsFile)}`);
  console.log('  Остановить: Ctrl+C');
  console.log('');

  if (options.open && process.stdout.isTTY) openBrowser(listening.url);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n[pin-note] ${signal}: останавливаю сервер…`);
    try {
      await review.close();
    } catch {
      // Ignore shutdown errors.
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('[pin-note]', err);
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (err) => {
    console.error('[pin-note]', err);
    shutdown('unhandledRejection');
  });
}

main();
