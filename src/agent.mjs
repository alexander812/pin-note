import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAllMarkdown, taskTag } from './shared.mjs';

const PIN_NOTE_BIN = fileURLToPath(new URL('../bin/pin-note.mjs', import.meta.url));
const DSH_DESKTOP_APP = '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
const DSH_DESKTOP_ASAR =
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
const DSH_DESKTOP_BIN =
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js';
const DEFAULT_TIMEOUT = 2 * 60 * 60 * 1000;
const SESSION_ID_KEYS = [
  'sessionId',
  'session_id',
  'thread_id',
  'threadId',
  'conversationId',
  'conversation_id',
];

export const CODEX_MODEL_CHOICES = [
  { id: 'gpt-6.1-sol', description: 'основная для кода и повседневных задач' },
  { id: 'gpt-6-astra', description: 'самая мощная, для сложных задач' },
  { id: 'gpt-6-sol', description: 'предыдущая рабочая модель' },
  { id: 'gpt-6-luna', description: 'быстрая модель GPT-6' },
  { id: 'gpt-5.6-sol', description: 'надёжная агентная модель' },
  { id: 'gpt-5.6-terra', description: 'альтернатива GPT-5.6' },
  { id: 'gpt-5.5', description: 'предыдущее поколение' },
  { id: 'gpt-5.4', description: 'стабильная универсальная' },
  { id: 'gpt-5.4-mini', description: 'быстрая и недорогая' },
  { id: 'gpt-5.3-codex-spark', description: 'лёгкая Codex-модель' },
];

// Codex CLI 0.156+ can fail at bootstrap with "workspace routing discovery failed".
// An unrelated -c override makes the CLI initialize normally (openai/codex#52928).
const CODEX_ROUTING_WORKAROUND = ['-c', `log_dir=${JSON.stringify(tmpdir())}`];

export const AGENT_PROVIDERS = {
  dsh: {
    label: 'DeepSeek Harness',
    command: 'dsh',
    args: ['--profile', 'headless', '--permission-mode', 'workspace-write', '--json', '-'],
    resumeArgs: [
      '--profile',
      'headless',
      '--permission-mode',
      'workspace-write',
      '--json',
      '--session-id',
      '{sessionId}',
      '-',
    ],
    env: {},
    sessionIdKeys: SESSION_ID_KEYS,
  },
  codex: {
    label: 'Codex CLI',
    command: 'codex',
    args: [
      'exec',
      '--json',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      ...CODEX_ROUTING_WORKAROUND,
      '-',
    ],
    resumeArgs: [
      'exec',
      'resume',
      '{sessionId}',
      '--json',
      '--skip-git-repo-check',
      ...CODEX_ROUTING_WORKAROUND,
    ],
    env: {},
    sessionIdKeys: SESSION_ID_KEYS,
  },
  custom: {
    label: 'AI-агент',
    command: '',
    args: ['-'],
    resumeArgs: ['{sessionId}', '-'],
    env: {},
    sessionIdKeys: SESSION_ID_KEYS,
  },
};

async function exists(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function commandExists(command) {
  const value = String(command || '').trim();
  if (!value) return false;
  if (value.includes('/') || value.includes('\\')) return exists(value);
  const extensions =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')]
      : [''];
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      if (await exists(join(directory, `${value}${extension}`))) return true;
    }
  }
  return false;
}

async function resolveDshDesktopLauncher() {
  if (!(await fileExists(DSH_DESKTOP_APP)) || !(await fileExists(DSH_DESKTOP_ASAR))) return null;
  return {
    command: DSH_DESKTOP_APP,
    argsPrefix: [DSH_DESKTOP_BIN],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

async function resolveDshLauncher() {
  if (await commandExists('dsh')) {
    return { command: 'dsh', argsPrefix: [], env: {} };
  }
  const node = String(process.env.DSH_NODE_EXECUTABLE || '').trim();
  const install = String(process.env.DSH_INSTALL_DIR || '').trim();
  if (node && install) {
    return {
      command: node,
      argsPrefix: [join(install, 'lib', 'bin.js')],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }
  return resolveDshDesktopLauncher();
}

function stringArray(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((item) => typeof item === 'string');
  return result.length === value.length ? result : fallback;
}

function stringObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && key) result[key] = item;
  }
  return result;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(24 * 60 * 60 * 1000, Math.max(30_000, parsed));
}

