import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  CODEX_MODEL_CHOICES,
  checkAgentReadiness,
  resolveAgentConfig,
} from './agent.mjs';
import {
  installAgentCli,
  installInfo,
  installSupported,
  loginAgentCli,
  loginInfo,
} from './agent-install.mjs';

async function isDirectory(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function printReadiness(readiness, log) {
  const icons = { ok: '✓', warn: '!', fail: '✗', skip: '–' };
  log(`\n${readiness.summary}`);
  for (const check of readiness.checks) {
    log(`  ${icons[check.status] || '–'} ${check.label}: ${check.detail}`);
  }
}

async function chooseCodexModel(ask, log) {
  const customIndex = CODEX_MODEL_CHOICES.length + 1;
  log('\nМодель Codex (доступность зависит от тарифа ChatGPT или API-ключа):');
  log('  0) из ~/.codex/config.toml (по умолчанию)');
  CODEX_MODEL_CHOICES.forEach((model, index) => {
    log(`  ${index + 1}) ${model.id} — ${model.description}`);
  });
  log(`  ${customIndex}) другая модель — ввести id вручную`);
  log('  Если нужной модели нет в списке, выбери последний пункт.');

  while (true) {
    const answer = await ask('Модель Codex', '0');
    if (!answer || answer === '0') return '';
    if (!/^\d+$/.test(answer)) return answer;
    const choice = Number(answer);
    if (choice >= 1 && choice <= CODEX_MODEL_CHOICES.length) {
      return CODEX_MODEL_CHOICES[choice - 1].id;
    }
    if (choice === customIndex) {
      const custom = await ask('ID модели', '');
      if (custom) return custom;
      log('  Модель не введена.');
      continue;
    }
    log(`  Нет такого пункта: ${answer}`);
  }
}

function describeAgent(config, readiness) {
  const model = readiness?.model || config.model;
  const label = `${config.label || config.provider}${model ? ` + ${model}` : ''}`;
  return config.provider === 'custom' ? `${label} (${basename(config.command)})` : label;
}

function buildAgentFile(config) {
  if (config.provider === 'custom') {
    return {
      provider: 'custom',
      command: config.command,
      args: ['-'],
      resumeArgs: ['{sessionId}', '-'],
      autoRework: true,
      timeoutMs: 7_200_000,
    };
  }
  return {
    provider: config.provider,
    command: config.command,
    ...(config.model ? { model: config.model } : {}),
    autoRework: true,
    timeoutMs: 7_200_000,
  };
}

export async function runWizard({
  cwd = process.cwd(),
  dataDir: explicitDataDir = null,
  input = process.stdin,
  output = process.stdout,
  log = console.log,
} = {}) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Мастеру нужен интерактивный терминал');
  }

  const rl = createInterface({ input, output });
  const ask = async (prompt, defaultValue = '') => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
    return answer || defaultValue;
  };

  try {
    log('\nPinNote — мастер настройки\n');

    let root = resolve(await ask('Папка проекта', cwd));
    while (!(await isDirectory(root))) {
      log(`  Папка не найдена: ${root}`);
      root = resolve(await ask('Папка проекта', cwd));
    }
    const dataDir = explicitDataDir ? resolve(explicitDataDir) : join(root, '.review');
    const configFile = join(dataDir, 'agent.json');
    const detectFile = join(dataDir, '.agent-detect.json');

    let existing = null;
    try {
      existing = JSON.parse(await readFile(configFile, 'utf8'));
    } catch {
      existing = null;
    }

    let agentOptions = null;
    let saved = false;
    let finalConfig = null;
    let readiness = null;
    if (existing) {
      const current = await resolveAgentConfig({ options: { configFile }, dataDir, root });
      log(`\nНайден сохранённый агент: ${describeAgent(current, null)}`);
      log(`  Файл: ${configFile}`);
      const keep = await ask(
        '1) Использовать эти настройки  2) Выбрать другого агента или модель',
        '1'
      );
      if (!/^2/.test(keep)) {
        agentOptions = { configFile };
        saved = true;
      }
    }

    while (true) {
      if (!agentOptions) {
      const auto = await resolveAgentConfig({
        options: { configFile: detectFile },
        dataDir,
        root,
      });
      const dsh = await resolveAgentConfig({
        options: { provider: 'dsh', configFile: detectFile },
        dataDir,
        root,
      });
      const codex = await resolveAgentConfig({
        options: { provider: 'codex', configFile: detectFile },
        dataDir,
        root,
      });
      const defaultChoice = auto.enabled ? auto.provider : 'off';
      const defaultNumber =
        { dsh: '1', codex: '2', custom: '3', off: '4' }[defaultChoice] || '4';

      log('\nКакого агента использовать?');
      log(`  1) DeepSeek Harness — ${dsh.enabled ? 'найден' : 'не найден'}`);
      log(`  2) Codex CLI — ${codex.enabled ? 'найден' : 'не найден'}`);
      log('  3) Другая команда (custom)');
      log('  4) Без агента');
      const choiceRaw = await ask('Выбор', defaultNumber);
      const aliases = {
        '1': 'dsh',
        '2': 'codex',
        '3': 'custom',
        '4': 'off',
        dsh: 'dsh',
        codex: 'codex',
        custom: 'custom',
        off: 'off',
        нет: 'off',
      };
      const choice = aliases[choiceRaw.toLowerCase()];
      if (!choice) {
        log(`  Неизвестный выбор: ${choiceRaw}`);
        continue;
      }

      if (choice === 'custom') {
        let command = '';
        let config = null;
        while (!config) {
          command = await ask('Команда агента', process.env.PIN_NOTE_AGENT_CMD || '');
          if (!command) {
            log('  Укажи путь к исполняемой команде агента.');
            continue;
          }
          config = await resolveAgentConfig({
            options: { provider: 'custom', command, configFile: detectFile },
            dataDir,
            root,
          });
          if (!config.enabled) {
            log(`  ${config.reason}`);
            config = null;
          }
        }
        agentOptions = { provider: 'custom', command };
        log('  Задание будет передаваться в stdin; аргументы можно поправить в agent.json.');
      } else if (choice === 'codex') {
        const model = await chooseCodexModel(ask, log);
        agentOptions = { provider: 'codex', ...(model ? { model } : {}) };
        if (model) log(`  Будет использована модель: ${model}`);
      } else {
        agentOptions = { provider: choice };
      }
    }

    finalConfig = await resolveAgentConfig({
      options: agentOptions.configFile
        ? { configFile: agentOptions.configFile }
        : agentOptions,
      dataDir,
      root,
    });

    if (
      !finalConfig.enabled &&
      finalConfig.missingCommand &&
      installSupported(finalConfig.provider)
    ) {
      const info = installInfo(finalConfig.provider);
      const install = await ask(
        `${info.label} не найден. Установить ${info.command}? (Y/n)`,
        'y'
      );
      if (/^y/i.test(install)) {
        const result = await installAgentCli(finalConfig.provider, { cwd: root, log });
        if (!result.ok) {
          log(`  Не удалось установить: ${result.error}`);
        } else if (result.warning || !result.command) {
          log(`  ${result.warning || 'Установлено, но команда не найдена.'}`);
        } else {
          log(`  Установлено: ${result.command}`);
          agentOptions = { ...agentOptions, command: result.command };
          saved = false;
          finalConfig = await resolveAgentConfig({
            options: {
              ...agentOptions,
              provider: finalConfig.provider,
              configFile: undefined,
            },
            dataDir,
            root,
          });
        }
      }
    }

    readiness = null;
    if (finalConfig.provider !== 'off') {
      log('\nПроверяю готовность агента…');
      readiness = await checkAgentReadiness(finalConfig, { root, dataDir });
      printReadiness(readiness, log);

      const loginCheck = readiness.checks.find(
        (check) => check.id === 'login' && check.status === 'fail'
      );
      if (loginCheck && finalConfig.provider === 'codex') {
        const info = loginInfo('codex');
        log(`  Вход через ChatGPT: ${info.command}`);
        log(`  Вход по API-ключу: ${info.withApiKey}`);
        const login = await ask('Открыть вход Codex через ChatGPT сейчас? (y/N)', 'n');
        if (/^y/i.test(login)) {
          const result = await loginAgentCli({
            command: finalConfig.command,
            argsPrefix: finalConfig.argsPrefix,
            cwd: root,
            env: finalConfig.env,
            log,
          });
          if (!result.ok) {
            log(`  Не удалось войти: ${result.error}`);
          } else {
            readiness = await checkAgentReadiness(finalConfig, { root, dataDir });
            printReadiness(readiness, log);
          }
        }
      }

      if (!readiness.ready) {
        const go = await ask('Агент не готов. Продолжить всё равно? (y/N)', 'n');
        if (!/^y/i.test(go)) {
          agentOptions = null;
          saved = false;
          continue;
        }
      } else if (!saved) {
        const use = await ask(
          `Использовать ${describeAgent(finalConfig, readiness)}? (1 — да, 2 — выбрать другого агента/модель)`,
          '1'
        );
        if (/^2/.test(use) || /^n/i.test(use)) {
          agentOptions = null;
          saved = false;
          continue;
        }
      }

      if (!saved) {
        const agentFile = buildAgentFile(finalConfig);
        log(`\n  В ${configFile} будут сохранены параметры агента (не ключи и не токены):`);
        for (const line of JSON.stringify(agentFile, null, 2).split('\n')) {
          log(`    ${line}`);
        }
        log('  Вход Codex хранится отдельно: ~/.codex/auth.json или системный credential store.');
        const save = await ask(`Сохранить настройки в ${configFile}? (Y/n)`, 'y');
        if (!/^y/i.test(save)) {
          log('  Настройки не сохранены — они будут использованы только для этого запуска.');
        } else {
          await mkdir(dataDir, { recursive: true });
          await writeFile(
            configFile,
            `${JSON.stringify(agentFile, null, 2)}\n`,
            'utf8'
          );
          saved = true;
          log(`  Сохранено: ${configFile}`);
        }
      }
    } else {
      log('\nAI-агент выключен: панель будет только копить комментарии.');
    }
    break;
    }

    const start = await ask('\nЗапустить review-сервер? (Y/n)', 'y');
    if (!/^y/i.test(start)) {
      log(
        `\nОк. Запустить позже: pin-note ${JSON.stringify(root)} --agent ${
          finalConfig.provider || 'off'
        }`
      );
      return null;
    }

    return {
      directory: root,
      dataDir: dataDir === join(root, '.review') ? null : dataDir,
      agent: {
        ...agentOptions,
        ...(saved ? { configFile } : {}),
      },
    };
  } finally {
    rl.close();
  }
}
