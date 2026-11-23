import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runWizard } from '../src/wizard.mjs';

const roots = [];

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'pin-note-wizard-'));
  roots.push(root);
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Wizard</h1>\n', 'utf8');
  return root;
}

function wizardInput(answers) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  (async () => {
    for (const answer of answers) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!input.destroyed) input.write(`${answer}\n`);
    }
  })();
  return { input, output };
}

function promptedInput(steps) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  let buffer = '';
  let index = 0;
  output.on('data', (chunk) => {
    buffer = `${buffer}${chunk.toString()}`.slice(-500);
    if (index >= steps.length) return;
    const step = steps[index];
    if (!buffer.includes(step.match)) return;
    index += 1;
    buffer = '';
    setTimeout(() => {
      if (!input.destroyed) input.write(`${step.answer}\n`);
    }, 0);
  });
  return { input, output };
}

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop(), { recursive: true, force: true });
  }
});

test('wizard can select a project and disable the agent without starting the server', async () => {
  const root = await makeRoot();
  const { input, output } = promptedInput([
    { match: 'Папка проекта', answer: '' },
    { match: 'Выбор', answer: '4' },
    { match: 'Запустить review-сервер', answer: 'n' },
  ]);
  const result = await runWizard({
    cwd: root,
    input,
    output,
    log: () => {},
  });
  input.destroy();
  output.destroy();
  assert.equal(result, null);
  await assert.rejects(() => readFile(join(root, '.review', 'agent.json'), 'utf8'));
});

test('wizard checks a custom command and saves agent.json', async () => {
  const root = await makeRoot();
  const { input, output } = promptedInput([
    { match: 'Папка проекта', answer: '' },
    { match: 'Выбор', answer: '3' },
    { match: 'Команда агента', answer: process.execPath },
    { match: 'Использовать', answer: '1' },
    { match: 'Сохранить настройки', answer: 'y' },
    { match: 'Запустить review-сервер', answer: 'y' },
  ]);
  const result = await runWizard({
    cwd: root,
    input,
    output,
    log: () => {},
  });
  input.destroy();
  output.destroy();
  assert.ok(result);
  assert.equal(result.directory, root);
  assert.equal(result.agent.provider, 'custom');
  assert.equal(result.agent.command, process.execPath);
  assert.ok(result.agent.configFile);

  const saved = JSON.parse(await readFile(join(root, '.review', 'agent.json'), 'utf8'));
  assert.equal(saved.provider, 'custom');
  assert.equal(saved.command, process.execPath);
  assert.deepEqual(saved.args, ['-']);
  assert.deepEqual(saved.resumeArgs, ['{sessionId}', '-']);
  assert.equal(saved.autoRework, true);
});


test('wizard offers to install a missing agent CLI and saves the resolved command', async () => {
  const root = await makeRoot();
  const fakeBin = join(root, 'fake-bin');
  const prefix = join(root, 'npm-prefix');
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    join(fakeBin, 'npm'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'prefix' && args[1] === '-g') {
  console.log(process.env.FAKE_NPM_PREFIX);
  process.exit(0);
}
if (args[0] === 'install' && args[1] === '-g') {
  const bin = path.join(process.env.FAKE_NPM_PREFIX, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const source = [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "if (args.includes('--version')) { console.log('fake codex'); process.exit(0); }",
    "if (args[0] === 'login' && args[1] === 'status') { process.exit(0); }",
    'process.exit(0);',
    '',
  ].join('\\n');
  fs.writeFileSync(path.join(bin, 'codex'), source, { mode: 0o755 });
  process.exit(0);
}
process.exit(1);
`,
    { mode: 0o755 }
  );

  const toolBin = join(root, 'tool-bin');
  await mkdir(toolBin, { recursive: true });
  await symlink(process.execPath, join(toolBin, 'node'));
  const oldPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${toolBin}`;
  process.env.FAKE_NPM_PREFIX = prefix;
  try {
    const { input, output } = promptedInput([
      { match: 'Папка проекта', answer: '' },
      { match: 'Выбор', answer: '2' },
      { match: 'Модель Codex', answer: '8' },
      { match: 'Установить', answer: 'y' },
      { match: 'Использовать', answer: '1' },
      { match: 'Сохранить настройки', answer: 'y' },
      { match: 'Запустить review-сервер', answer: 'y' },
    ]);
    const result = await runWizard({
      cwd: root,
      input,
      output,
      log: () => {},
    });
    input.destroy();
    output.destroy();
    assert.ok(result);
    assert.equal(result.agent.provider, 'codex');
    assert.equal(result.agent.command, join(prefix, 'bin', 'codex'));
    assert.equal(result.agent.model, 'gpt-5.4');

    const saved = JSON.parse(await readFile(join(root, '.review', 'agent.json'), 'utf8'));
    assert.equal(saved.provider, 'codex');
    assert.equal(saved.command, join(prefix, 'bin', 'codex'));
    assert.equal(saved.model, 'gpt-5.4');
  } finally {
    process.env.PATH = oldPath;
    delete process.env.FAKE_NPM_PREFIX;
  }
});


test('wizard can keep the saved agent or switch to another choice', async () => {
  const root = await makeRoot();
  await mkdir(join(root, '.review'), { recursive: true });
  await writeFile(
    join(root, '.review', 'agent.json'),
    `${JSON.stringify({ provider: 'codex', model: 'gpt-6.1-sol' }, null, 2)}\n`,
    'utf8'
  );
  const { input, output } = promptedInput([
    { match: 'Папка проекта', answer: '' },
    { match: 'Использовать эти настройки', answer: '2' },
    { match: 'Выбор', answer: '4' },
    { match: 'Запустить review-сервер', answer: 'n' },
  ]);
  const result = await runWizard({
    cwd: root,
    input,
    output,
    log: () => {},
  });
  input.destroy();
  output.destroy();
  assert.equal(result, null);
});