function optionalText(value, limit = 200) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, limit) : null;
}

function withModel(args, model, provider) {
  if (provider !== 'codex' || !model) return args;
  if (
    args.some(
      (arg) => arg === '--model' || arg === '-m' || String(arg).startsWith('--model=')
    )
  ) {
    return args;
  }
  return ['--model', model, ...args];
}

function disabledConfig(reason, provider = 'off', label = 'AI-агент', extra = {}) {
  return {
    enabled: false,
    provider,
    label,
    command: null,
    argsPrefix: [],
    args: [],
    resumeArgs: [],
    env: {},
    autoRework: true,
    timeoutMs: DEFAULT_TIMEOUT,
    sessionIdKeys: SESSION_ID_KEYS,
    model: null,
    missingCommand: Boolean(extra.missingCommand),
    reason,
    publicConfig() {
      return {
        enabled: false,
        provider,
        label,
        command: null,
        autoRework: true,
        timeoutMs: DEFAULT_TIMEOUT,
        model: null,
        missingCommand: Boolean(extra.missingCommand),
        reason,
      };
    },
  };
}

async function readConfigFile(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { value: null, error: null };
    return { value: null, error: `Не удалось прочитать ${file}: ${err.message}` };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: `Ожидался JSON-объект в ${file}` };
    }
    return { value: parsed, error: null };
  } catch (err) {
    return { value: null, error: `Некорректный JSON в ${file}: ${err.message}` };
  }
}

export async function resolveAgentConfig({ options = {}, dataDir, root = process.cwd() } = {}) {
  const configFile = options.configFile ? resolve(options.configFile) : join(dataDir, 'agent.json');
  const file = await readConfigFile(configFile);
  if (file.error) return disabledConfig(file.error);

  const source = file.value || {};
  let provider = String(
    options.provider ?? process.env.PIN_NOTE_AGENT ?? source.provider ?? 'auto'
  )
    .trim()
    .toLowerCase();

  if (provider === 'detect') provider = 'auto';
  if (provider === 'auto') {
    const dsh = await resolveDshLauncher();
    const codex = await commandExists('codex');
    const underDsh = Boolean(process.env.DSH_PROFILE || process.env.DSH_INSTALL_DIR);
    if (underDsh && dsh) provider = 'dsh';
    else if (codex) provider = 'codex';
    else if (dsh) provider = 'dsh';
    else provider = 'off';
  }

  if (provider === 'off') {
    return disabledConfig(
      'Агент выключен. Запусти PinNote с --agent dsh или --agent codex, либо создай .review/agent.json.'
    );
  }

  const preset = AGENT_PROVIDERS[provider];
  if (!preset) {
    return disabledConfig(
      `Неизвестный провайдер агента: ${provider}. Доступны: dsh, codex, custom, off.`
    );
  }

  let command = String(
    options.command ?? process.env.PIN_NOTE_AGENT_CMD ?? source.command ?? preset.command
  ).trim();
  let argsPrefix = stringArray(source.argsPrefix ?? options.argsPrefix, []);
  let env = {
    ...preset.env,
    ...stringObject(options.env),
    ...stringObject(source.env),
  };

  if (provider === 'dsh' && !(await commandExists(command))) {
    const launcher = await resolveDshLauncher();
    if (launcher) {
      command = launcher.command;
      argsPrefix = [...launcher.argsPrefix, ...argsPrefix];
      env = { ...launcher.env, ...env };
    }
  }

  if (!command) {
    return disabledConfig(
      'Не задана команда агента. Укажи --agent-command или поле command в .review/agent.json.',
      provider,
      preset.label
    );
  }
  if (!(await commandExists(command))) {
    return disabledConfig(
      `Команда агента не найдена: ${command}. Установи CLI или укажи --agent-command.`,
      provider,
      preset.label,
      { missingCommand: true }
    );
  }

  const model =
    provider === 'codex' ? optionalText(source.model ?? options.model, 200) : null;
  const args = withModel(
    stringArray(source.args ?? options.args, preset.args),
    model,
    provider
  );
  const resumeArgs = withModel(
    stringArray(source.resumeArgs ?? options.resumeArgs, preset.resumeArgs),
    model,
    provider
  );
  const autoRework = source.autoRework !== false && options.autoRework !== false;
  const timeoutMs = positiveNumber(source.timeoutMs ?? options.timeoutMs, DEFAULT_TIMEOUT);
  const label = String(source.label || preset.label || 'AI-агент');
  const sessionIdKeys = stringArray(
    source.sessionIdKeys ?? options.sessionIdKeys,
    preset.sessionIdKeys
  );

  return {
    enabled: true,
    provider,
    label,
    command,
    argsPrefix,
    args,
    resumeArgs,
    env,
    autoRework,
    timeoutMs,
    sessionIdKeys,
    model,
    reason: null,
    publicConfig() {
      return {
        enabled: true,
        provider,
        label,
        command: basename(command),
        autoRework,
        timeoutMs,
        model,
        reason: null,
      };
    },
  };
}

