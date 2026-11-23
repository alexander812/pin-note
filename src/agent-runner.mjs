import { spawn } from 'node:child_process';
import { taskTag } from './shared.mjs';

const MAX_LOG_LINES = 80;
const MAX_LOG_LINE = 4000;
const KILL_GRACE = 5000;

function nowIso() {
  return new Date().toISOString();
}

function trimLine(value) {
  const text = String(value ?? '').replace(/\r$/, '');
  return text.length > MAX_LOG_LINE ? `${text.slice(0, MAX_LOG_LINE - 1)}…` : text;
}

function activityText(value, limit = 120) {
  let text;
  if (Array.isArray(value)) text = value.join(' ');
  else if (value && typeof value === 'object') text = JSON.stringify(value);
  else text = String(value ?? '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function valueOf(object, keys) {
  if (!object || typeof object !== 'object') return '';
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return '';
}

export class AgentRunner {
  constructor({ root, store, config, onEvent = () => {} }) {
    this.root = root;
    this.store = store;
    this.config = config;
    this.onEvent = onEvent;
    this.runs = new Map();
    this.queues = new Map();
    this.closed = false;
  }

  get enabled() {
    return Boolean(this.config?.enabled);
  }

  publicConfig() {
    return this.config?.publicConfig ? this.config.publicConfig() : { enabled: false };
  }

  _ensureState(task) {
    let state = this.runs.get(task.id);
    if (!state) {
      state = {
        taskId: task.id,
        taskTag: taskTag(task) || 'TASK',
        sessionId: null,
        provider: this.config.provider,
        status: 'idle',
        mode: null,
        startedAt: null,
        finishedAt: null,
        error: null,
        exitCode: null,
        finalReason: null,
        cancelled: false,
        child: null,
        timer: null,
        settled: false,
        commentId: null,
        activity: null,
        activityAt: null,
        activityEmittedAt: 0,
        lastStderr: null,
        log: [],
      };
      this.runs.set(task.id, state);
    }
    state.taskTag = taskTag(task) || state.taskTag;
    if (
      !state.sessionId &&
      task.agentSessionId &&
      (!task.agentProvider || task.agentProvider === this.config.provider)
    ) {
      state.sessionId = task.agentSessionId;
    }
    return state;
  }

  _snapshot(state, { includeLog = false } = {}) {
    const queued = (this.queues.get(state.taskId) || []).length;
    const snapshot = {
      taskId: state.taskId,
      taskTag: state.taskTag,
      provider: this.config.provider,
      label: this.config.label,
      sessionId: state.sessionId || null,
      status: queued > 0 && state.status !== 'running' ? 'queued' : state.status,
      mode: state.mode,
      queued,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      error: state.error || null,
      exitCode: state.exitCode,
      finalReason: state.finalReason || null,
      commentId: state.commentId || null,
      activity: state.activity || null,
      activityAt: state.activityAt || null,
    };
    if (includeLog) snapshot.log = state.log.slice(-MAX_LOG_LINES);
    return snapshot;
  }

  snapshot(taskId, options = {}) {
    const state = this.runs.get(taskId);
    if (!state) {
      return {
        taskId,
        taskTag: '',
        provider: this.config.provider,
        label: this.config.label,
        sessionId: null,
        status: 'idle',
        mode: null,
        queued: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
        exitCode: null,
        finalReason: null,
        commentId: null,
        activity: null,
        activityAt: null,
        ...(options.includeLog ? { log: [] } : {}),
      };
    }
    return this._snapshot(state, options);
  }

  list() {
    return [...this.runs.values()].map((state) => this._snapshot(state, { includeLog: true }));
  }

  dispatch(task, { prompt, mode = 'task', commentId = null, replaceQueued = false } = {}) {
    if (!this.enabled) throw new Error('AI-агент не настроен');
    const text = String(prompt || '').trim();
    if (!text) throw new Error('Пустое задание для агента');
    const state = this._ensureState(task);
    const item = { task, prompt: text, mode, commentId };
    const queue = this.queues.get(task.id) || [];
    if (replaceQueued) {
      const kept = queue.filter((entry) => entry.mode !== mode);
      kept.push(item);
      this.queues.set(task.id, kept);
    } else {
      queue.push(item);
      this.queues.set(task.id, queue);
    }

    if (state.status === 'running') {
      this._emit(state);
    } else {
      this._startNext(task.id);
    }
    return this.snapshot(task.id);
  }

  cancel(taskId) {
    const state = this.runs.get(taskId);
    if (!state) return this.snapshot(taskId);
    this.queues.set(taskId, []);
    state.cancelled = true;
    state.error = null;
    if (state.child) {
      const child = state.child;
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore.
      }
      setTimeout(() => {
        if (state.child === child) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore.
          }
        }
      }, KILL_GRACE).unref?.();
    } else {
      state.status = 'idle';
      state.finishedAt = nowIso();
      this._emit(state);
    }
    return this.snapshot(taskId);
  }

  async reset(taskId) {
    const state = this.runs.get(taskId);
    if (state) state.removed = true;
    this.cancel(taskId);
    this.runs.delete(taskId);
    this.queues.delete(taskId);
    try {
      await this.store.setTaskAgent(taskId, {
        agentSessionId: null,
        agentProvider: null,
      });
    } catch {
      // The task may have been deleted; there is nothing left to reset.
    }
    const snapshot = this.snapshot(taskId);
    this.onEvent({ ...snapshot, reset: true });
    return snapshot;
  }

  async close() {
    this.closed = true;
    const waits = [];
    for (const state of this.runs.values()) {
      if (!state.child) continue;
      waits.push(
        new Promise((resolvePromise) => {
          state.child.once('close', resolvePromise);
          state.child.once('error', resolvePromise);
        })
      );
      this.cancel(state.taskId);
    }
    if (waits.length > 0) {
      await Promise.race([
        Promise.allSettled(waits),
        new Promise((resolvePromise) => setTimeout(resolvePromise, KILL_GRACE + 1000)),
      ]);
    }
  }

  _startNext(taskId) {
    if (this.closed) return;
    const state = this.runs.get(taskId);
    if (!state) return;
    const queue = this.queues.get(taskId) || [];
    if (queue.length === 0) {
      if (state.status === 'queued') state.status = 'idle';
      this._emit(state);
      return;
    }
    const item = queue.shift();
    this.queues.set(taskId, queue);
    state.log = [];
    state.error = null;
    state.finalReason = null;
    state.exitCode = null;
    state.cancelled = false;
    state.settled = false;
    state.mode = item.mode;
    state.commentId = item.commentId || null;
    state.activity = null;
    state.activityAt = null;
    state.activityEmittedAt = 0;
    state.lastStderr = null;
    state.startedAt = nowIso();
    state.finishedAt = null;
    state.status = 'running';

    const resume = Boolean(state.sessionId);
    const template = resume ? this.config.resumeArgs : this.config.args;
    const args = (template || []).map((arg) => this._renderArg(arg, state));
    const command = this.config.command;
    let child;
    try {
      child = spawn(command, [...(this.config.argsPrefix || []), ...args], {
        cwd: this.root,
        env: {
          ...process.env,
          ...(this.config.env || {}),
          PIN_NOTE_TASK_ID: state.taskId,
          PIN_NOTE_TASK_TAG: state.taskTag,
          PIN_NOTE_TASK_SESSION: state.sessionId || '',
          PIN_NOTE_PROJECT: this.root,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      state.status = 'error';
      state.error = err.message;
      state.finishedAt = nowIso();
      this.queues.set(taskId, []);
      this._emit(state);
      return;
    }

    state.child = child;
    this._emit(state);

    let stdoutBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      let index = stdoutBuffer.indexOf('\n');
      while (index !== -1) {
        const line = stdoutBuffer.slice(0, index);
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        this._handleOutput(state, line);
        index = stdoutBuffer.indexOf('\n');
      }
    });

    let stderrBuffer = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk;
      let index = stderrBuffer.indexOf('\n');
      while (index !== -1) {
        const line = stderrBuffer.slice(0, index);
        stderrBuffer = stderrBuffer.slice(index + 1);
        if (line.trim()) {
          this._pushLog(state, line, '[stderr]');
          state.lastStderr = trimLine(line).trim();
        }
        index = stderrBuffer.indexOf('\n');
      }
    });

    child.on('error', (err) => {
      if (state.settled) return;
      state.settled = true;
      this._clearTimer(state);
      state.child = null;
      state.status = 'error';
      state.error =
        err.code === 'ENOENT'
          ? `Команда агента не найдена: ${command}`
          : `Не удалось запустить агента: ${err.message}`;
      state.finishedAt = nowIso();
      this.queues.set(taskId, []);
      this._emit(state);
    });

    child.on('close', (code, signal) => {
      if (state.settled) return;
      state.settled = true;
      this._clearTimer(state);
      state.child = null;
      state.exitCode = code;
      state.finishedAt = nowIso();
      if (stdoutBuffer.trim()) this._handleOutput(state, stdoutBuffer);
      if (stderrBuffer.trim()) {
        this._pushLog(state, stderrBuffer, '[stderr]');
        state.lastStderr = trimLine(stderrBuffer).trim();
      }
      if (state.cancelled) {
        state.status = 'cancelled';
        if (!state.error) state.error = 'Агент остановлен';
      } else if (code === 0) {
        state.status = 'completed';
        state.error = null;
      } else {
        state.status = 'error';
        const details = [code !== null ? `код ${code}` : '', signal ? `сигнал ${signal}` : '']
          .filter(Boolean)
          .join(', ');
        state.error =
          state.error ||
          `Агент завершился с ошибкой${details ? ` (${details})` : ''}` +
            (state.lastStderr ? `: ${state.lastStderr}` : '');
      }
      this._emit(state);
      if ((this.queues.get(taskId) || []).length > 0 && !this.closed) {
        this._startNext(taskId);
      }
    });

    child.stdin.on('error', () => {
      // The agent may exit without consuming stdin; the close handler owns the outcome.
    });
    child.stdin.end(item.prompt);

    const timeout = Number(this.config.timeoutMs);
    if (Number.isFinite(timeout) && timeout > 0) {
      state.timer = setTimeout(() => {
        if (!state.child) return;
        this._pushLog(state, `[pin-note] превышено время выполнения (${timeout} мс)`);
        state.error = `Превышено время выполнения агента (${Math.round(timeout / 1000)} с)`;
        state.cancelled = true;
        try {
          state.child.kill('SIGTERM');
        } catch {
          // Ignore.
        }
      }, timeout);
      state.timer.unref?.();
    }
  }

  _handleOutput(state, line) {
    const text = trimLine(line);
    if (!text.trim()) return;
    this._pushLog(state, text);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

    const sessionId = this._findSessionId(payload, this.config.sessionIdKeys || []);
    if (sessionId && sessionId !== state.sessionId) {
      state.sessionId = sessionId;
      this._persistSession(state);
      this._emit(state);
    }
    const activity = this._activityFromEvent(payload);
    if (activity) this._setActivity(state, activity);
    if (payload.type === 'error' && typeof payload.message === 'string') {
      state.error = payload.message;
    }
    if (
      payload.type === 'final' &&
      payload.reason &&
      typeof payload.reason.kind === 'string' &&
      payload.reason.kind !== 'completed'
    ) {
      state.finalReason = payload.reason.kind;
    }
  }

  _activityFromEvent(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.type === 'status') {
      if (payload.phase === 'turn_start' || payload.phase === 'step_start') return 'Думает';
      if (payload.phase === 'turn_end') return 'Завершает';
      return null;
    }
    if (payload.type === 'thinking') return 'Думает';
    if (payload.type === 'text') return 'Пишет ответ';
    if (payload.type === 'tool_call') {
      return this._activityFromTool(payload.tool, payload.input);
    }
    if (payload.type === 'item.started' || payload.type === 'item.updated') {
      return this._activityFromCodexItem(payload.item);
    }
    if (payload.type === 'item.completed') {
      const item = payload.item;
      if (item?.type === 'command_execution') {
        return `Выполнил: ${activityText(item.command)}`;
      }
      if (item?.type === 'file_change') return 'Применил изменения';
      return null;
    }
    if (payload.type === 'turn.started') return 'Думает';
    if (payload.type === 'turn.completed') return 'Завершает';
    if (payload.type === 'error' || payload.type === 'turn.failed') return 'Ошибка';
    return null;
  }

  _activityFromTool(tool, input) {
    const name = String(tool || '').toLowerCase();
    const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const command = valueOf(args, ['command', 'cmd', 'shell_command', 'input']);
    const path = valueOf(args, ['path', 'file', 'file_path', 'filename']);
    const pattern = valueOf(args, ['pattern', 'query', 'q']);
    if (/bash|shell|exec|terminal|command/.test(name)) {
      return `Выполняет: ${activityText(command || tool)}`;
    }
    if (/read|cat/.test(name)) return `Читает: ${activityText(path || tool)}`;
    if (/write|edit|patch|apply|create/.test(name)) {
      return `Правит: ${activityText(path || tool)}`;
    }
    if (/grep|search/.test(name)) return `Ищет: ${activityText(pattern || path || tool)}`;
    if (/glob|list|find/.test(name)) return `Смотрит файлы: ${activityText(pattern || path || tool)}`;
    return `Вызывает: ${activityText(tool)}`;
  }

  _activityFromCodexItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.type === 'command_execution') {
      return `Выполняет: ${activityText(item.command)}`;
    }
    if (item.type === 'file_change') {
      const paths = Array.isArray(item.changes)
        ? item.changes.map((change) => change?.path).filter(Boolean).join(', ')
        : '';
      return `Правит: ${activityText(paths || 'файлы')}`;
    }
    if (item.type === 'mcp_tool_call') {
      return `Вызывает: ${activityText(`${item.server || 'mcp'}.${item.tool || ''}`)}`;
    }
    if (item.type === 'web_search') return `Ищет: ${activityText(item.query)}`;
    if (item.type === 'todo_list') return 'Планирует';
    if (item.type === 'reasoning') return 'Думает';
    if (item.type === 'agent_message') return 'Пишет ответ';
    if (item.type === 'error') return 'Ошибка';
    return null;
  }

  _setActivity(state, activity) {
    const text = activityText(activity);
    if (!text || text === state.activity) return;
    state.activity = text;
    state.activityAt = nowIso();
    const now = Date.now();
    if (now - (state.activityEmittedAt || 0) < 500) return;
    state.activityEmittedAt = now;
    this._emit(state);
  }

  _findSessionId(value, keys, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return null;
    for (const key of keys) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    }
    for (const item of Object.values(value)) {
      if (!item || typeof item !== 'object') continue;
      const found = this._findSessionId(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }

  _persistSession(state) {
    if (!state.sessionId) return;
    this.store
      .setTaskAgent(state.taskId, {
        agentSessionId: state.sessionId,
        agentProvider: this.config.provider,
      })
      .catch((err) => {
        this._pushLog(state, `[pin-note] не удалось сохранить сессию агента: ${err.message}`);
      });
  }

  _renderArg(value, state) {
    return String(value)
      .replaceAll('{sessionId}', state.sessionId || '')
      .replaceAll('{taskId}', state.taskId)
      .replaceAll('{taskTag}', state.taskTag)
      .replaceAll('{project}', this.root);
  }

  _pushLog(state, line, prefix = '') {
    const text = trimLine(line);
    if (!text.trim()) return;
    state.log.push(prefix ? `${prefix} ${text}` : text);
    if (state.log.length > MAX_LOG_LINES) {
      state.log.splice(0, state.log.length - MAX_LOG_LINES);
    }
  }

  _clearTimer(state) {
    if (!state.timer) return;
    clearTimeout(state.timer);
    state.timer = null;
  }

  _emit(state) {
    if (state.removed) return;
    const snapshot = this._snapshot(state);
    this.onEvent(snapshot);
  }
}
