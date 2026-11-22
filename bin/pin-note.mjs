#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizeBasePath } from '../src/base-path.mjs';
import { detectDevServer } from '../src/dev-server.mjs';
import { createReviewServer } from '../src/server.mjs';
import { ReviewStore } from '../src/store.mjs';
import {
  formatCommentMarkdown,
  formatTaskDate,
  taskStatusLabel,
  taskTag,
} from '../src/shared.mjs';

const HELP = `PinNote 0.1.0

Локальный сервер для комментирования сайта и передачи отзывов AI-агенту.

Использование:
  pin-note [directory] [options]
  pin-note tasks <command> [options]
  pin-note comments <command> [options]

Аргументы:
  directory           Папка со статическим сайтом или корень проекта
                      (по умолчанию текущая; в ней ищется dev-сервер)

Команды задач:
  tasks list          Список задач
  tasks current       Текущая активная задача
  tasks show <tag>    Задача и её комментарии
  tasks submit        Отправить задачу на проверку (для агента)
  tasks close <tag>   Закрыть задачу (только человек, нужен --confirm)
  tasks update <tag>  Изменить короткое описание (--description)
  tasks delete <tag>  Удалить переписку задачи (нужен --confirm)

Команды комментариев:
  comments list       Список комментариев (--task current|all|T-1, --status open)
  comments show <id>  Показать комментарий
  comments resolve <id> --resolution "..."  Отметить решённым
  comments set-status <id> --status orphaned|wontfix --resolution "..."
  comments reopen <id> Вернуть комментарий в текущую задачу

Опции команд:
      --project <dir> Корень проекта (по умолчанию текущая папка)
      --data-dir <dir> Каталог данных (по умолчанию <project>/.review)
      --task <ref>    current, all, T-1 или id задачи
      --json          Машиночитаемый вывод
      --confirm       Подтвердить опасную операцию
  -h, --help

Опции сервера:
  -p, --port <port>   Порт review-сервера (по умолчанию 4174)
      --host <host>   Хост (по умолчанию 127.0.0.1)
      --target <url>  Явно указать адрес dev-сервера (например http://localhost:5173)
      --base <path>   Базовый путь сайта (например /portfolio), если он не определился сам
      --no-detect     Не искать dev-сервер автоматически, работать как статический сервер
      --data-dir <dir> Каталог для comments.json, feedback.md и AGENT.md (по умолчанию <directory>/.review)
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
    basePath: null,
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
    if (arg === '--base') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан базовый путь');
      options.basePath = normalizeBasePath(value);
      if (!options.basePath) throw new Error(`Некорректный базовый путь: ${value}`);
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

function parseCommandArgs(argv) {
  const options = {
    project: process.cwd(),
    dataDir: null,
    task: null,
    status: null,
    json: false,
    confirm: false,
    description: undefined,
    resolution: undefined,
    resolutionStdin: false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--confirm' || arg === '-y') {
      options.confirm = true;
      continue;
    }
    if (arg === '--resolution-stdin') {
      options.resolutionStdin = true;
      continue;
    }
    if (arg === '--project' || arg === '--data-dir' || arg === '--task' || arg === '--status' || arg === '--description' || arg === '--resolution') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`Не указано значение для ${arg}`);
      if (arg === '--project') options.project = value;
      if (arg === '--data-dir') options.dataDir = value;
      if (arg === '--task') options.task = value;
      if (arg === '--status') options.status = value;
      if (arg === '--description') options.description = value;
      if (arg === '--resolution') options.resolution = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Неизвестная опция: ${arg}`);
    positional.push(arg);
  }

  return { options, positional };
}

async function openCommandStore(options) {
  const root = resolve(options.project || process.cwd());
  if (!(await isDirectory(root))) throw new Error(`Папка не найдена: ${root}`);
  const dataDir = options.dataDir ? resolve(options.dataDir) : join(root, '.review');
  return new ReviewStore({ root, dataDir, sourceRoot: root });
}

function printTaskLine(task) {
  const counts = task.counts || {};
  const done = (counts.resolved || 0) + (counts.wontfix || 0);
  const total = task.total || 0;
  const description = task.description ? ` · ${task.description}` : '';
  return `${taskTag(task)} · ${formatTaskDate(task.createdAt)} · ${taskStatusLabel(task.status)} · ${done}/${total}${description}`;
}

function printCommentLine(comment, task) {
  const tag = task ? taskTag(task) : '';
  return `${comment.id} · ${tag ? `${tag} · ` : ''}${comment.status} · ${comment.comment}`;
}