function shellQuote(value) {
  const text = String(value ?? '');
  if (!text || /^[\w@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function firstLine(value) {
  return (
    String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || ''
  );
}

async function fileHasEnvKey(file, key) {
  try {
    const raw = await readFile(file, 'utf8');
    return new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, 'm').test(raw);
  } catch {
    return false;
  }
}

function runProcess(command, args, { cwd, env, timeout = 12_000 } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolvePromise({ ok: false, code: null, error: err.message, stdout: '', stderr: '' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(result);
    };
    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore.
      }
      finish({
        ok: false,
        code: null,
        error: `таймаут ${Math.round(timeout / 1000)} с`,
        stdout,
        stderr,
      });
    }, timeout);
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-8000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.on('error', (err) => {
      finish({ ok: false, code: null, error: err.message, stdout, stderr });
    });
    child.on('close', (code) => {
      finish({ ok: code === 0, code, error: null, stdout, stderr });
    });
  });
}

export async function checkAgentReadiness(config, { root = process.cwd(), dataDir } = {}) {
  const checks = [];
  const push = (id, label, status, detail) => checks.push({ id, label, status, detail });
  let readinessModel = null;
  if (!config?.enabled) {
    return {
      ready: false,
      provider: config?.provider || 'off',
      label: config?.label || 'AI-агент',
      model: null,
      missingCommand: Boolean(config?.missingCommand),
      checks: [
        {
          id: 'config',
          label: 'Настройка агента',
          status: 'fail',
          detail: config?.reason || 'Агент не настроен',
        },
      ],
      summary: 'Агент не готов',
    };
  }

  if (config.provider === 'dsh') {
    const launcher = await runProcess(
      config.command,
      [...(config.argsPrefix || []), '--help'],
      { cwd: root, env: config.env }
    );
    if (launcher.ok) {
      push('command', 'Лаунчер DSH', 'ok', config.command);
    } else {
      push(
        'command',
        'Лаунчер DSH',
        'fail',
        firstLine(launcher.stderr) || launcher.error || `код ${launcher.code}`
      );
    }

    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
    const profileDir = join(dshHome, 'profiles', 'headless');
    const profileExists = await fileExists(profileDir);
    push(
      'profile',
      'Профиль headless',
      profileExists ? 'ok' : 'warn',
      profileExists ? profileDir : `${profileDir} (создастся при первом запуске)`
    );

    const envKey = Boolean(process.env.DEEPSEEK_API_KEY);
    const projectKey = await fileHasEnvKey(join(root, '.env'), 'DEEPSEEK_API_KEY');
    const homeKey = await fileHasEnvKey(join(dshHome, '.env'), 'DEEPSEEK_API_KEY');
    if (envKey || projectKey || homeKey) {
      push(
        'credentials',
        'Ключ модели',
        'ok',
        envKey ? 'DEEPSEEK_API_KEY в окружении' : projectKey ? '.env проекта' : `${dshHome}/.env`
      );
    } else {
      const patchFile = join(profileDir, 'cordis.patch.yml');
      let patch = '';
      try {
        patch = await readFile(patchFile, 'utf8');
      } catch {
        patch = '';
      }
      const savedAuth =
        /id:\s*(?:credentials|authorization|deepseek-account)[\s\S]{0,240}?disabled:\s*false/.test(
          patch
        );
      push(
        'credentials',
        'Ключ модели',
        savedAuth ? 'ok' : 'warn',
        savedAuth
          ? 'включён сохранённый вход DSH в профиле headless'
          : 'DEEPSEEK_API_KEY не найден; проверьте ключ или сохранённый вход'
      );
    }
    push(
      'model',
      'Модель DSH',
      'skip',
      'задаётся профилем headless (agent-default-model), не PinNote'
    );
    if (dataDir) {
      push('data', 'Каталог данных', 'ok', dataDir);
    }
  } else if (config.provider === 'codex') {
    const version = await runProcess(
      config.command,
      [...(config.argsPrefix || []), '--version'],
      { cwd: root, env: config.env }
    );
    if (version.ok) {
      push('command', 'Codex CLI', 'ok', firstLine(version.stdout) || config.command);
    } else {
      push(
        'command',
        'Codex CLI',
        'fail',
        firstLine(version.stderr) || version.error || `код ${version.code}`
      );
    }
    const login = await runProcess(
      config.command,
      [...(config.argsPrefix || []), 'login', 'status'],
      { cwd: root, env: config.env }
    );
    if (login.ok) {
      push('login', 'Авторизация Codex', 'ok', firstLine(login.stdout) || 'вход выполнен');
    } else {
      push(
        'login',
        'Авторизация Codex',
        'fail',
        firstLine(login.stderr) ||
          firstLine(login.stdout) ||
          login.error ||
          'войдите через codex login'
      );
    }

    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    let fileModel = null;
    try {
      const configText = await readFile(join(codexHome, 'config.toml'), 'utf8');
      const match = /^\s*model\s*=\s*["']([^"']+)["']/m.exec(configText);
      fileModel = match?.[1] || null;
    } catch {
      fileModel = null;
    }
    const effectiveModel = config.model || fileModel;
    readinessModel = effectiveModel;
    push(
      'model',
      'Модель Codex',
      effectiveModel ? 'ok' : 'warn',
      config.model
        ? `${config.model} (задана в agent.json)`
        : fileModel
          ? `${fileModel} (из ${codexHome}/config.toml)`
          : `не задана — Codex использует модель по умолчанию (${codexHome}/config.toml)`
    );
  } else {
    push('command', 'Команда агента', 'ok', config.command);
    push(
      'protocol',
      'Протокол custom-агента',
      'warn',
      'проверьте, что агент читает задание из stdin и печатает sessionId в JSON'
    );
    push('model', 'Модель', 'skip', 'зависит от custom-агента');
  }

  const failures = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  const summary = failures.length
    ? `Не готов: ${failures.map((check) => check.label).join(', ')}`
    : warnings.length
      ? 'Готов с предупреждениями'
      : 'Готов к работе';
  return {
    ready: failures.length === 0,
    provider: config.provider,
    label: config.label,
    command: basename(config.command),
    model: readinessModel,
    missingCommand: false,
    checks,
    summary,
  };
}

