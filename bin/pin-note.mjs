#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { access, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizeBasePath } from '../src/base-path.mjs';
import { checkAgentReadiness, resolveAgentConfig } from '../src/agent.mjs';
import { installAgentCli, installInfo, installSupported } from '../src/agent-install.mjs';
import { detectDevServer } from '../src/dev-server.mjs';
import { createReviewServer } from '../src/server.mjs';
import { ReviewStore } from '../src/store.mjs';
import { runWizard } from '../src/wizard.mjs';
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
  pin-note wizard
  pin-note tasks <command> [options]
  pin-note comments <command> [options]
  pin-note agent check [options]

Аргументы:
  directory           Папка со статическим сайтом или корень проекта
                      (по умолчанию текущая; в ней ищется dev-сервер)

Мастер:
  wizard              Спросить папку проекта и агента, проверить готовность
                      и запустить review-сервер (то же при запуске без аргументов)

Команды агента:
  agent check         Проверить, готов ли выбранный агент к работе
                      (--agent dsh|codex|custom, --project <dir>, --json)

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
  comments resolve <id> --resolution "..."  Отправить на проверку (статус review)
  comments set-status <id> --status review|resolved|wontfix|orphaned --resolution "..."
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
      --agent <name>  AI-агент: dsh, codex, custom или off (по умолчанию автоопределение)
      --agent-command <cmd>  Команда агента (переопределяет провайдера)
      --agent-config <file>  JSON-конфиг агента (по умолчанию <data-dir>/agent.json)
      --model <name>  Модель агента (для Codex — --model; пусто — из конфига)
      --no-agent      Не запускать AI-агента
      --no-wizard     Не запускать мастер при вызове без аргументов
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
    agent: null,
    agentCommand: null,
    agentConfig: null,
    agentModel: null,
    noWizard: false,
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
    if (arg === '--no-agent') {
      options.agent = 'off';
      continue;
    }
    if (arg === '--no-wizard') {
      options.noWizard = true;
      continue;
    }
    if (arg === '--agent') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан AI-агент');
      options.agent = value;
      index += 1;
      continue;
    }
    if (arg === '--agent-command') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указана команда агента');
      options.agentCommand = value;
      index += 1;
      continue;
    }
    if (arg === '--agent-config') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указан конфиг агента');
      options.agentConfig = value;
      index += 1;
      continue;
    }
    if (arg === '--model') {
      const value = argv[index + 1];
      if (!value) throw new Error('Не указана модель агента');
      options.agentModel = value;
      index += 1;
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
    agent: null,
    agentCommand: null,
    agentConfig: null,
    model: null,
    install: false,
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
    if (arg === '--install') {
      options.install = true;
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
    if (arg === '--project' || arg === '--data-dir' || arg === '--task' || arg === '--status' || arg === '--description' || arg === '--resolution' || arg === '--agent' || arg === '--agent-command' || arg === '--agent-config' || arg === '--model') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`Не указано значение для ${arg}`);
      if (arg === '--project') options.project = value;
      if (arg === '--data-dir') options.dataDir = value;
      if (arg === '--task') options.task = value;
      if (arg === '--status') options.status = value;
      if (arg === '--description') options.description = value;
      if (arg === '--resolution') options.resolution = value;
      if (arg === '--agent') options.agent = value;
      if (arg === '--agent-command') options.agentCommand = value;
      if (arg === '--agent-config') options.agentConfig = value;
      if (arg === '--model') options.model = value;
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
  const done = (counts.approved || 0) + (counts.resolved || 0) + (counts.wontfix || 0);
  const total = task.total || 0;
  const description = task.description ? ` · ${task.description}` : '';
  return `${taskTag(task)} · ${formatTaskDate(task.createdAt)} · ${taskStatusLabel(task.status)} · ${done}/${total}${description}`;
}

function printCommentLine(comment, task) {
  const tag = task ? taskTag(task) : '';
  const reason = comment.rejection?.reason ? ` · причина отклонения: ${comment.rejection.reason}` : '';
  return `${comment.id} · ${tag ? `${tag} · ` : ''}${comment.status}${reason} · ${comment.comment}`;
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
      const hasActive = Boolean(await store.currentTask());
      const taskRef = positional[0] || options.task || (hasActive ? 'current' : 'latest');
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
  set-status <id> --status review|resolved|wontfix|orphaned --resolution "..."
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
      const taskRef = options.task || (options.status === 'rejected' ? 'all' : 'current');
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
      const comment = await store.update(id, { status: 'review', resolution });
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ comment }, null, 2)}\n`);
      } else {
        console.log(`${comment.id} · review (на проверке)`);
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
      if (['resolved', 'rejected', 'wontfix', 'orphaned'].includes(options.status) && !resolution?.trim()) {
        throw new Error('Для этого статуса укажи --resolution "..."');
      }
      const patch = { status: options.status };
      if (resolution !== undefined) {
        patch.resolution = resolution;
        if (options.status === 'rejected') patch.rejectionReason = resolution;
      }
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

async function askYesNo(question, defaultValue = 'n') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [${defaultValue}] `)).trim() || defaultValue;
    return /^y/i.test(answer);
  } finally {
    rl.close();
  }
}

