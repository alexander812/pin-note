#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { detectDevServer } from '../src/dev-server.mjs';
import { createReviewServer } from '../src/server.mjs';

const HELP = `PinNote 0.1.0

Локальный сервер для комментирования сайта и передачи отзывов AI-агенту.

Использование:
  pin-note [directory] [options]

Аргументы:
  directory           Папка со статическим сайтом или корень проекта
                      (по умолчанию текущая; в ней ищется dev-сервер)

Опции:
  -p, --port <port>   Порт review-сервера (по умолчанию 4174)
      --host <host>   Хост (по умолчанию 127.0.0.1)
      --target <url>  Явно указать адрес dev-сервера (например http://localhost:5173)
      --no-detect     Не искать dev-сервер автоматически, работать как статический сервер
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
    target: null,
    noDetect: false,
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
    if (arg === '--no-detect') {
      options.noDetect = true;
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
    if (arg === '--target') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан target dev-сервера');
      options.target = value;
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

async function isPinNoteCheckout(path) {
  try {
    const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
    return pkg?.name === 'pin-note' && (await exists(`${path}/bin/pin-note.mjs`));
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
  const hasIndex = await exists(`${root}/index.html`);
  let detection = null;

  if (!options.target && !options.noDetect) {
    detection = await detectDevServer(root);
    if (detection.url) {
      options.target = detection.url;
      options.detectedTarget = true;
    } else if (detection.candidates.length > 1) {
      console.error(`[pin-note] ${detection.reason} для ${displayPath(root)}:`);
      for (const candidate of detection.candidates) {
        console.error(`  ${candidate.url} — ${candidate.command}`);
      }
      console.error('[pin-note] Укажи нужный через --target или отключи поиск через --no-detect.');
      process.exitCode = 1;
      return;
    }
  }

  if (options.target && !options.detectedTarget && !options.dataDir && (await isPinNoteCheckout(root))) {
    console.error('[pin-note] В режиме --target первым аргументом указывается корень проекта.');
    console.error(`[pin-note] Сейчас используется папка PinNote: ${displayPath(root)}`);
    console.error('[pin-note] Пример: pin-note ~/p/portfolio-deepsick --target http://localhost:4322');
    console.error('[pin-note] Если папка PinNote выбрана осознанно, укажи --data-dir явно.');
    process.exitCode = 1;
    return;
  }

  if (!options.target && !hasIndex) {
    if (detection?.reason) {
      console.warn(`[pin-note] ${detection.reason}.`);
      console.warn('[pin-note] Запусти dev-сервер или укажи --target <url>, либо передай папку со сборкой.');
    } else {
      console.warn(`[pin-note] В ${displayPath(root)} нет index.html — проверь путь.`);
    }
  }

  let review;
  try {
    review = await createReviewServer({
      root,
      dataDir: options.dataDir ? resolve(options.dataDir) : undefined,
      sourceRoot: options.sourceDir ? resolve(options.sourceDir) : undefined,
      target: options.target || undefined,
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
  if (options.target) {
    console.log(`  Dev:       ${options.target}${options.detectedTarget ? ' (автоопределён)' : ''}`);
    console.log(`  Проект:    ${displayPath(root)}`);
  } else {
    console.log(`  Сайт:      ${displayPath(root)}`);
  }
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