function cliHint(root, dataDir) {
  return {
    command: `node ${shellQuote(PIN_NOTE_BIN)}`,
    project: `--project ${shellQuote(root)}`,
    dataDir: `--data-dir ${shellQuote(dataDir)}`,
  };
}

function taskHeading(task, project, dataDir) {
  const tag = taskTag(task) || 'TASK';
  const description = String(task?.description || '').trim();
  return [
    `Проект: ${project}`,
    `Задача: ${tag}${description ? ` · ${description}` : ''}`,
    `Статус задачи: ${task?.status || 'active'}`,
    `Данные PinNote: ${join(dataDir, 'comments.json')}`,
    `Памятка: ${join(dataDir, 'AGENT.md')}`,
  ].join('\n');
}

function commonInstructions({ task, root, dataDir, providerLabel }) {
  const tag = taskTag(task) || 'TASK';
  const cli = cliHint(root, dataDir);
  return [
    `Ты — AI-агент, который выполняет задачу из панели комментариев PinNote (${providerLabel}).`,
    '',
    taskHeading(task, root, dataDir),
    '',
    'Работай в корне проекта. Внеси минимальные правки в исходники, не затрагивая несвязанные части.',
    'Не закрывай задачу и не удаляй комментарии: задача закрывается человеком.',
    'У комментария есть comment (первое сообщение заказчика) и thread[] — продолжение диалога.',
    'Прочитай весь thread[]: последний ответ заказчика может уточнять или отклонять предыдущую правку.',
    'Вложения лежат в attachments[] относительно каталога .review.',
    '',
    'Полезные команды:',
    `- открытые: ${cli.command} comments list --status open ${cli.project} ${cli.dataDir}`,
    `- отклонённые: ${cli.command} comments list --status rejected ${cli.project} ${cli.dataDir}`,
    `- отметить правку: ${cli.command} comments resolve <id> --resolution "..." ${cli.project} ${cli.dataDir}`,
    `- отправить задачу на проверку: ${cli.command} tasks submit ${tag} ${cli.project} ${cli.dataDir}`,
    '',
    'Если команда `pin-note` уже доступна в PATH, можно использовать её без полного пути.',
    'После правки переведи каждый разобранный комментарий в статус «На проверке» (`review`).',
    'В конце кратко перечисли изменённые файлы и выполненные команды.',
  ].join('\n');
}