async function readStdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function reportCommandError(err, json) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ error: err.message, details: err.details || null }, null, 2)}\n`
    );
  } else {
    console.error(`[pin-note] ${err.message}`);
    for (const blocker of err.details?.blockers || []) {
      console.error(`  ${blocker.id} · ${blocker.status} · ${blocker.comment}`);
    }
  }
  process.exitCode = 1;
}

async function runTasksCommand(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`pin-note tasks <command> [options]

  list          Список задач
  current       Текущая активная задача
  show <tag>    Задача и её комментарии
  submit [tag]  Отправить задачу на проверку (по умолчанию текущую)
  close <tag>   Закрыть задачу (нужен --confirm)
  update <tag> --description "..."  Изменить описание
  delete <tag>  Удалить переписку задачи (нужен --confirm)

Опции: --project <dir>, --data-dir <dir>, --task <ref>, --description "...", --json`);
    return;
  }

  let options;
  let positional;
  try {
    ({ options, positional } = parseCommandArgs(argv.slice(1)));
  } catch (err) {
    reportCommandError(err, false);
    return;
  }
  if (options.help) {
    console.log('Смотри pin-note tasks --help');
    return;
  }

  try {
    const store = await openCommandStore(options);
    if (subcommand === 'list') {
      const tasks = await store.listTasks();
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ tasks }, null, 2)}\n`);
      } else if (tasks.length === 0) {
        console.log('Задач нет');
      } else {
        for (const task of tasks) console.log(printTaskLine(task));
      }
      return;
    }
    if (subcommand === 'current') {
      const task = await store.currentTask();
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
      } else if (task) {
        console.log(printTaskLine(task));
      } else {
        console.log('Нет активной задачи');
      }
      return;
    }
    if (subcommand === 'show') {
      const taskRef = positional[0] || options.task || 'current';
      const task = await store.getTask(taskRef);
      if (!task) throw new Error(`Задача не найдена: ${taskRef}`);
      const state = await store.read();
      const comments = state.comments.filter((comment) => comment.taskId === task.id);
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task, comments }, null, 2)}\n`);
      } else {
        console.log(printTaskLine(task));
        if (comments.length === 0) console.log('  комментариев нет');
        for (const comment of comments) console.log(`  ${printCommentLine(comment, task)}`);
      }
      return;
    }
    if (subcommand === 'submit') {
      const taskRef = positional[0] || options.task || 'current';
      const task = await store.submitTask(taskRef);
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
      } else {
        console.log(`${taskTag(task)} отправлена на проверку. Закрыть её может человек.`);
      }
      return;
    }
    if (subcommand === 'close') {
      if (!options.confirm) throw new Error('Для закрытия задачи добавь --confirm');
      const taskRef = positional[0] || options.task || 'current';
      const task = await store.closeTask(taskRef);
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
      } else {
        console.log(`${taskTag(task)} закрыта`);
      }
      return;
    }
    if (subcommand === 'update') {
      const taskRef = positional[0] || options.task;
      if (!taskRef) throw new Error('Укажи задачу: T-1 или id');
      const description =
        options.description !== undefined
          ? options.description
          : positional.slice(1).join(' ').trim();
      if (description === undefined || description === '') {
        throw new Error('Укажи --description "короткое описание"');
      }
      const task = await store.updateTask(taskRef, { description });
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
      } else {
        console.log(`${taskTag(task)} · ${task.description}`);
      }
      return;
    }
    if (subcommand === 'delete') {
      if (!options.confirm) throw new Error('Для удаления переписки добавь --confirm');
      const taskRef = positional[0] || options.task;
      if (!taskRef) throw new Error('Укажи задачу: T-1 или id');
      const result = await store.removeTask(taskRef);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        console.log(`${taskTag(result.task)} удалена · комментариев: ${result.deletedComments}`);
      }
      return;
    }
    throw new Error(`Неизвестная команда tasks: ${subcommand}`);
  } catch (err) {
    reportCommandError(err, options.json);
  }
}

async function runCommentsCommand(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`pin-note comments <command> [options]

  list [--task current|all|T-1] [--status open]
  show <id>
  resolve <id> --resolution "..." | --resolution-stdin
  set-status <id> --status orphaned|wontfix --resolution "..."
  reopen <id>