async function runAgentCommand(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`pin-note agent <command> [options]

  check        Проверить готовность агента к работе

Опции: --project <dir>, --data-dir <dir>, --agent dsh|codex|custom|off,
       --agent-command <cmd>, --agent-config <file>, --model <name>,
       --install, --json`);
    return;
  }
  if (subcommand !== 'check') {
    console.error(`[pin-note] Неизвестная команда agent: ${subcommand}`);
    process.exitCode = 1;
    return;
  }

  let options;
  try {
    ({ options } = parseCommandArgs(argv.slice(1)));
  } catch (err) {
    reportCommandError(err, false);
    return;
  }
  if (options.help) {
    console.log('Смотри pin-note agent --help');
    return;
  }

  try {
    const root = resolve(options.project || process.cwd());
    if (!(await isDirectory(root))) throw new Error(`Папка не найдена: ${root}`);
    const dataDir = options.dataDir ? resolve(options.dataDir) : join(root, '.review');
    let config = await resolveAgentConfig({
      options: {
        provider: options.agent || undefined,
        command: options.agentCommand || undefined,
        configFile: options.agentConfig || undefined,
        model: options.model || undefined,
      },
      dataDir,
      root,
    });
    let readiness = await checkAgentReadiness(config, { root, dataDir });

    if (
      !readiness.ready &&
      config.missingCommand &&
      installSupported(config.provider)
    ) {
      const info = installInfo(config.provider);
      const shouldInstall =
        options.install ||
        (!options.json &&
          (await askYesNo(`${info.label} не найден. Установить ${info.command}? (y/N)`, 'n')));
      if (shouldInstall) {
        const result = await installAgentCli(config.provider, {
          cwd: root,
          quiet: Boolean(options.json),
          log: options.json ? (...args) => console.error(...args) : console.log,
        });
        if (!result.ok) {
          console.error(`[pin-note] ${result.error}`);
        } else if (result.warning || !result.command) {
          console.error(`[pin-note] ${result.warning || 'Команда не найдена после установки.'}`);
        } else {
          config = await resolveAgentConfig({
            options: {
              provider: config.provider,
              command: result.command,
              configFile: options.agentConfig || undefined,
            },
            dataDir,
            root,
          });
          readiness = await checkAgentReadiness(config, { root, dataDir });
        }
      }
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
    } else {
      const icons = { ok: '✓', warn: '!', fail: '✗', skip: '–' };
      console.log(`Агент: ${readiness.label} (${readiness.provider})`);
      for (const check of readiness.checks) {
        console.log(`  ${icons[check.status] || '–'} ${check.label}: ${check.detail}`);
      }
      console.log(`\n${readiness.summary}`);
    }
    process.exitCode = readiness.ready ? 0 : 1;
  } catch (err) {
    reportCommandError(err, options.json);
  }
}

async function main(argv = process.argv.slice(2)) {
  const rawArgv = argv;
  if (rawArgv[0] === 'agent') {
    await runAgentCommand(rawArgv.slice(1));
    return;
  }
  if (rawArgv[0] === 'tasks' || rawArgv[0] === 'task') {
    await runTasksCommand(rawArgv.slice(1));
    return;
  }
  if (rawArgv[0] === 'comments') {
    await runCommentsCommand(rawArgv.slice(1));
    return;
  }

  const wizardRequested = rawArgv[0] === 'wizard' || rawArgv[0] === 'setup';
  const wizardByDefault =
    rawArgv.length === 0 &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !process.env.PIN_NOTE_NO_WIZARD;
  if (wizardRequested || wizardByDefault) {
    let result;
    const wizardCwd =
      rawArgv[1] && !rawArgv[1].startsWith('-') ? resolve(rawArgv[1]) : process.cwd();
    try {
      result = await runWizard({ cwd: wizardCwd });
    } catch (err) {
      console.error(`[pin-note] ${err.message}`);
      process.exitCode = 1;
      return;
    }
    if (!result) return;
    const nextArgv = [result.directory];
    if (result.dataDir) nextArgv.push('--data-dir', result.dataDir);
    if (result.agent?.provider) nextArgv.push('--agent', result.agent.provider);
    if (result.agent?.command) nextArgv.push('--agent-command', result.agent.command);
    if (result.agent?.configFile) nextArgv.push('--agent-config', result.agent.configFile);
    await main(nextArgv);
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
      agent: {
        provider: options.agent || undefined,
        command: options.agentCommand || undefined,
        configFile: options.agentConfig || undefined,
        model: options.agentModel || undefined,
      },
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
  const agent = review.agent?.publicConfig?.();
  if (agent?.enabled) {
    console.log(
      `  Агент:     ${agent.label} (${agent.provider}, ${agent.command})` +
        (agent.model ? ` · модель ${agent.model}` : '')
    );
  } else {
    console.log('  Агент:     выключен');
    if (options.agent && options.agent !== 'off' && agent?.reason) {
      console.warn(`[pin-note] ${agent.reason}`);
    }
  }
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
