import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { commandExists } from './agent.mjs';

const INSTALLS = {
  codex: {
    label: 'Codex CLI',
    packageName: '@openai/codex',
    bin: 'codex',
  },
  dsh: {
    label: 'DeepSeek Harness',
    packageName: '@deepseek-ai/dsh',
    bin: 'dsh',
  },
};

export function installInfo(provider) {
  const spec = INSTALLS[provider];
  if (!spec) return null;
  return {
    ...spec,
    command: `npm install -g ${spec.packageName}`,
  };
}

export function installSupported(provider) {
  return Boolean(INSTALLS[provider]);
}

export function installCommandFor(provider) {
  return installInfo(provider)?.command || null;
}

function capture(command, args, { cwd, timeout = 12_000 } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolvePromise({ ok: false, error: err.message, stdout: '', stderr: '' });
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
      finish({ ok: false, error: 'таймаут', stdout, stderr });
    }, timeout);
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-4000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on('error', (err) => finish({ ok: false, error: err.message, stdout, stderr }));
    child.on('close', (code) =>
      finish({ ok: code === 0, code, error: null, stdout, stderr })
    );
  });
}

function candidatePaths(prefix, bin) {
  const candidates = [join(prefix, 'bin', bin), join(prefix, bin)];
  if (process.platform === 'win32') {
    candidates.push(join(prefix, `${bin}.cmd`), join(prefix, `${bin}.exe`));
    candidates.push(join(prefix, 'bin', `${bin}.cmd`), join(prefix, 'bin', `${bin}.exe`));
  }
  return candidates;
}

export async function installAgentCli(
  provider,
  { cwd = process.cwd(), log = console.log, env = process.env, quiet = false } = {}
) {
  const spec = INSTALLS[provider];
  if (!spec) {
    return { ok: false, error: `Автоустановка не поддерживается для ${provider}` };
  }
  if (!(await commandExists('npm'))) {
    return {
      ok: false,
      error: 'npm не найден. Установи Node.js/npm и повтори попытку.',
    };
  }

  log(`Устанавливаю ${spec.label}: npm install -g ${spec.packageName}`);
  const result = await new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn('npm', ['install', '-g', spec.packageName], {
        cwd,
        env,
        stdio: quiet ? 'ignore' : 'inherit',
      });
    } catch (err) {
      resolvePromise({ code: null, error: err.message });
      return;
    }
    child.on('error', (err) => resolvePromise({ code: null, error: err.message }));
    child.on('close', (code) => resolvePromise({ code }));
  });

  if (result.error) {
    return { ok: false, error: result.error };
  }
  if (result.code !== 0) {
    return {
      ok: false,
      error: `npm завершился с кодом ${result.code}. Проверь права на глобальную установку npm.`,
    };
  }

  if (await commandExists(spec.bin)) {
    return { ok: true, installed: true, command: spec.bin, packageName: spec.packageName };
  }

  const prefix = await capture('npm', ['prefix', '-g'], { cwd });
  if (prefix.ok) {
    for (const candidate of candidatePaths(prefix.stdout.trim(), spec.bin)) {
      if (await commandExists(candidate)) {
        return {
          ok: true,
          installed: true,
          command: candidate,
          packageName: spec.packageName,
        };
      }
    }
  }

  return {
    ok: true,
    installed: true,
    command: null,
    packageName: spec.packageName,
    warning: `Пакет установлен, но команда ${spec.bin} не попала в PATH. Укажи --agent-command вручную.`,
  };
}


export function loginInfo(provider) {
  if (provider !== 'codex') return null;
  return {
    label: 'Codex CLI',
    command: 'codex login',
    withApiKey: 'printenv OPENAI_API_KEY | codex login --with-api-key',
  };
}

export async function loginAgentCli({
  command,
  argsPrefix = [],
  cwd = process.cwd(),
  env = process.env,
  log = console.log,
} = {}) {
  if (!command) return { ok: false, error: 'Команда Codex не найдена' };
  log('Запускаю: codex login');
  const result = await new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, [...argsPrefix, 'login'], {
        cwd,
        env: { ...process.env, ...(env || {}) },
        stdio: 'inherit',
      });
    } catch (err) {
      resolvePromise({ code: null, error: err.message });
      return;
    }
    child.on('error', (err) => resolvePromise({ code: null, error: err.message }));
    child.on('close', (code) => resolvePromise({ code }));
  });
  if (result.error) return { ok: false, error: result.error };
  if (result.code !== 0) {
    return { ok: false, error: `codex login завершился с кодом ${result.code}` };
  }
  return { ok: true };
}