Опции: --project <dir>, --data-dir <dir>, --json`);
    return;
  }

  let options;
  let positional;
  try {
    ({ options, positional } = parseCommandArgs(argv.slice(1)));
  } catch (err) {
    reportCommandError(err, false);
    return;
  }
  if (options.help) {
    console.log('Смотри pin-note comments --help');
    return;
  }

  try {
    const store = await openCommandStore(options);
    if (subcommand === 'list') {
      const state = await store.read();
      const taskRef = options.task || 'current';
      let task = null;
      let comments = state.comments;
      if (taskRef !== 'all') {
        task = await store.getTask(taskRef);
        if (!task && taskRef !== 'current') throw new Error(`Задача не найдена: ${taskRef}`);
        comments = task ? comments.filter((comment) => comment.taskId === task.id) : [];
      }
      if (options.status) {
        comments = comments.filter((comment) => comment.status === options.status);
      }
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ task, comments }, null, 2)}\n`);
      } else if (comments.length === 0) {
        console.log('Комментариев нет');
      } else {
        for (const comment of comments) console.log(printCommentLine(comment, task));
      }
      return;
    }
    if (subcommand === 'show') {
      const id = positional[0];
      if (!id) throw new Error('Укажи id комментария');
      const state = await store.read();
      const comment = state.comments.find((item) => item.id === id);
      if (!comment) throw new Error(`Комментарий не найден: ${id}`);
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ comment }, null, 2)}\n`);
      } else {
        console.log(formatCommentMarkdown(comment));
      }
      return;
    }
    if (subcommand === 'resolve') {
      const id = positional[0];
      if (!id) throw new Error('Укажи id комментария');
      const resolution =
        options.resolution !== undefined
          ? options.resolution
          : options.resolutionStdin
            ? await readStdinText()
            : undefined;
      if (resolution === undefined || !resolution.trim()) {
        throw new Error('Укажи --resolution "..." или --resolution-stdin');
      }
      const comment = await store.update(id, { status: 'resolved', resolution });
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ comment }, null, 2)}\n`);
      } else {
        console.log(`${comment.id} · resolved`);
      }
      return;
    }
    if (subcommand === 'set-status') {
      const id = positional[0];
      if (!id) throw new Error('Укажи id комментария');
      if (!options.status) throw new Error('Укажи --status');
      const resolution =
        options.resolution !== undefined
          ? options.resolution
          : options.resolutionStdin
            ? await readStdinText()
            : undefined;
      if (['resolved', 'wontfix', 'orphaned'].includes(options.status) && !resolution?.trim()) {
        throw new Error('Для этого статуса укажи --resolution "..."');
      }
      const patch = { status: options.status };
      if (resolution !== undefined) patch.resolution = resolution;
      const comment = await store.update(id, patch);
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ comment }, null, 2)}\n`);
      } else {
        console.log(`${comment.id} · ${comment.status}`);
      }
      return;
    }
    if (subcommand === 'reopen') {
      const id = positional[0];
      if (!id) throw new Error('Укажи id комментария');
      const result = await store.reopenComment(id);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        console.log(`${result.comment.id} · open · ${result.cloned ? 'создана копия в текущей задаче' : 'возвращён в работу'}`);
      }
      return;
    }
    throw new Error(`Неизвестная команда comments: ${subcommand}`);
  } catch (err) {
    reportCommandError(err, options.json);
  }
}

async function main() {
  const rawArgv = process.argv.slice(2);
  if (rawArgv[0] === 'tasks' || rawArgv[0] === 'task') {
    await runTasksCommand(rawArgv.slice(1));
    return;
  }
  if (rawArgv[0] === 'comments') {
    await runCommentsCommand(rawArgv.slice(1));
    return;
  }

  let parsed;
  try {
    parsed = parseArgs(rawArgv);
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
    detection = await detectDevServer(root, {
      basePath: options.basePath === null ? undefined : options.basePath,
    });
    if (detection.url) {
      options.target = detection.url;
      options.detectedTarget = true;
      options.basePath = detection.base || null;
    } else if (detection.candidates.length > 1) {
      console.error(`[pin-note] ${detection.reason} для ${displayPath(root)}:`);
      for (const candidate of detection.candidates) {
        console.error(`  ${candidate.siteUrl || candidate.url} — ${candidate.command}`);
      }
      console.error('[pin-note] Укажи нужный через --target (без базового пути) или отключи поиск через --no-detect.');
      process.exitCode = 1;
      return;
    }
  }
  options.basePath = options.basePath || null;

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
      basePath: options.basePath || undefined,
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

  const reviewUrl = options.basePath ? `${listening.url}${options.basePath}` : listening.url;
  console.log('');
  console.log('  PinNote');
  if (options.target) {
    console.log(`  Dev:       ${options.target}${options.detectedTarget ? ' (автоопределён)' : ''}`);
    console.log(`  Проект:    ${displayPath(root)}`);
  } else {
    console.log(`  Сайт:      ${displayPath(root)}`);
  }
  console.log(`  Review:    ${reviewUrl}`);
  console.log(`  Комментарии: ${displayPath(review.store.commentsFile)}`);
  console.log('  Остановить: Ctrl+C');
  console.log('');

  if (options.open && process.stdout.isTTY) openBrowser(reviewUrl);

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