export function buildTaskPrompt({ task, comments, project, dataDir, providerLabel = 'AI-агент' }) {
  const list = Array.isArray(comments) ? comments : [];
  const markdown = formatAllMarkdown(list, {
    project: basename(project) || 'website',
    updatedAt: new Date().toISOString(),
    task,
  }).trim();
  return [
    commonInstructions({ task, root: project, dataDir, providerLabel }),
    '',
    'Ниже — полное состояние задачи. Разбери открытые и отклонённые комментарии.',
    '',
    markdown,
    '',
  ].join('\n');
}

export function buildReworkPrompt({ task, comments, project, dataDir, providerLabel = 'AI-агент' }) {
  const list = Array.isArray(comments) ? comments : [];
  const rejected = list.filter((comment) => comment.status === 'rejected');
  const markdown = formatAllMarkdown(list, {
    project: basename(project) || 'website',
    updatedAt: new Date().toISOString(),
    task,
  }).trim();
  return [
    commonInstructions({ task, root: project, dataDir, providerLabel }),
    '',
    rejected.length > 0
      ? `Человек отклонил правки в ${rejected.length === 1 ? 'одном комментарии' : `${rejected.length} комментариях`}.`
      : 'Человек просит доработать задачу.',
    'Продолжай в этой же сессии задачи. В разделе «Отклонённые» указано, что именно не принято и почему.',
    'Исправь замечания, затем снова переведи исправленные комментарии в «На проверке».',
    '',
    markdown,
    '',
  ].join('\n');
}

export { PIN_NOTE_BIN };
